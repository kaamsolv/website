/**
 * Payment promises: "the customer said they will pay on 15 Nov". The owner's own note, never a payment. Pure.
 *
 * A promise is separate from the invoice's due date and from the ledger. It never changes what is owed or the invoice's
 * status; it only says what the customer said, and whether that date has passed with money still outstanding.
 */

import { isIsoDate } from './recurring';

export const MAX_PROMISE_NOTE = 200;
/** A promised date may be at most this far ahead. */
export const MAX_PROMISE_DAYS_AHEAD = 366;

export type PromiseStatus =
  /** No promise recorded. */
  | 'none'
  /** Promised for today or a later day. */
  | 'upcoming'
  /** The promised day has passed and a balance is still outstanding. */
  | 'overdue'
  /** A promise was recorded, but nothing is owed now (the invoice has since been paid). */
  | 'settled';

const DAY_MS = 86_400_000;
const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/** Where a promise stands. `outstanding` is the ledger balance (app/lib/invoice/payments.ts), not anything stored with the promise. */
export function promiseStatus(promisedOn: string | null | undefined, outstanding: number, today: string): PromiseStatus {
  if (!promisedOn) return 'none';
  if (outstanding <= 0) return 'settled';
  return promisedOn >= today ? 'upcoming' : 'overdue';
}

export type PromiseCheck = { ok: true; date: string; note: string } | { ok: false; message: string };

/** The date must be a real calendar day from today to a year ahead (a promise in the past isn't a promise). The note is trimmed and capped. */
export function checkPromise(date: unknown, note: unknown, today: string): PromiseCheck {
  if (!isIsoDate(date)) return { ok: false, message: 'Pick the date the customer promised to pay.' };
  if (date < today) return { ok: false, message: 'Pick today or a later date.' };
  if (dayNumber(date) - dayNumber(today) > MAX_PROMISE_DAYS_AHEAD) return { ok: false, message: 'That date is more than a year away.' };
  const n = typeof note === 'string' ? note.trim() : '';
  if (n.length > MAX_PROMISE_NOTE) return { ok: false, message: `Keep the note under ${MAX_PROMISE_NOTE} characters.` };
  return { ok: true, date, note: n };
}
