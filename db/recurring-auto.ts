/**
 * Automatic recurring invoices: settings, the run history, and queueing what is due (Invoice Pro).
 * Framework-free; takes an explicit `db`; every query is scoped to the owner. The schedule itself
 * (`invoices.recur_every` / `recur_next`) and the copy-making (`recurInvoice`, which moves the schedule on in one
 * compare-and-set) stay where they were; this adds "do it for me" and a record of each run.
 */

import { sql } from 'drizzle-orm';
import { autoState, hasEnded, type AutoSettings, type AutoState } from '../app/lib/invoice/recurring-auto.ts';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export type RunRow = { id: string; dueOn: string; status: 'started' | 'created' | 'skipped' | 'failed'; reason: string; createdInvoiceId: string | null; createdNumber: string | null; at: string };
export type Automation = {
  recurEvery: string | null;
  recurNext: string | null;
  autoCreate: boolean;
  paused: boolean;
  endsOn: string | null;
  maxRuns: number | null;
  runsDone: number;
  state: AutoState;
  runs: RunRow[];
};

/** The owner's recurring invoice with its automation and last runs; null if it is not theirs (or is a quotation). */
export async function getAutomation(db: Db, userId: string, invoiceId: string): Promise<Automation | null> {
  const r = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select i.recur_every, i.recur_next::text as recur_next, coalesce(a.auto_create, false) as auto_create, coalesce(a.paused, false) as paused,
             a.ends_on::text as ends_on, a.max_runs, coalesce(a.runs_done, 0) as runs_done, a.ended_at
        from invoices i left join recurring_automation a on a.invoice_id = i.id
       where i.id = ${invoiceId}::uuid and i.user_id = ${userId}::uuid and i.kind = 'invoice'`),
  )[0];
  if (!r) return null;
  const runs = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select r.id, r.due_on::text as due_on, r.status, r.reason, r.created_invoice_id, c.number as created_number, coalesce(r.finished_at, r.created_at) as at
        from recurring_runs r left join invoices c on c.id = r.created_invoice_id
       where r.invoice_id = ${invoiceId}::uuid and r.user_id = ${userId}::uuid order by r.due_on desc limit 12`),
  );
  return {
    recurEvery: r.recur_every ? String(r.recur_every) : null,
    recurNext: r.recur_next ? String(r.recur_next) : null,
    autoCreate: r.auto_create === true,
    paused: r.paused === true,
    endsOn: r.ends_on ? String(r.ends_on) : null,
    maxRuns: r.max_runs === null ? null : Number(r.max_runs),
    runsDone: Number(r.runs_done),
    state: autoState({ hasSchedule: !!r.recur_every, autoCreate: r.auto_create === true, paused: r.paused === true, endedAt: r.ended_at ? String(r.ended_at) : null }),
    runs: runs.map((x): RunRow => {
      const status = String(x.status);
      // A run that started and was never finished (the worker died) is shown as failed, not as still going.
      const interrupted = status === 'started';
      return {
        id: String(x.id),
        dueOn: String(x.due_on),
        status: interrupted ? 'failed' : (status as RunRow['status']),
        reason: interrupted ? 'interrupted' : String(x.reason),
        createdInvoiceId: x.created_invoice_id ? String(x.created_invoice_id) : null,
        createdNumber: x.created_number ? String(x.created_number) : null,
        at: new Date(String(x.at)).toISOString(),
      };
    }),
  };
}

export type SaveResult = { ok: true } | { ok: false; reason: 'not_found' | 'no_schedule' };

/** Saves the automation settings. Turning automatic creation on needs the invoice to have a schedule. Saving again clears "ended". */
export async function saveAutomation(db: Db, userId: string, invoiceId: string, s: AutoSettings): Promise<SaveResult> {
  const inv = rowsOf<{ recur_every: string | null }>(await db.execute(sql`select recur_every from invoices where id = ${invoiceId}::uuid and user_id = ${userId}::uuid and kind = 'invoice'`))[0];
  if (!inv) return { ok: false, reason: 'not_found' };
  if (s.autoCreate && !inv.recur_every) return { ok: false, reason: 'no_schedule' };
  await db.execute(sql`
    insert into recurring_automation (invoice_id, user_id, auto_create, paused, ends_on, max_runs)
    values (${invoiceId}::uuid, ${userId}::uuid, ${s.autoCreate}, ${s.paused}, ${s.endsOn}::date, ${s.maxRuns})
    on conflict (invoice_id) do update set auto_create = excluded.auto_create, paused = excluded.paused, ends_on = excluded.ends_on,
      max_runs = excluded.max_runs, ended_at = null, updated_at = now()
     where recurring_automation.user_id = ${userId}::uuid`);
  return { ok: true };
}

/** Most automatic invoices queued by one cron run (the rest wait for the next one). */
export const RECURRING_QUEUE_BATCH = 50;

/**
 * Queues the invoices due today (India date) for every automatic schedule that is on, not paused, not ended and
 * inside its end date and run count. One statement; the key is (invoice, due date), so running it again, or two
 * runs overlapping, queues each period once. Returns how many were added.
 */
export async function enqueueDueRecurring(db: Db, today: string): Promise<number> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      insert into outbox (kind, dedupe_key, payload)
      select 'recurring_invoice', 'recur:' || i.id::text || ':' || i.recur_next::text, jsonb_build_object('invoiceId', i.id, 'dueOn', i.recur_next::text)
        from recurring_automation a join invoices i on i.id = a.invoice_id
       where a.auto_create and not a.paused and a.ended_at is null and i.kind = 'invoice' and i.recur_every is not null
         and i.recur_next is not null and i.recur_next <= ${today}::date
         and (a.ends_on is null or i.recur_next <= a.ends_on) and (a.max_runs is null or a.runs_done < a.max_runs)
       order by i.recur_next limit ${RECURRING_QUEUE_BATCH}
      on conflict (dedupe_key) do nothing
      returning id`),
  );
  return rows.length;
}

export type ClaimedRun = { runId: string } | { skip: string };

/** Claims this period's run. A second claim for the same period is refused, so the invoice is made once. */
export async function claimRun(db: Db, userId: string, invoiceId: string, dueOn: string): Promise<ClaimedRun> {
  const got = rowsOf<{ id: string }>(
    await db.execute(sql`insert into recurring_runs (user_id, invoice_id, due_on) values (${userId}::uuid, ${invoiceId}::uuid, ${dueOn}::date) on conflict (invoice_id, due_on) do nothing returning id`),
  )[0];
  if (got) return { runId: got.id };
  return { skip: 'already_claimed' };
}

export async function finishRun(db: Db, runId: string, r: { status: 'created' | 'skipped' | 'failed'; reason?: string; createdInvoiceId?: string }): Promise<void> {
  await db.execute(sql`update recurring_runs set status = ${r.status}, reason = ${(r.reason ?? '').slice(0, 40)}, created_invoice_id = ${r.createdInvoiceId ?? null}::uuid, finished_at = now() where id = ${runId}::uuid`);
}

/** After an invoice was made: count it, and finish the schedule if its end date or run count is reached. */
export async function countRun(db: Db, invoiceId: string, nextDue: string | null): Promise<boolean> {
  const a = rowsOf<{ ends_on: string | null; max_runs: number | null; runs_done: number }>(
    await db.execute(sql`update recurring_automation set runs_done = runs_done + 1, updated_at = now() where invoice_id = ${invoiceId}::uuid returning ends_on::text as ends_on, max_runs, runs_done`),
  )[0];
  if (!a) return false;
  const ended = hasEnded({ endsOn: a.ends_on, maxRuns: a.max_runs, runsDone: a.runs_done }, nextDue);
  if (ended) await db.execute(sql`update recurring_automation set ended_at = now() where invoice_id = ${invoiceId}::uuid`);
  return ended;
}
