/**
 * Automatic recurring invoices: the rules around the schedule in app/lib/invoice/recurring.ts. Pure.
 *
 * Dates are plain India calendar dates (YYYY-MM-DD, Asia/Kolkata, no time of day): the 15-minute cron makes
 * the invoice on the first run of the due day. A run that was missed makes one invoice for the latest period
 * and moves on (`nextRecurAfter`), never a pile of back-dated ones.
 */

import { isIsoDate } from './recurring';

export const MAX_AUTO_RUNS = 500;
/** An end date may be at most this many days ahead. */
export const MAX_END_DAYS = 3660;

export type AutoState = 'off' | 'active' | 'paused' | 'ended';

export type AutoFacts = { hasSchedule: boolean; autoCreate: boolean; paused: boolean; endedAt: string | null };

/** What the owner sees: off (prompt only), running, paused, or finished by itself. */
export function autoState(f: AutoFacts): AutoState {
  if (!f.hasSchedule || !f.autoCreate) return 'off';
  if (f.endedAt) return 'ended';
  return f.paused ? 'paused' : 'active';
}

export const autoKey = (invoiceId: string, dueOn: string): string => `recur:${invoiceId}:${dueOn}`;

export type AutoSettings = { autoCreate: boolean; paused: boolean; endsOn: string | null; maxRuns: number | null };
export type AutoCheck = { ok: true; value: AutoSettings } | { ok: false; message: string };

const DAY_MS = 86_400_000;
const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/** Validates what the owner chose. An end date must be today or later (and not absurdly far), a run count 1 to 500. */
export function checkAutoSettings(raw: { autoCreate?: unknown; paused?: unknown; endsOn?: unknown; maxRuns?: unknown }, today: string): AutoCheck {
  if (typeof raw.autoCreate !== 'boolean') return { ok: false, message: 'Choose whether to create invoices automatically.' };
  const paused = raw.paused === undefined ? false : raw.paused;
  if (typeof paused !== 'boolean') return { ok: false, message: 'That pause setting is not valid.' };
  let endsOn: string | null = null;
  if (raw.endsOn !== undefined && raw.endsOn !== null && raw.endsOn !== '') {
    if (!isIsoDate(raw.endsOn)) return { ok: false, message: 'Pick a real end date.' };
    if (raw.endsOn < today) return { ok: false, message: 'The end date can’t be in the past.' };
    if (dayNumber(raw.endsOn) - dayNumber(today) > MAX_END_DAYS) return { ok: false, message: 'That end date is too far away.' };
    endsOn = raw.endsOn;
  }
  let maxRuns: number | null = null;
  if (raw.maxRuns !== undefined && raw.maxRuns !== null && raw.maxRuns !== '') {
    if (typeof raw.maxRuns !== 'number' || !Number.isInteger(raw.maxRuns) || raw.maxRuns < 1 || raw.maxRuns > MAX_AUTO_RUNS) return { ok: false, message: `Choose 1 to ${MAX_AUTO_RUNS} invoices.` };
    maxRuns = raw.maxRuns;
  }
  return { ok: true, value: { autoCreate: raw.autoCreate, paused, endsOn, maxRuns } };
}

/** Has the schedule run its course after `runsDone` automatic invoices, with the next one due on `nextDue`? */
export function hasEnded(a: { endsOn: string | null; maxRuns: number | null; runsDone: number }, nextDue: string | null): boolean {
  if (a.maxRuns !== null && a.runsDone >= a.maxRuns) return true;
  return a.endsOn !== null && nextDue !== null && nextDue > a.endsOn;
}
