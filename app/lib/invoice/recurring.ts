/**
 * Recurring invoices (Pro): "repeats monthly, next on 1 Nov". Framework-free,
 * and pure calendar arithmetic on YYYY-MM-DD strings — never `Date` in a time
 * zone — so the same answer comes out in IST, UTC or anywhere else.
 *
 * It is a reminder, not automation: when `next <= today` the app offers
 * "Create invoice" (one click) or "Skip"; nothing is created or sent by itself.
 */

export const RECUR_EVERY = ['week', 'month', 'quarter', 'year'] as const;
export type RecurEvery = (typeof RECUR_EVERY)[number];

export const RECUR_LABELS: Record<RecurEvery, string> = {
  week: 'Every week',
  month: 'Every month',
  quarter: 'Every 3 months',
  year: 'Every year',
};

/** For chips: "Monthly · next 1 Nov". */
export const RECUR_SHORT: Record<RecurEvery, string> = { week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isRecurEvery = (v: unknown): v is RecurEvery => typeof v === 'string' && (RECUR_EVERY as readonly string[]).includes(v);

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = ISO.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** Days since 1970-01-01 for a YYYY-MM-DD string. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/**
 * One period on from `iso`. Months clamp to the month's last day (31 Jan →
 * 28 Feb), and the next period continues from the clamped date (28 Feb → 28
 * Mar): edit the date by hand if you want it back on the 31st.
 */
export function nextRecurDate(iso: string, every: RecurEvery): string {
  if (every === 'week') {
    const n = dayNumber(iso) + 7;
    const d = new Date(n * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return addMonths(iso, every === 'month' ? 1 : every === 'quarter' ? 3 : 12);
}

/** The first date after `today` on this schedule, so a missed period doesn't leave the reminder stuck in the past. */
export function nextRecurAfter(iso: string, every: RecurEvery, today: string): string {
  let next = nextRecurDate(iso, every);
  for (let i = 0; i < 600 && next <= today; i++) next = nextRecurDate(next, every);
  return next;
}

/**
 * The visitor's own calendar date, as sent by the browser (same rule as
 * /api/dashboard?today=). Accepted when it is a real date within one day of the
 * server's UTC date: the largest real offset from UTC is 14 hours, so every
 * genuine local date passes, and a far-off date can't be used to jump the schedule.
 */
export function clientTodayOk(clientToday: unknown, serverNow: Date = new Date()): clientToday is string {
  if (!isIsoDate(clientToday)) return false;
  const serverDay = Math.floor(serverNow.getTime() / 86_400_000);
  return Math.abs(dayNumber(clientToday) - serverDay) <= 1;
}
