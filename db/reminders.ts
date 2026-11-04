/**
 * Customer payment reminders: asking for one, queueing the scheduled ones, and reading their state (Invoice Pro).
 * Framework-free; takes an explicit `db`. The email itself is sent by app/lib/notify/reminder-job.ts through the
 * outbox (db/outbox.ts), which gives retries, back-off and one-runner-at-a-time claims.
 *
 * Duplicate protection is two layers deep: `invoice_reminders.dedupe_key` and the outbox row share one key, so a
 * repeated click, a retried request or two overlapping scheduled runs make one job; and the email goes out with that
 * key as the provider's idempotency key.
 *
 * The balance a reminder quotes is never stored here. It is read from the invoice (the payment ledger's cached
 * totals) when the email is built, so a payment recorded after the reminder was queued is what the job sees.
 */

import { sql } from 'drizzle-orm';
import {
  DAILY_REMINDER_LIMIT,
  DEFAULT_SCHEDULE_DAYS,
  SCHEDULE_GRACE_DAYS,
  manualKey,
  reminderEligibility,
  type Eligibility,
  type SkipReason,
} from '../app/lib/invoice/reminders.ts';
import type { Db } from './links.ts';
import { enqueue } from './outbox.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export type ReminderFactsRow = {
  invoiceId: string;
  userId: string;
  kind: string;
  status: 'unpaid' | 'paid';
  total: number;
  amountPaid: number;
  dueDate: string | null;
  currency: string;
  number: string;
  clientName: string;
  sellerName: string;
  email: string;
  paused: boolean;
  promisedOn: string | null;
};

/** What the eligibility check and the email need, for one of the owner's invoices; null if it isn't theirs. */
export async function reminderFacts(db: Db, userId: string, invoiceId: string): Promise<ReminderFactsRow | null> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select i.id, i.user_id, i.kind, i.status, i.total::float8 as total, i.amount_paid::float8 as amount_paid, i.due_date::text as due_date,
             i.currency, i.number, i.client_name,
             coalesce(i.data->'seller'->>'name', '') as seller_name,
             coalesce(nullif(trim(i.data->'client'->>'email'), ''), nullif(trim(c.email), ''), '') as email,
             coalesce(f.reminders_paused, false) as paused, f.promised_on::text as promised_on
        from invoices i
        left join customers c on c.id = i.customer_id and c.user_id = i.user_id
        left join invoice_followups f on f.invoice_id = i.id
       where i.id = ${invoiceId}::uuid and i.user_id = ${userId}::uuid`),
  );
  const r = rows[0];
  if (!r) return null;
  return {
    invoiceId: String(r.id),
    userId: String(r.user_id),
    kind: String(r.kind),
    status: r.status === 'paid' ? 'paid' : 'unpaid',
    total: Number(r.total),
    amountPaid: Number(r.amount_paid),
    dueDate: r.due_date ? String(r.due_date) : null,
    currency: String(r.currency),
    number: String(r.number),
    clientName: String(r.client_name),
    sellerName: String(r.seller_name),
    email: String(r.email),
    paused: r.paused === true,
    promisedOn: r.promised_on ? String(r.promised_on) : null,
  };
}

/** How many reminders this account has queued so far on the India calendar day `istDate` (YYYY-MM-DD). */
export async function remindersToday(db: Db, userId: string, istDate: string): Promise<number> {
  const rows = rowsOf<{ n: number }>(
    await db.execute(sql`
      select count(*)::int as n from invoice_reminders
       where user_id = ${userId}::uuid and created_at >= (${istDate}::date::timestamp at time zone 'Asia/Kolkata')`),
  );
  return rows[0]?.n ?? 0;
}

export type RequestResult =
  | { ok: true; reminderId: string; alreadyQueued: boolean }
  | { ok: false; reason: SkipReason | 'daily_limit' };

/**
 * The owner asks to remind the customer now. Checks the invoice is theirs and eligible, the daily limit, then writes
 * the reminder and its job under one key. Asking again the same India day returns the same reminder
 * (`alreadyQueued`), not a second email. `note` is the owner's optional words for the email.
 */
export async function requestManualReminder(db: Db, userId: string, invoiceId: string, istDate: string, note = ''): Promise<RequestResult> {
  const facts = await reminderFacts(db, userId, invoiceId);
  if (!facts) return { ok: false, reason: 'not_found' };
  const e = reminderEligibility(facts, istDate, false);
  if (!e.ok) return { ok: false, reason: e.reason };

  const key = manualKey(invoiceId, istDate);
  const existing = rowsOf<{ id: string }>(await db.execute(sql`select id from invoice_reminders where dedupe_key = ${key}`))[0];
  if (!existing && (await remindersToday(db, userId, istDate)) >= DAILY_REMINDER_LIMIT) return { ok: false, reason: 'daily_limit' };

  const inserted = rowsOf<{ id: string }>(
    await db.execute(sql`
      insert into invoice_reminders (user_id, invoice_id, kind, dedupe_key) values (${userId}::uuid, ${invoiceId}::uuid, 'manual', ${key})
      on conflict (dedupe_key) do nothing returning id`),
  )[0];
  const reminderId = inserted?.id ?? existing?.id ?? rowsOf<{ id: string }>(await db.execute(sql`select id from invoice_reminders where dedupe_key = ${key}`))[0]?.id;
  if (!reminderId) return { ok: false, reason: 'not_found' };
  // Always (re)enqueue: it is a no-op when the job exists, and it heals a request that wrote the reminder but died before the job.
  await enqueue(db, 'invoice_reminder', key, { reminderId, note: note.trim().slice(0, 300) });
  return { ok: true, reminderId, alreadyQueued: !inserted };
}

/** Eligibility for display (the button state), with no side effects. */
export async function reminderEligibilityFor(db: Db, userId: string, invoiceId: string, today: string): Promise<Eligibility | { ok: false; reason: 'not_found' }> {
  const facts = await reminderFacts(db, userId, invoiceId);
  return facts ? reminderEligibility(facts, today, false) : { ok: false, reason: 'not_found' };
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type ReminderSettings = { enabled: boolean; days: number[] };

export async function getReminderSettings(db: Db, userId: string): Promise<ReminderSettings> {
  const r = rowsOf<{ scheduled_enabled: boolean; days_after_due: number[] }>(
    await db.execute(sql`select scheduled_enabled, days_after_due from reminder_prefs where user_id = ${userId}::uuid`),
  )[0];
  return r ? { enabled: r.scheduled_enabled, days: r.days_after_due } : { enabled: false, days: [...DEFAULT_SCHEDULE_DAYS] };
}

export async function saveReminderSettings(db: Db, userId: string, s: ReminderSettings): Promise<void> {
  const arr = `{${s.days.join(',')}}`;
  await db.execute(sql`
    insert into reminder_prefs (user_id, scheduled_enabled, days_after_due) values (${userId}::uuid, ${s.enabled}, ${arr}::integer[])
    on conflict (user_id) do update set scheduled_enabled = excluded.scheduled_enabled, days_after_due = excluded.days_after_due, updated_at = now()`);
}

// ─── Scheduled queueing ──────────────────────────────────────────────────────

/** Most reminders queued by one scheduled run, across all accounts (the rest are picked up by the next run). */
export const SCHEDULED_QUEUE_BATCH = 200;

/**
 * Queues today's scheduled reminders for every account that turned them on. One statement. An invoice qualifies when
 * it is an open invoice with a due date, a customer email, no pause and no unexpired promised date, and a step day
 * (days after due) falls today or within the grace window. A step is queued once per invoice ever (its key), and an
 * account never exceeds the daily limit. Eligibility is checked again when the job runs. Returns how many were added.
 */
export async function enqueueScheduledReminders(db: Db, today: string): Promise<number> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      with sent_today as (
        select user_id, count(*)::int as n from invoice_reminders
         where created_at >= (${today}::date::timestamp at time zone 'Asia/Kolkata') group by user_id
      ), cand as (
        select i.id as invoice_id, i.user_id, s.step,
               row_number() over (partition by i.user_id order by i.due_date, i.id) as rn
          from reminder_prefs p
          join invoices i on i.user_id = p.user_id and i.kind = 'invoice' and i.status = 'unpaid' and i.total > i.amount_paid and i.due_date is not null
          left join customers c on c.id = i.customer_id and c.user_id = i.user_id
          left join invoice_followups f on f.invoice_id = i.id
          cross join lateral (
            select max(d) as step from unnest(p.days_after_due) as d
             where (${today}::date - i.due_date) between d and d + ${SCHEDULE_GRACE_DAYS}
          ) s
         where p.scheduled_enabled and s.step is not null
           and coalesce(f.reminders_paused, false) = false
           and (f.promised_on is null or f.promised_on < ${today}::date)
           and coalesce(nullif(trim(i.data->'client'->>'email'), ''), nullif(trim(c.email), ''), '') <> ''
      ), picked as (
        select cand.* from cand left join sent_today t on t.user_id = cand.user_id
         where cand.rn <= greatest(0, ${DAILY_REMINDER_LIMIT} - coalesce(t.n, 0))
         limit ${SCHEDULED_QUEUE_BATCH}
      ), ins as (
        insert into invoice_reminders (user_id, invoice_id, kind, step, dedupe_key)
        select user_id, invoice_id, 'scheduled', step, 'reminder:step:' || invoice_id::text || ':' || step::text from picked
        on conflict (dedupe_key) do nothing
        returning id, dedupe_key
      )
      insert into outbox (kind, dedupe_key, payload)
      select 'invoice_reminder', dedupe_key, jsonb_build_object('reminderId', id) from ins
      on conflict (dedupe_key) do nothing
      returning id`),
  );
  return rows.length;
}

// ─── Reading state ───────────────────────────────────────────────────────────

/** What the owner sees for one reminder. `failed` = we gave up (all retries used); `retrying` = a send failed and will be tried again. */
export type ReminderState = 'sending' | 'retrying' | 'failed' | 'waiting' | 'sent' | 'skipped';

export type ReminderRow = {
  id: string;
  kind: 'manual' | 'scheduled';
  step: number | null;
  state: ReminderState;
  /** A short reason: why it was skipped, or the failure code. */
  reason: string;
  createdAt: string;
  finishedAt: string | null;
  attempts: number;
  /** When the next automatic retry happens, for `retrying`. */
  nextAttemptAt: string | null;
};

export function reminderState(status: string, outboxStatus: string | null): ReminderState {
  if (status === 'sent') return 'sent';
  if (status === 'skipped') return 'skipped';
  switch (outboxStatus) {
    case 'dead':
      return 'failed';
    case 'failed':
      return 'retrying';
    case 'blocked':
      return 'waiting';
    default:
      return 'sending';
  }
}

export async function listReminders(db: Db, userId: string, invoiceId: string, limit = 20): Promise<ReminderRow[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select r.id, r.kind, r.step, r.status, r.reason, r.created_at, r.finished_at,
             o.status as o_status, o.attempts, o.last_error, o.next_attempt_at
        from invoice_reminders r left join outbox o on o.dedupe_key = r.dedupe_key
       where r.user_id = ${userId}::uuid and r.invoice_id = ${invoiceId}::uuid
       order by r.created_at desc limit ${limit}`),
  );
  return rows.map((r) => {
    const state = reminderState(String(r.status), r.o_status ? String(r.o_status) : null);
    return {
      id: String(r.id),
      kind: r.kind === 'scheduled' ? 'scheduled' : 'manual',
      step: r.step === null ? null : Number(r.step),
      state,
      reason: state === 'skipped' ? String(r.reason) : state === 'sent' || state === 'sending' ? '' : String(r.last_error ?? ''),
      createdAt: new Date(String(r.created_at)).toISOString(),
      finishedAt: r.finished_at ? new Date(String(r.finished_at)).toISOString() : null,
      attempts: Number(r.attempts ?? 0),
      nextAttemptAt: state === 'retrying' && r.next_attempt_at ? new Date(String(r.next_attempt_at)).toISOString() : null,
    };
  });
}

/**
 * "Try again" for a reminder that gave up (or is waiting on a setting): puts its job back in the queue with a fresh
 * set of attempts. Only the owner's own reminder, and only one that is not already sent or skipped. The job re-checks
 * the invoice, so a reminder for an invoice paid in the meantime is skipped, not sent.
 */
export async function retryReminder(db: Db, userId: string, reminderId: string): Promise<'queued' | 'not_retryable' | 'not_found'> {
  const r = rowsOf<{ status: string; dedupe_key: string }>(
    await db.execute(sql`select status, dedupe_key from invoice_reminders where id = ${reminderId}::uuid and user_id = ${userId}::uuid`),
  )[0];
  if (!r) return 'not_found';
  if (r.status !== 'queued') return 'not_retryable';
  const moved = rowsOf<{ id: string }>(
    await db.execute(sql`
      update outbox set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = '', claimed_at = null, updated_at = now()
       where dedupe_key = ${r.dedupe_key} and status in ('dead', 'blocked', 'failed') returning id`),
  );
  return moved.length > 0 ? 'queued' : 'not_retryable';
}

/** Marks a reminder done without a send, with the reason. Only a queued reminder changes. */
export async function markReminderSkipped(db: Db, reminderId: string, reason: string): Promise<void> {
  await db.execute(sql`update invoice_reminders set status = 'skipped', reason = ${reason.slice(0, 40)}, finished_at = now() where id = ${reminderId}::uuid and status = 'queued'`);
}

export async function markReminderSent(db: Db, reminderId: string): Promise<void> {
  await db.execute(sql`update invoice_reminders set status = 'sent', reason = '', finished_at = now() where id = ${reminderId}::uuid and status = 'queued'`);
}
