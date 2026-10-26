/**
 * The invoice payment ledger — data access (docs/products/invoice-generator.md → "Payments").
 *
 * Like the rest of db/, every query is scoped by `user_id` (callers pass the signed-in user's id, never one from
 * the request), so another user's invoice or payment is simply "not found". The rules that must never bend —
 * owner, currency, never more than the invoice total, immutable amounts, no fully-paid-with-a-balance — live in
 * triggers (migration 0010) so they hold however a row gets here; this file maps their errors to plain results.
 *
 * Neon over HTTP can't hold a transaction open across statements, so each change is one statement: recording is a
 * single `INSERT … SELECT … ON CONFLICT DO NOTHING` (a repeated idempotency key records nothing and returns the
 * original), voiding is a single `UPDATE`. The triggers do the rest under the invoice row's lock.
 */

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  centsToDecimal,
  ledgerErrorOf,
  toCents,
  type PaymentInput,
  type PaymentMethod,
} from '../app/lib/invoice/payments.ts';
import type { Db } from './links.ts';
import { customers, invoicePayments, invoices } from './schema.ts';

export type PaymentEntry = {
  id: string;
  amount: number;
  currency: string;
  paidOn: string;
  method: PaymentMethod;
  reference: string;
  note: string;
  voidedAt: Date | null;
  voidReason: string;
  createdAt: Date;
};

const ENTRY_COLUMNS = {
  id: invoicePayments.id,
  amount: invoicePayments.amount,
  currency: invoicePayments.currency,
  paidOn: invoicePayments.paidOn,
  method: invoicePayments.method,
  reference: invoicePayments.reference,
  note: invoicePayments.note,
  voidedAt: invoicePayments.voidedAt,
  voidReason: invoicePayments.voidReason,
  createdAt: invoicePayments.createdAt,
};

type EntryRow = Omit<PaymentEntry, 'method'> & { method: string };
const asEntry = (r: EntryRow): PaymentEntry => ({ ...r, method: r.method as PaymentMethod });

export type InvoicePaymentFacts = {
  id: string;
  number: string;
  clientName: string;
  currency: string;
  total: number;
  issueDate: string | null;
  dueDate: string | null;
  status: 'unpaid' | 'paid';
  amountPaid: number;
  /** The saved customer this was billed to, when it was picked from the saved list (never matched by name). */
  customerId: string | null;
  customerName: string | null;
};

export type InvoicePayments = { invoice: InvoicePaymentFacts; payments: PaymentEntry[] };

/** One invoice (never a quotation) with its whole ledger, voided entries included, oldest first. Null if it isn't this user's. */
export async function getInvoicePayments(db: Db, userId: string, invoiceId: string): Promise<InvoicePayments | null> {
  const [invoice] = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      clientName: invoices.clientName,
      currency: invoices.currency,
      total: invoices.total,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      status: invoices.status,
      amountPaid: invoices.amountPaid,
      customerId: invoices.customerId,
      customerName: customers.name,
    })
    .from(invoices)
    .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.userId, userId)))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId), eq(invoices.kind, 'invoice')));
  if (!invoice) return null;
  const payments = await db
    .select(ENTRY_COLUMNS)
    .from(invoicePayments)
    .where(and(eq(invoicePayments.invoiceId, invoiceId), eq(invoicePayments.userId, userId)))
    .orderBy(asc(invoicePayments.paidOn), asc(invoicePayments.createdAt));
  return { invoice, payments: payments.map(asEntry) };
}

export type RecordFailure =
  /** Not this user's invoice, or it is a quotation. */
  | 'not_found'
  /** Marked paid before payments were recorded: say so (`reconcile`) before replacing that with real entries. */
  | 'legacy'
  /** More than the invoice still owes. */
  | 'exceeds'
  | 'date'
  | 'cap'
  | 'currency'
  /** The same idempotency key was used for a different payment. */
  | 'key_reused';

export type RecordResult =
  | { ok: true; payment: PaymentEntry; duplicate: boolean }
  | { ok: false; reason: RecordFailure; outstanding?: number };

/**
 * Record a payment. Safe to repeat: the form sends one `clientKey` per payment, so a double click, a retry after a
 * dropped connection or a second tab returns the payment already recorded (`duplicate: true`) instead of a second one.
 */
export async function recordPayment(db: Db, userId: string, invoiceId: string, input: PaymentInput): Promise<RecordResult> {
  const [inv] = await db
    .select({ status: invoices.status, amountPaid: invoices.amountPaid, kind: invoices.kind })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
  if (!inv || inv.kind !== 'invoice') return { ok: false, reason: 'not_found' };
  if (inv.status === 'paid' && toCents(inv.amountPaid) === 0 && !input.reconcile) return { ok: false, reason: 'legacy' };

  let insertedId: string | undefined;
  try {
    const result = await db.execute<{ id: string }>(sql`
      insert into ${invoicePayments} (user_id, invoice_id, amount, currency, paid_on, method, reference, note, client_key)
      select i.user_id, i.id, ${centsToDecimal(input.amountCents)}::numeric, i.currency, ${input.paidOn}::date,
             ${input.method}, ${input.reference}, ${input.note}, ${input.clientKey}::uuid
      from ${invoices} i
      where i.id = ${invoiceId}::uuid and i.user_id = ${userId}::uuid and i.kind = 'invoice'
      on conflict (user_id, client_key) do nothing
      returning id`);
    insertedId = (result as unknown as { rows: { id: string }[] }).rows[0]?.id;
  } catch (e) {
    switch (ledgerErrorOf(e)) {
      case 'payment_exceeds': {
        const [now] = await db
          .select({ total: invoices.total, amountPaid: invoices.amountPaid, status: invoices.status })
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
        const settled = !now || (now.status === 'paid' && toCents(now.amountPaid) > 0);
        return { ok: false, reason: 'exceeds', outstanding: settled ? 0 : Math.max(0, toCents(now.total) - toCents(now.amountPaid)) / 100 };
      }
      case 'payment_date':
        return { ok: false, reason: 'date' };
      case 'payment_cap':
        return { ok: false, reason: 'cap' };
      case 'payment_currency':
        return { ok: false, reason: 'currency' };
      case 'payment_owner':
      case 'payment_quote':
        return { ok: false, reason: 'not_found' };
      default:
        throw e;
    }
  }

  if (insertedId) {
    const [row] = await db.select(ENTRY_COLUMNS).from(invoicePayments).where(and(eq(invoicePayments.id, insertedId), eq(invoicePayments.userId, userId)));
    return { ok: true, payment: asEntry(row), duplicate: false };
  }

  // Nothing inserted: this key was used before (or the invoice vanished a moment ago).
  const [prior] = await db
    .select({ ...ENTRY_COLUMNS, invoiceId: invoicePayments.invoiceId })
    .from(invoicePayments)
    .where(and(eq(invoicePayments.userId, userId), eq(invoicePayments.clientKey, input.clientKey)));
  if (!prior) return { ok: false, reason: 'not_found' };
  const same = prior.invoiceId === invoiceId && toCents(prior.amount) === input.amountCents && prior.paidOn === input.paidOn && prior.method === input.method;
  if (!same) return { ok: false, reason: 'key_reused' };
  const { invoiceId: _invoiceId, ...entry } = prior;
  return { ok: true, payment: asEntry(entry), duplicate: true };
}

export type VoidResult = { ok: true; alreadyVoided: boolean } | { ok: false; reason: 'not_found' };

/**
 * Take a mistaken payment out of the totals. The entry stays in the history, marked voided with the reason; the
 * invoice gets the amount back (and moves from Paid to Partially paid / Unpaid). Repeating it is harmless.
 */
export async function voidPayment(db: Db, userId: string, invoiceId: string, paymentId: string, reason: string): Promise<VoidResult> {
  const rows = await db
    .update(invoicePayments)
    .set({ voidedAt: new Date(), voidReason: reason })
    .where(
      and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, invoiceId), eq(invoicePayments.userId, userId), isNull(invoicePayments.voidedAt)),
    )
    .returning({ id: invoicePayments.id });
  if (rows.length) return { ok: true, alreadyVoided: false };
  const [exists] = await db
    .select({ id: invoicePayments.id })
    .from(invoicePayments)
    .where(and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, invoiceId), eq(invoicePayments.userId, userId)));
  return exists ? { ok: true, alreadyVoided: true } : { ok: false, reason: 'not_found' };
}

export type EditResult = { ok: true } | { ok: false; reason: 'not_found' | 'voided' };

/** The only in-place change a recorded payment allows: its reference and note. */
export async function editPayment(
  db: Db,
  userId: string,
  invoiceId: string,
  paymentId: string,
  patch: { reference: string; note: string },
): Promise<EditResult> {
  const where = and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, invoiceId), eq(invoicePayments.userId, userId));
  try {
    const rows = await db
      .update(invoicePayments)
      .set({ reference: patch.reference, note: patch.note })
      .where(and(where, isNull(invoicePayments.voidedAt)))
      .returning({ id: invoicePayments.id });
    if (rows.length) return { ok: true };
  } catch (e) {
    if (ledgerErrorOf(e) === 'payment_voided') return { ok: false, reason: 'voided' };
    throw e;
  }
  const [row] = await db.select({ voidedAt: invoicePayments.voidedAt }).from(invoicePayments).where(where);
  return row ? { ok: false, reason: 'voided' } : { ok: false, reason: 'not_found' };
}
