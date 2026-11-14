/**
 * Notice period engine (Notice Period Calculator, docs/products/notice-period-calculator.md).
 *
 * Pure date arithmetic on whole days, with no clock, no time zone and no daylight saving in it: a date is the number of days
 * since 1970-01-01, so "Friday 1 January plus 30 days" is the same answer in every browser and every country.
 *
 * What a notice period means is set by an offer letter, and employers differ, so nothing here is a rule of law. It follows the
 * choices a person makes on the page: how many days or months, whether the days are counted on the calendar or as working days,
 * and whether the first day of notice is the day after resigning or the day of resigning. Every choice is stated back in words
 * (`ruleSentence`). The default is the most common one: calendar days, starting the day after you resign.
 */

/** A date: whole days since 1970-01-01 (UTC). */
export type Day = number;

const MS_DAY = 86_400_000;
export const MIN_YEAR = 1950;
export const MAX_YEAR = 2100;
export const MAX_DAYS = 365;
export const MAX_MONTHS = 12;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export type CountRule = 'calendar' | 'monFri' | 'monSat';
export type NoticeUnit = 'days' | 'months';
/** `next`: the first day of notice is the day after you resign. `same`: the day you resign counts as day one. */
export type FirstDay = 'next' | 'same';
/** What to do when a calendar-counted notice ends on a Saturday or Sunday. */
export type WeekendRule = 'keep' | 'before';

// ───────────────────────────────────────────────────────────────────────────── dates

export const dayFromYmd = (y: number, m: number, d: number): Day => Math.floor(Date.UTC(y, m - 1, d) / MS_DAY);

export function ymd(day: Day): { y: number; m: number; d: number } {
  const dt = new Date(day * MS_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, month0: number) => new Date(Date.UTC(y, month0 + 1, 0)).getUTCDate();

/** A `YYYY-MM-DD` date-box value, or null if it is not a real date between 1950 and 2100. */
export function parseDay(value: string): Day | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const day = dayFromYmd(y, mo, d);
  const back = ymd(day);
  return back.y === y && back.m === mo && back.d === d ? day : null;
}

export function isoDay(day: Day): string {
  const { y, m, d } = ymd(day);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 0 is Sunday. 1 January 1970 was a Thursday. */
export const weekday = (day: Day): number => (((day + 4) % 7) + 7) % 7;

export const isWeekend = (day: Day): boolean => weekday(day) === 0 || weekday(day) === 6;

/** Not a working day under this rule: Saturday and Sunday, or Sunday only for a six-day week. Calendar counting treats Saturday and Sunday as the weekend. */
export const isOffDay = (day: Day, count: CountRule): boolean => (count === 'monSat' ? weekday(day) === 0 : isWeekend(day));

/** "Fri 30 Jan 2027", or "Fri 30 Jan" without the year. */
export function dayLabel(day: Day, withYear = true): string {
  const { y, m, d } = ymd(day);
  return `${WEEKDAYS[weekday(day)]} ${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export function relativeDays(day: Day, today: Day): string {
  const n = day - today;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

// ───────────────────────────────────────────────────────────────────────────── the notice

export type NoticeInput = {
  resign: Day;
  notice: number;
  unit: NoticeUnit;
  /** Ignored for months (they are counted on the calendar). */
  count: CountRule;
  first: FirstDay;
  weekend?: WeekendRule;
};

export type NoticeResult = {
  resign: Day;
  /** The first day of notice. */
  start: Day;
  /** The last working day. */
  last: Day;
  /** Where the notice would have ended before a weekend last day was moved to the working day before; null when it was not. */
  moved: Day | null;
  calendarDays: number;
  weekdays: number;
  weekendDays: number;
};

export function isValidNotice(notice: number, unit: NoticeUnit): boolean {
  return Number.isInteger(notice) && notice >= 0 && notice <= (unit === 'months' ? MAX_MONTHS : MAX_DAYS);
}

/**
 * The last day of a notice of `n` whole months that starts on `start`: the day before the same date `n` months later, and when
 * that date does not exist (a notice from the 31st into a month with 30 days) the last day of that month.
 */
function monthsEnd(start: Day, n: number): Day {
  const { y, m, d } = ymd(start);
  const index = y * 12 + (m - 1) + n;
  const ty = Math.floor(index / 12);
  const tm = index % 12;
  const dim = daysInMonth(ty, tm);
  return d > dim ? dayFromYmd(ty, tm + 1, dim) : dayFromYmd(ty, tm + 1, d) - 1;
}

function endOfNotice(i: NoticeInput): { start: Day; last: Day } {
  if (i.notice === 0) return { start: i.resign, last: i.resign };
  const start = i.first === 'next' ? i.resign + 1 : i.resign;
  if (i.unit === 'months') return { start, last: monthsEnd(start, i.notice) };
  if (i.count === 'calendar') return { start, last: start + i.notice - 1 };
  let day = start;
  let counted = 0;
  for (;;) {
    if (!isOffDay(day, i.count)) {
      counted += 1;
      if (counted === i.notice) return { start, last: day };
    }
    day += 1;
  }
}

/** The last working day for a resignation. The notice must be valid (`isValidNotice`). */
export function lastWorkingDay(i: NoticeInput): NoticeResult {
  const { start, last: end } = endOfNotice(i);
  let last = end;
  let moved: Day | null = null;
  const calendarCounted = i.unit === 'months' || i.count === 'calendar';
  if (i.weekend === 'before' && calendarCounted && i.notice > 0 && isWeekend(end)) {
    let candidate = end;
    while (isWeekend(candidate)) candidate -= 1;
    // Never before the day you resign (a Saturday resignation with a one-day notice would otherwise end before it began).
    last = Math.max(candidate, i.resign);
    if (last !== end) moved = end;
  }
  const calendarDays = i.notice === 0 ? 0 : Math.max(0, last - start + 1);
  let weekendDays = 0;
  for (let d = start; d < start + calendarDays; d += 1) if (isWeekend(d)) weekendDays += 1;
  return { resign: i.resign, start, last, moved, calendarDays, weekdays: calendarDays - weekendDays, weekendDays };
}

/**
 * Reverse: the latest day you can resign and still be done by the day before the new job starts. The last working day is the day
 * before `joinOn`, moved back to a working day when the counting rule needs one. Found by trying resignation dates backwards, so
 * the answer is always exactly what `lastWorkingDay` would give for it (no formula to drift out of step).
 */
export function latestResignDate(i: Omit<NoticeInput, 'resign'> & { joinOn: Day }): NoticeResult | null {
  let target = i.joinOn - 1;
  const needsWorkingDay = (d: Day) => (i.unit === 'days' && i.count !== 'calendar' ? isOffDay(d, i.count) : i.weekend === 'before' && isWeekend(d));
  while (needsWorkingDay(target)) target -= 1;
  for (let resign = target; resign > target - 800; resign -= 1) {
    const result = lastWorkingDay({ ...i, resign });
    if (result.last <= target) return result;
  }
  return null;
}

/** Your last day in the office if you take `leaveDays` working days of leave at the end of notice (the official last day does not move). */
export function lastDayInOffice(last: Day, leaveDays: number, count: CountRule, start: Day): { day: Day; coversAll: boolean } {
  let day = last;
  let remaining = leaveDays;
  while (remaining > 0) {
    day -= 1;
    if (day < start) return { day: start, coversAll: true };
    if (!isOffDay(day, count)) remaining -= 1;
  }
  return { day, coversAll: false };
}

/** How much of the notice you would not serve if you left on `leaveOn`: calendar days, or working days when the notice counts those. */
export function shortfall(last: Day, leaveOn: Day, count: CountRule, unit: NoticeUnit): number {
  if (leaveOn >= last) return 0;
  if (unit === 'months' || count === 'calendar') return last - leaveOn;
  let n = 0;
  for (let d = leaveOn + 1; d <= last; d += 1) if (!isOffDay(d, count)) n += 1;
  return n;
}

/** The common buyout estimate: monthly pay divided by 30 (or 26), times the days short, to the nearest rupee. Employers differ (basic or gross, the divisor), so it is only an estimate. */
export const buyoutAmount = (shortDays: number, monthlyPay: number, divisor: 26 | 30): number => Math.round((monthlyPay / divisor) * shortDays);

// ───────────────────────────────────────────────────────────────────────────── words

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The rule that was used, in plain words, so the answer can never be mistaken for something else. */
export function ruleSentence(i: Pick<NoticeInput, 'notice' | 'unit' | 'count' | 'first'>): string {
  if (i.notice === 0) return 'No notice period, so your last day is the day you resign.';
  const from = i.first === 'next' ? 'starting the day after you resign' : 'counting the day you resign as day one';
  if (i.unit === 'months') return `${plural(i.notice, 'month', 'months')}, counted on the calendar, ${from}.`;
  if (i.count === 'calendar') return `${plural(i.notice, 'day', 'days')}, counted in calendar days, ${from}.`;
  return `${plural(i.notice, 'working day', 'working days')} (${i.count === 'monFri' ? 'Monday to Friday' : 'Monday to Saturday'}), ${from}.`;
}

/** The note shown when a calendar-counted notice ends at a weekend. */
export function weekendNote(last: Day): { text: string; before: Day } | null {
  if (!isWeekend(last)) return null;
  let before = last;
  while (isWeekend(before)) before -= 1;
  return { text: `That is a ${WEEKDAYS_LONG[weekday(last)]}. Some companies move the last day to the working day before (${dayLabel(before, false)}); others keep it. Check your letter.`, before };
}

// ───────────────────────────────────────────────────────────────────────────── the picture

export type Cell = { day: Day; num: number; inNotice: boolean; off: boolean; resign: boolean; last: boolean; today: boolean };
export type Week = { kind: 'week'; label: string | null; cells: Cell[] } | { kind: 'gap'; weeks: number };

const mondayOf = (day: Day): Day => day - ((weekday(day) + 6) % 7);

/**
 * The notice as weeks, Monday to Sunday, from the week you resign to the week you finish. A very long notice shows its first and
 * last weeks with the number of weeks in between, so the picture never grows past a screen or two.
 */
export function buildRibbon(r: NoticeResult, count: CountRule, today: Day | null, edgeWeeks = 8, capWeeks = 20): Week[] {
  const first = mondayOf(Math.min(r.resign, r.start));
  const lastMonday = mondayOf(Math.max(r.last, r.resign));
  const starts: Day[] = [];
  for (let d = first; d <= lastMonday; d += 7) starts.push(d);
  const row = (monday: Day, force: boolean): Week => {
    const cells: Cell[] = [];
    let label: string | null = null;
    for (let k = 0; k < 7; k += 1) {
      const day = monday + k;
      if (ymd(day).d === 1) label = MONTHS[ymd(day).m - 1];
      cells.push({ day, num: ymd(day).d, inNotice: r.calendarDays > 0 && day >= r.start && day <= r.last, off: isOffDay(day, count), resign: day === r.resign, last: day === r.last, today: day === today });
    }
    if (!label && force) label = MONTHS[ymd(monday).m - 1];
    return { kind: 'week', label, cells };
  };
  if (starts.length <= capWeeks) return starts.map((m, i) => row(m, i === 0));
  const head = starts.slice(0, edgeWeeks).map((m, i) => row(m, i === 0));
  const tail = starts.slice(-edgeWeeks).map((m) => row(m, true));
  return [...head, { kind: 'gap', weeks: starts.length - 2 * edgeWeeks }, ...tail];
}

// ───────────────────────────────────────────────────────────────────────────── a calendar file

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (day: Day) => isoDay(day).replace(/-/g, '');

/** An all-day calendar event on the last working day. `stamp` is the creation time as YYYYMMDDTHHMMSSZ (passed in so this stays pure). */
export function lastDayIcs(last: Day, stamp: string, description: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KaamSolv//Notice period calculator//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:last-working-day-${isoDay(last)}@kaamsolv.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(last)}`,
    `DTEND;VALUE=DATE:${icsDate(last + 1)}`,
    'SUMMARY:Last working day',
    `DESCRIPTION:${icsEscape(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
