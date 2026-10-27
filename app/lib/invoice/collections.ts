/**
 * Payments & Collections (Stage D) — the date maths, the ageing rule, the collection-rate
 * formula and request validation. Framework-free; tested in test/collections-lib.test.mts.
 *
 * ─── Time, stated once ────────────────────────────────────────────────────────────────────
 * Every business date here — issue date, due date, date received, "today", range ends — is a
 * plain calendar date, `YYYY-MM-DD`, with no time zone attached, and it is **never converted**.
 * It is compared as text/whole days (days are counted from 1970-01-01 using UTC arithmetic
 * purely as a calendar, so the server's own time zone and daylight-saving rules can't move a day).
 *
 *   - "Today" is the visitor's own calendar date, sent by the browser (`today=`). The server
 *     accepts it only when it is a real date within one day of the server's UTC date
 *     (`clientTodayOk`: the biggest real UTC offset is 14 h), so a genuine IST "just after
 *     midnight" works and a far-off date can't be used to dodge overdue. There is no silent
 *     fallback to the server's clock: a missing or implausible `today` is a 400.
 *   - The Indian financial year is 1 April – 31 March, worked out from that calendar date.
 *     On 31 March it is still the old year; on 1 April the new one begins — whichever
 *     instant of the real world the server happens to be running at.
 *   - Overdue is `due_date < today` (due today is not overdue); days overdue = today − due_date.
 *   - Months are the `YYYY-MM` of the stored date (`to_char`), never of an instant.
 */

import { clientTodayOk, isIsoDate } from './recurring';
import { CURRENCIES, type CurrencyCode } from './types';

export const MAX_RANGE_MONTHS = 24;
export const EARLIEST_DATE = '2000-01-01';
export const LATEST_DATE = '2100-12-31';

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Days since 1970-01-01 for a YYYY-MM-DD string (a calendar count, not an instant). */
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const monthIndex = (iso: string) => {
  const [y, m] = parts(iso);
  return y * 12 + (m - 1);
};
const fromMonthIndex = (idx: number): [number, number] => [Math.floor(idx / 12), (idx % 12) + 1];

export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export const monthEnd = (iso: string) => {
  const [y, m] = parts(iso);
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
};

/** 1 April of the Indian financial year that `today` falls in. */
export function financialYearStart(today: string): string {
  const [y, m] = parts(today);
  return `${m >= 4 ? y : y - 1}-04-01`;
}
/** 31 March that closes it. */
export function financialYearEnd(today: string): string {
  return `${Number(financialYearStart(today).slice(0, 4)) + 1}-03-31`;
}
/** "2026-27" for the year starting 1 April 2026. */
export function financialYearLabel(today: string): string {
  const y = Number(financialYearStart(today).slice(0, 4));
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export const RANGE_PRESETS = ['month', '3m', '6m', 'fy', 'fy-1', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  month: 'This month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  fy: 'This financial year (Apr–Mar)',
  'fy-1': 'Last financial year',
  custom: 'Custom dates',
};

/** The from/to a preset means on `today`. Rolling presets are whole months, ending with this month. */
export function resolvePreset(preset: Exclude<RangePreset, 'custom'>, today: string): { from: string; to: string } {
  const end = monthEnd(today);
  switch (preset) {
    case 'month':
      return { from: monthStart(today), to: end };
    case '3m':
    case '6m': {
      const [y, m] = fromMonthIndex(monthIndex(today) - (preset === '3m' ? 2 : 5));
      return { from: `${y}-${pad(m)}-01`, to: end };
    }
    case 'fy':
      return { from: financialYearStart(today), to: financialYearEnd(today) };
    case 'fy-1': {
      const y = Number(financialYearStart(today).slice(0, 4)) - 1;
      return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
  }
}

/** Every `YYYY-MM` from the month of `from` to the month of `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = monthIndex(from); i <= monthIndex(to); i++) {
    const [y, m] = fromMonthIndex(i);
    out.push(`${y}-${pad(m)}`);
  }
  return out;
}

export function validateRange(from: unknown, to: unknown): { ok: true; from: string; to: string } | { ok: false; message: string } {
  if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, message: 'Use dates like 2026-04-01.' };
  if (from < EARLIEST_DATE || to > LATEST_DATE) return { ok: false, message: 'Those dates look too far off. Check the year.' };
  if (from > to) return { ok: false, message: 'The start date has to be on or before the end date.' };
  if (monthIndex(to) - monthIndex(from) + 1 > MAX_RANGE_MONTHS) return { ok: false, message: `Pick up to ${MAX_RANGE_MONTHS} months at a time.` };
  return { ok: true, from, to };
}

// ─── Ageing ──────────────────────────────────────────────────────────────────────────────

export const AGEING_BUCKETS = [
  { key: 'not_due', label: 'Not yet due' },
  { key: 'd1_30', label: '1–30 days overdue' },
  { key: 'd31_60', label: '31–60 days overdue' },
  { key: 'd61_90', label: '61–90 days overdue' },
  { key: 'd90_plus', label: 'Over 90 days overdue' },
] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number]['key'];
export const isAgeingBucket = (v: unknown): v is AgeingBucket => typeof v === 'string' && AGEING_BUCKETS.some((b) => b.key === v);

/** Whole days past the due date; 0 when it isn't due yet, is due today, or has no due date. */
export function daysOverdue(dueDate: string | null | undefined, today: string): number {
  if (!dueDate || !isIsoDate(dueDate)) return 0;
  return Math.max(0, dayNumber(today) - dayNumber(dueDate));
}

/** Which ageing bucket a balance falls in. No due date counts as not yet due. */
export function ageingBucket(dueDate: string | null | undefined, today: string): AgeingBucket {
  const d = daysOverdue(dueDate, today);
  return d === 0 ? 'not_due' : d <= 30 ? 'd1_30' : d <= 60 ? 'd31_60' : d <= 90 ? 'd61_90' : 'd90_plus';
}

// ─── Collection rate ─────────────────────────────────────────────────────────────────────

/**
 * The **invoice-cohort collection rate**: money collected so far (to any date) on the invoices *issued* in the
 * period, as a share of their total. Whole percent, rounded down, never 100 until fully collected; null when
 * there is nothing to measure. It is not the same as cash received in the period (which counts any invoice).
 */
export function collectionRate(collectedCents: number, invoicedCents: number): number | null {
  if (!(invoicedCents > 0)) return null;
  const pct = Math.floor((collectedCents * 100) / invoicedCents);
  return collectedCents >= invoicedCents ? 100 : Math.min(99, Math.max(0, pct));
}

// ─── Request ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CollectionsQuery = {
  /** Undefined = the server picks the account's main currency. */
  currency?: CurrencyCode;
  from: string;
  to: string;
  today: string;
  customerId?: string;
};

/** Validates `GET /api/invoices/collections`. `today` is required and must be plausible; there is no fallback. */
export function parseCollectionsQuery(q: URLSearchParams, serverNow: Date = new Date()): { ok: true; value: CollectionsQuery } | { ok: false; message: string } {
  const today = q.get('today');
  if (!clientTodayOk(today, serverNow)) return { ok: false, message: 'Your device’s date looks off. Check your clock and try again.' };
  const range = validateRange(q.get('from'), q.get('to'));
  if (!range.ok) return range;
  const currency = q.get('currency');
  if (currency !== null && !(CURRENCIES as readonly string[]).includes(currency)) return { ok: false, message: 'That currency isn’t supported.' };
  const customer = q.get('customer');
  if (customer !== null && customer !== '' && !UUID_RE.test(customer)) return { ok: false, message: 'That customer filter isn’t valid.' };
  return {
    ok: true,
    value: { currency: (currency ?? undefined) as CurrencyCode | undefined, from: range.from, to: range.to, today, customerId: customer || undefined },
  };
}

export const monthLabel = (ym: string) => {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
};
