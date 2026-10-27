/**
 * Length of service, for the Gratuity Calculator. Framework-free: plain year-month-day numbers, no
 * `Date` time-zone surprises.
 *
 * Conventions (docs/products/gratuity-calculator.md):
 *  - The last working day counts as worked: joined 1 Jan 2020, last day 31 Dec 2024 = exactly 5 years.
 *    So service runs from the joining date up to, but not including, the day after the last working day.
 *  - Months are counted from the joining date and clamp to the month end, like the Age Calculator:
 *    29 Feb 2020 + 12 months = 28 Feb 2021.
 *  - Under the Act, service in the last year "in excess of six months" counts as a full year. Exactly six
 *    months does not.
 */

export type Ymd = { year: number; month: number; day: number };

export const MIN_YEAR = 1950;
export const MAX_YEAR = 2100;

const DAY_MS = 86_400_000;

const utc = (d: Ymd) => Date.UTC(d.year, d.month - 1, d.day);

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-10-27" → a date, or null when it isn't a real date between 1950 and 2100. */
export function parseYmd(text: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text ?? '').trim());
  if (!m) return null;
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (d.year < MIN_YEAR || d.year > MAX_YEAR || d.month < 1 || d.month > 12 || d.day < 1 || d.day > daysInMonth(d.year, d.month)) return null;
  return d;
}

/** -1, 0 or 1. */
export function compareYmd(a: Ymd, b: Ymd): number {
  return Math.sign(utc(a) - utc(b));
}

export function addDays(d: Ymd, n: number): Ymd {
  const t = new Date(utc(d) + n * DAY_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** Adds whole months; the day clamps to the end of a shorter month (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(d: Ymd, n: number): Ymd {
  const index = d.year * 12 + (d.month - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) };
}

export function daysBetween(from: Ymd, to: Ymd): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "31 Dec 2024" */
export function formatYmd(d: Ymd): string {
  return `${d.day} ${MONTH_SHORT[d.month - 1]} ${d.year}`;
}

export type Service = { years: number; months: number; days: number; totalDays: number };

/** Whole months from `joined` up to (not including) `endExclusive`. */
function wholeMonths(joined: Ymd, endExclusive: Ymd): number {
  let months = (endExclusive.year - joined.year) * 12 + (endExclusive.month - joined.month);
  while (months > 0 && compareYmd(addMonths(joined, months), endExclusive) > 0) months--;
  return Math.max(0, months);
}

/** The day after the last working day: where service stops counting. */
export const endExclusive = (lastDay: Ymd): Ymd => addDays(lastDay, 1);

/** Years, months and days of service, last working day included. Empty (all zero) if the last day is before joining. */
export function servicePeriod(joined: Ymd, lastDay: Ymd): Service {
  const end = endExclusive(lastDay);
  if (compareYmd(end, joined) <= 0) return { years: 0, months: 0, days: 0, totalDays: 0 };
  const months = wholeMonths(joined, end);
  return { years: Math.floor(months / 12), months: months % 12, days: daysBetween(addMonths(joined, months), end), totalDays: daysBetween(joined, end) };
}

/**
 * Years that count for the formula: the completed years, plus one more when the part-year left over
 * is MORE than six months. 8 years 7 months → 9; 8 years 6 months exactly → 8; 8 years 6 months 1 day → 9.
 */
export function countedYears(joined: Ymd, lastDay: Ymd): number {
  const end = endExclusive(lastDay);
  if (compareYmd(end, joined) <= 0) return 0;
  const years = Math.floor(wholeMonths(joined, end) / 12);
  const sixMonthsIn = addMonths(joined, years * 12 + 6);
  return years + (compareYmd(end, sixMonthsIn) > 0 ? 1 : 0);
}

/** Has the service reached `years` whole years (the last working day included)? */
export function hasReached(joined: Ymd, lastDay: Ymd, years: number): boolean {
  return compareYmd(endExclusive(lastDay), addMonths(joined, years * 12)) >= 0;
}

/** The last working day on which `years` whole years of service are complete. */
export function reachedOn(joined: Ymd, years: number): Ymd {
  return addDays(addMonths(joined, years * 12), -1);
}
