/**
 * When the receivables summary is due (billing M3). Pure.
 *
 * Everything is India time (Asia/Kolkata, no daylight saving): weekly summaries go out on Monday, monthly on the
 * 1st, from 9 am. The scheduled trigger runs every 15 minutes; a summary is queued once per account per period
 * (the queue's own duplicate key), so being called many times on that day sends it once. A day the trigger didn't run
 * at all is a summary skipped, not a pile-up the next day.
 */

export type Cadence = 'off' | 'weekly' | 'monthly';

export const CADENCES: readonly Cadence[] = ['off', 'weekly', 'monthly'];
export const isCadence = (v: unknown): v is Cadence => v === 'off' || v === 'weekly' || v === 'monthly';

/** The hour (India time) from which a due summary is sent. */
export const SEND_FROM_HOUR = 9;

export type IstClock = {
  /** YYYY-MM-DD in India. */
  date: string;
  hour: number;
  /** 1 = Monday … 7 = Sunday. */
  isoDow: number;
  day: number;
  weekKey: string;
  monthKey: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO 8601 week (Monday start; week 1 holds the year's first Thursday): "2026-W44". */
export function isoWeekKey(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

export function istClock(now: Date): IstClock {
  // en-CA gives YYYY-MM-DD; hour12:false can print "24" at midnight, so the hour is read separately and folded.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(now)) % 24;
  const [y, m, d] = date.split('-').map(Number);
  const isoDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return { date, hour, isoDow, day: d, weekKey: isoWeekKey(y, m, d), monthKey: `${y}-${pad(m)}` };
}

/** Which summaries are due right now, with the period key that makes each one unique. */
export function dueCadences(now: Date): { cadence: Exclude<Cadence, 'off'>; key: string }[] {
  const c = istClock(now);
  if (c.hour < SEND_FROM_HOUR) return [];
  const due: { cadence: Exclude<Cadence, 'off'>; key: string }[] = [];
  if (c.isoDow === 1) due.push({ cadence: 'weekly', key: c.weekKey });
  if (c.day === 1) due.push({ cadence: 'monthly', key: c.monthKey });
  return due;
}
