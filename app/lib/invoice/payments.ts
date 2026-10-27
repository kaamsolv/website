/**
 * Payments received against an invoice — the maths and the checks, framework-free
 * (used by the API, db/ and the browser; tested in test/payments.test.mts).
 *
 * Money is worked in whole paise (integers) so 0.1 + 0.2 never sneaks in; the
 * database holds numeric(14,2). The ledger itself lives in `invoice_payments`
 * (migration 0010); `invoices.amount_paid` is its running total, kept by triggers.
 *
 * The one status model (docs/products/invoice-generator.md → "Payments"):
 *
 *   unpaid       no payment received (status 'unpaid', amount_paid 0)
 *   partial      some received, balance outstanding (status 'unpaid', amount_paid > 0)
 *   paid         ledger covers the total (status 'paid', amount_paid >= total)
 *   marked_paid  legacy: marked paid before the ledger existed, no payments on record
 *                (status 'paid', amount_paid 0). Settled, but not counted as money received.
 */

import { isIsoDate } from './recurring';

export const PAYMENT_METHODS = ['upi', 'bank', 'cash', 'card', 'cheque', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI',
  bank: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

export const MAX_REFERENCE = 100;
export const MAX_NOTE = 400;
export const MAX_VOID_REASON = 200;
/** An invoice holds at most this many ledger entries, voided ones included (also enforced by the database). */
export const MAX_PAYMENTS_PER_INVOICE = 200;

export const isPaymentMethod = (v: unknown): v is PaymentMethod => typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);

export const toCents = (amount: number): number => Math.round((amount + Number.EPSILON) * 100);
export const fromCents = (cents: number): number => cents / 100;
/** "5000.00" — the exact decimal text handed to the database. */
export const centsToDecimal = (cents: number): string => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

export type PaymentState = 'unpaid' | 'partial' | 'paid' | 'marked_paid';

export type PaymentFacts = {
  total: number;
  amountPaid: number;
  status: 'unpaid' | 'paid';
  dueDate?: string | null;
};

export type PaymentSummary = {
  state: PaymentState;
  /** Money actually received through the ledger. Zero for a legacy "marked paid" invoice. */
  received: number;
  /** What is still owed. Zero for paid and marked-paid invoices. */
  outstanding: number;
  /** Whole percent of the total received (never 100 until it is), or null when it can't be told (marked paid, or a zero total). */
  percent: number | null;
  /** Past its due date with a balance outstanding. */
  overdue: boolean;
};

/** The single place that turns stored numbers into a payment state, balance and percentage. */
export function paymentSummary(f: PaymentFacts, today: string): PaymentSummary {
  const totalC = toCents(f.total);
  const paidC = toCents(f.amountPaid);
  const state: PaymentState =
    f.status === 'paid' ? (paidC === 0 ? 'marked_paid' : 'paid') : paidC > 0 ? 'partial' : 'unpaid';
  const outstandingC = state === 'paid' || state === 'marked_paid' ? 0 : Math.max(0, totalC - paidC);
  const percent =
    state === 'marked_paid' || totalC <= 0 ? null : state === 'paid' ? 100 : Math.min(99, Math.floor((paidC * 100) / totalC));
  return {
    state,
    received: fromCents(paidC),
    outstanding: fromCents(outstandingC),
    percent,
    overdue: outstandingC > 0 && !!f.dueDate && f.dueDate < today,
  };
}

export const STATE_LABELS: Record<PaymentState, string> = {
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  paid: 'Paid',
  marked_paid: 'Marked paid',
};

/** "12.50", "1,25,000", "₹500" → whole paise; anything else (more than 2 decimals, negatives, junk) is refused. */
export function parseAmount(input: unknown): { ok: true; cents: number } | { ok: false; message: string } {
  const raw = typeof input === 'number' ? (Number.isFinite(input) ? String(input) : '') : typeof input === 'string' ? input : '';
  const cleaned = raw.replace(/[,\s₹$€£]/g, '').replace(/^(INR|USD|EUR|GBP|AED)/i, '');
  if (cleaned === '') return { ok: false, message: 'Enter the amount you received.' };
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(cleaned)) return { ok: false, message: 'Amounts are numbers with up to 2 decimals, like 5000 or 4999.50.' };
  const cents = Math.round(Number(cleaned) * 100);
  if (cents <= 0) return { ok: false, message: 'The amount has to be more than zero.' };
  return { ok: true, cents };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export type PaymentInput = {
  amountCents: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string;
  note: string;
  clientKey: string;
  /** The caller knows this invoice was only "marked paid" and is replacing that with real entries. */
  reconcile: boolean;
};

/** Checks the body of "record a payment". The balance and ownership checks happen in the database, not here. */
export function cleanPaymentInput(raw: unknown, today: string): { ok: true; value: PaymentInput } | { ok: false; message: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const amount = parseAmount(b.amount);
  if (!amount.ok) return amount;
  if (!isIsoDate(b.paidOn)) return { ok: false, message: 'Pick the date you received it.' };
  if (b.paidOn < '2000-01-01') return { ok: false, message: 'That date looks too far back. Check the year.' };
  if (b.paidOn > today) return { ok: false, message: 'The date received can’t be in the future.' };
  if (!isPaymentMethod(b.method)) return { ok: false, message: 'Choose how you were paid.' };
  if (typeof b.reference === 'string' && b.reference.trim().length > MAX_REFERENCE) return { ok: false, message: `The reference can be up to ${MAX_REFERENCE} characters.` };
  if (typeof b.note === 'string' && b.note.trim().length > MAX_NOTE) return { ok: false, message: `The note can be up to ${MAX_NOTE} characters.` };
  if (typeof b.clientKey !== 'string' || !UUID_RE.test(b.clientKey)) return { ok: false, message: 'That form is out of date. Refresh the page and try again.' };
  return {
    ok: true,
    value: {
      amountCents: amount.cents,
      paidOn: b.paidOn,
      method: b.method,
      reference: clean(b.reference, MAX_REFERENCE),
      note: clean(b.note, MAX_NOTE),
      clientKey: b.clientKey.toLowerCase(),
      reconcile: b.reconcile === true,
    },
  };
}

/** Body of "edit a payment": only the reference and note can change after it is recorded. */
export function cleanPaymentEdit(raw: unknown): { ok: true; reference: string; note: string } | { ok: false; message: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof b.reference !== 'string' || typeof b.note !== 'string') return { ok: false, message: 'That couldn’t be read.' };
  if (b.reference.trim().length > MAX_REFERENCE) return { ok: false, message: `The reference can be up to ${MAX_REFERENCE} characters.` };
  if (b.note.trim().length > MAX_NOTE) return { ok: false, message: `The note can be up to ${MAX_NOTE} characters.` };
  return { ok: true, reference: clean(b.reference, MAX_REFERENCE), note: clean(b.note, MAX_NOTE) };
}

export function cleanVoidReason(raw: unknown): { ok: true; reason: string } | { ok: false; message: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (b.reason !== undefined && typeof b.reason !== 'string') return { ok: false, message: 'That couldn’t be read.' };
  if (typeof b.reason === 'string' && b.reason.trim().length > MAX_VOID_REASON) return { ok: false, message: `The reason can be up to ${MAX_VOID_REASON} characters.` };
  return { ok: true, reason: clean(b.reason, MAX_VOID_REASON) };
}

/** Names the database's triggers raise (db/migrations/0010). */
export type LedgerError =
  | 'payment_exceeds'
  | 'payment_owner'
  | 'payment_quote'
  | 'payment_currency'
  | 'payment_date'
  | 'payment_cap'
  | 'payment_immutable'
  | 'payment_voided'
  | 'invoice_has_payments'
  | 'invoice_total_below_paid'
  | 'invoice_unsettled';

const LEDGER_ERRORS: readonly LedgerError[] = [
  'payment_exceeds', 'payment_owner', 'payment_quote', 'payment_currency', 'payment_date', 'payment_cap',
  'payment_immutable', 'payment_voided', 'invoice_has_payments', 'invoice_total_below_paid', 'invoice_unsettled',
];

/** Which ledger rule a database error is about (the drivers wrap the message differently, so look through `cause`). */
export function ledgerErrorOf(err: unknown): LedgerError | null {
  for (let e: unknown = err, i = 0; e && i < 4; i += 1, e = (e as { cause?: unknown }).cause) {
    const text = String((e as { message?: unknown }).message ?? '');
    const hit = LEDGER_ERRORS.find((code) => text.includes(code));
    if (hit) return hit;
  }
  return null;
}
