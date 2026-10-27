/**
 * Months, financial years and receipt dates for the Rent Receipt Generator.
 * Framework-free. A "year-month" is a plain `{ year, month }` with month 1–12;
 * no `Date` objects, so there are no time-zone surprises.
 *
 * An Indian financial year runs April to March: October 2026 is in FY 2026-27,
 * February 2027 is also in FY 2026-27.
 */

export type YearMonth = { year: number; month: number };

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The most receipts one PDF makes (two financial years). */
export const MAX_RECEIPT_MONTHS = 24;

const valid = (ym: YearMonth) => Number.isInteger(ym.year) && Number.isInteger(ym.month) && ym.month >= 1 && ym.month <= 12 && ym.year >= 1990 && ym.year <= 2100;
const index = (ym: YearMonth) => ym.year * 12 + (ym.month - 1);

/** "2026-10" → { year: 2026, month: 10 }, or null. */
export function parseYearMonth(text: string): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const ym = { year: Number(m[1]), month: Number(m[2]) };
  return valid(ym) ? ym : null;
}

export function formatYearMonth(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

/** "October 2026" */
export function monthLabel(ym: YearMonth): string {
  return `${MONTH_NAMES[ym.month - 1]} ${ym.year}`;
}

/** The calendar year in which this month's financial year starts (April): Feb 2027 → 2026. */
export function financialYearStart(ym: YearMonth): number {
  return ym.month >= 4 ? ym.year : ym.year - 1;
}

/** "2026-27" */
export function financialYearLabel(ym: YearMonth): string {
  const start = financialYearStart(ym);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** April to March of the financial year that `today` falls in. */
export function currentFinancialYear(today: { year: number; month: number }): { from: YearMonth; to: YearMonth } {
  const start = financialYearStart(today);
  return { from: { year: start, month: 4 }, to: { year: start + 1, month: 3 } };
}

export function daysInMonth(ym: YearMonth): number {
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
}

export type DateRule = 'last' | 'first';

/** The date written on a month's receipt: its last day, or its first. "31 Oct 2026". */
export function receiptDate(ym: YearMonth, rule: DateRule): string {
  const day = rule === 'first' ? 1 : daysInMonth(ym);
  return `${day} ${MONTH_SHORT[ym.month - 1]} ${ym.year}`;
}

export type MonthRange = { ok: true; months: YearMonth[] } | { ok: false; message: string };

/** Every month from `from` to `to`, inclusive. Refuses a backwards range and more than 24 months. */
export function receiptMonths(from: YearMonth | null, to: YearMonth | null): MonthRange {
  if (!from || !to || !valid(from) || !valid(to)) return { ok: false, message: 'Pick the first and the last month.' };
  const n = index(to) - index(from) + 1;
  if (n < 1) return { ok: false, message: 'The last month can’t be before the first month.' };
  if (n > MAX_RECEIPT_MONTHS) return { ok: false, message: `That’s ${n} months. Up to ${MAX_RECEIPT_MONTHS} at a time (two financial years).` };
  const months: YearMonth[] = [];
  for (let i = 0; i < n; i++) {
    const at = index(from) + i;
    months.push({ year: Math.floor(at / 12), month: (at % 12) + 1 });
  }
  return { ok: true, months };
}
