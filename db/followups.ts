/**
 * Collections follow-up for an invoice: the promised payment date and note, and the per-invoice reminder pause.
 * Framework-free; takes an explicit `db`. Every query is scoped to the owner's `user_id`.
 *
 * Nothing here touches the payment ledger or an invoice's status or balance. A promise can only be recorded
 * against an invoice that still has a balance outstanding (read from the ledger's own totals), and it is
 * reported as `settled` once that balance reaches zero, so there is one source of truth for what is owed.
 */

import { sql } from 'drizzle-orm';
import { checkPromise, promiseStatus, type PromiseStatus } from '../app/lib/invoice/followup.ts';
import { paymentSummary } from '../app/lib/invoice/payments.ts';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export type Followup = { promisedOn: string | null; promiseNote: string; promiseSetAt: string | null; remindersPaused: boolean; status: PromiseStatus; outstanding: number };

/** The invoice's follow-up as the owner sees it; null if the invoice isn't theirs. */
export async function getFollowup(db: Db, userId: string, invoiceId: string, today: string): Promise<Followup | null> {
  const r = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select i.kind, i.status, i.total::float8 as total, i.amount_paid::float8 as amount_paid, i.due_date::text as due_date,
             f.promised_on::text as promised_on, coalesce(f.promise_note, '') as note, f.promise_set_at, coalesce(f.reminders_paused, false) as paused
        from invoices i left join invoice_followups f on f.invoice_id = i.id
       where i.id = ${invoiceId}::uuid and i.user_id = ${userId}::uuid`),
  )[0];
  if (!r) return null;
  const outstanding = r.kind === 'invoice' ? paymentSummary({ total: Number(r.total), amountPaid: Number(r.amount_paid), status: r.status === 'paid' ? 'paid' : 'unpaid', dueDate: r.due_date ? String(r.due_date) : null }, today).outstanding : 0;
  const promisedOn = r.promised_on ? String(r.promised_on) : null;
  return {
    promisedOn,
    promiseNote: String(r.note),
    promiseSetAt: r.promise_set_at ? new Date(String(r.promise_set_at)).toISOString() : null,
    remindersPaused: r.paused === true,
    status: promiseStatus(promisedOn, outstanding, today),
    outstanding,
  };
}

export type PromiseResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_open' | 'invalid'; message?: string };

/**
 * Records or updates the promised date (and clears nothing else). Refused unless the invoice is the owner's, is an
 * invoice (not a quotation) and still has a balance owed.
 */
export async function setPromise(db: Db, userId: string, invoiceId: string, date: unknown, note: unknown, today: string): Promise<PromiseResult> {
  const check = checkPromise(date, note, today);
  if (!check.ok) return { ok: false, reason: 'invalid', message: check.message };
  const f = await getFollowup(db, userId, invoiceId, today);
  if (!f) return { ok: false, reason: 'not_found' };
  if (f.outstanding <= 0) return { ok: false, reason: 'not_open' };
  await db.execute(sql`
    insert into invoice_followups (invoice_id, user_id, promised_on, promise_note, promise_set_at)
    values (${invoiceId}::uuid, ${userId}::uuid, ${check.date}::date, ${check.note}, now())
    on conflict (invoice_id) do update set promised_on = excluded.promised_on, promise_note = excluded.promise_note, promise_set_at = now(), updated_at = now()
      where invoice_followups.user_id = ${userId}::uuid`);
  return { ok: true };
}

/** Clears the promise (the note goes with it). Always allowed for the owner, paid or not. */
export async function clearPromise(db: Db, userId: string, invoiceId: string): Promise<boolean> {
  const owned = rowsOf<{ id: string }>(await db.execute(sql`select id from invoices where id = ${invoiceId}::uuid and user_id = ${userId}::uuid`)).length > 0;
  if (!owned) return false;
  await db.execute(sql`update invoice_followups set promised_on = null, promise_note = '', promise_set_at = null, updated_at = now() where invoice_id = ${invoiceId}::uuid and user_id = ${userId}::uuid`);
  return true;
}

/** Pauses or resumes scheduled reminders for one invoice. A manual reminder is not affected. */
export async function setRemindersPaused(db: Db, userId: string, invoiceId: string, paused: boolean): Promise<boolean> {
  const owned = rowsOf<{ id: string }>(await db.execute(sql`select id from invoices where id = ${invoiceId}::uuid and user_id = ${userId}::uuid`)).length > 0;
  if (!owned) return false;
  await db.execute(sql`
    insert into invoice_followups (invoice_id, user_id, reminders_paused) values (${invoiceId}::uuid, ${userId}::uuid, ${paused})
    on conflict (invoice_id) do update set reminders_paused = excluded.reminders_paused, updated_at = now() where invoice_followups.user_id = ${userId}::uuid`);
  return true;
}

export type PromiseRow = { invoiceId: string; number: string; clientName: string; currency: string; outstanding: number; dueDate: string | null; promisedOn: string; note: string; status: 'upcoming' | 'overdue' };

/**
 * The owner's open invoices that carry a promised date, missed promises first (oldest date first), then upcoming
 * ones by date. Only invoices that still owe something are listed; the balance is the ledger's. Capped.
 */
export async function listPromises(db: Db, userId: string, today: string, limit = 50): Promise<PromiseRow[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select i.id, i.number, i.client_name, i.currency, (i.total - i.amount_paid)::float8 as outstanding, i.due_date::text as due_date,
             f.promised_on::text as promised_on, f.promise_note as note
        from invoice_followups f join invoices i on i.id = f.invoice_id
       where f.user_id = ${userId}::uuid and i.user_id = ${userId}::uuid and f.promised_on is not null
         and i.kind = 'invoice' and i.status = 'unpaid' and i.total > i.amount_paid
       order by (f.promised_on < ${today}::date) desc, f.promised_on asc, i.number asc
       limit ${limit}`),
  );
  return rows.map((r) => ({
    invoiceId: String(r.id),
    number: String(r.number),
    clientName: String(r.client_name),
    currency: String(r.currency),
    outstanding: Number(r.outstanding),
    dueDate: r.due_date ? String(r.due_date) : null,
    promisedOn: String(r.promised_on),
    note: String(r.note ?? ''),
    status: String(r.promised_on) < today ? 'overdue' : 'upcoming',
  }));
}
