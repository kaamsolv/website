/**
 * Everyday & Money calculators: percentage, discount, tip / split bill, age.
 * Framework-free and pure, so every result is unit-tested. Money values are
 * rounded to paise (2 decimals) only at the end.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const finite = (...ns: number[]) => ns.every((n) => Number.isFinite(n));

// ---------------------------------------------------------------- Percentage

/** What is `percent`% of `value`? */
export function percentOf(percent: number, value: number): number | null {
  return finite(percent, value) ? (percent / 100) * value : null;
}

/** `part` is what percent of `whole`? */
export function whatPercent(part: number, whole: number): number | null {
  return finite(part, whole) && whole !== 0 ? (part / whole) * 100 : null;
}

/** Percentage change from `from` to `to` (+ = increase). */
export function percentChange(from: number, to: number): number | null {
  return finite(from, to) && from !== 0 ? ((to - from) / Math.abs(from)) * 100 : null;
}

// ------------------------------------------------------------------ Discount

export type DiscountResult = { final: number; saved: number };

/** Price after `percentOff`%, optionally followed by a second discount on the reduced price. */
export function discount(price: number, percentOff: number, extraPercentOff = 0): DiscountResult | null {
  if (!finite(price, percentOff, extraPercentOff) || price < 0) return null;
  if (percentOff < 0 || percentOff > 100 || extraPercentOff < 0 || extraPercentOff > 100) return null;
  const final = price * (1 - percentOff / 100) * (1 - extraPercentOff / 100);
  return { final: round2(final), saved: round2(price - final) };
}

// ---------------------------------------------------------- Tip / split bill

export type SplitResult = { tip: number; total: number; perPerson: number; perPersonRoundedUp: number };

/** Tip on `bill`, total, and each person's share. `perPersonRoundedUp` rounds up to the next whole rupee. */
export function splitBill(bill: number, tipPercent: number, people: number): SplitResult | null {
  if (!finite(bill, tipPercent, people) || bill < 0 || tipPercent < 0 || tipPercent > 100) return null;
  if (!Number.isInteger(people) || people < 1 || people > 1000) return null;
  const tip = (bill * tipPercent) / 100;
  const total = bill + tip;
  const perPerson = total / people;
  return {
    tip: round2(tip),
    total: round2(total),
    perPerson: round2(perPerson),
    perPersonRoundedUp: Math.ceil(round2(perPerson)),
  };
}

// ----------------------------------------------------------------------- Age

export type AgeResult = {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  totalMonths: number;
  /** 0 on the birthday itself. */
  daysToNextBirthday: number;
  nextBirthdayAge: number;
  bornWeekday: string;
};

/** Parse a `YYYY-MM-DD` (date input) value to a UTC date, or null. */
export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

const DAY = 86_400_000;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** This year's birthday for `birth` in year `y`; 29 Feb falls on 28 Feb in non-leap years. */
function birthdayIn(birth: Date, y: number): Date {
  const m = birth.getUTCMonth();
  return new Date(Date.UTC(y, m, Math.min(birth.getUTCDate(), daysInMonth(y, m))));
}

/** Exact age on `on` for someone born on `birth` (both UTC dates). Null if `birth` is after `on`. */
export function ageOn(birth: Date, on: Date): AgeResult | null {
  if (birth.getTime() > on.getTime()) return null;

  // Whole months first (a month is complete once the day-of-month is reached,
  // clamped to month end: 31 Jan + 1 month = 28/29 Feb), then leftover days.
  let totalMonths =
    (on.getUTCFullYear() - birth.getUTCFullYear()) * 12 + (on.getUTCMonth() - birth.getUTCMonth());
  const anchorFor = (n: number) => {
    const y = birth.getUTCFullYear() + Math.floor((birth.getUTCMonth() + n) / 12);
    const m = (birth.getUTCMonth() + n) % 12;
    return new Date(Date.UTC(y, m, Math.min(birth.getUTCDate(), daysInMonth(y, m))));
  };
  if (anchorFor(totalMonths).getTime() > on.getTime()) totalMonths -= 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const days = Math.round((on.getTime() - anchorFor(totalMonths).getTime()) / DAY);

  let next = birthdayIn(birth, on.getUTCFullYear());
  if (next.getTime() < on.getTime()) next = birthdayIn(birth, on.getUTCFullYear() + 1);
  const totalDays = Math.round((on.getTime() - birth.getTime()) / DAY);

  return {
    years,
    months,
    days,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalMonths,
    daysToNextBirthday: Math.round((next.getTime() - on.getTime()) / DAY),
    nextBirthdayAge: next.getUTCFullYear() - birth.getUTCFullYear(),
    bornWeekday: new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'UTC' }).format(birth),
  };
}

// ---------------------------------------------------------------- Formatting

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const inrMoney = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 125000 → "1,25,000"; 12.5 → "12.5". */
export const formatNumber = (n: number) => inr.format(n);
/** 125000 → "₹1,25,000.00". */
export const formatRupees = (n: number) => `₹${inrMoney.format(n)}`;

/** Parse user input like "1,25,000" or " 12.5 " → number, or NaN. */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[,\s₹]/g, '');
  return cleaned === '' ? Number.NaN : Number(cleaned);
}
