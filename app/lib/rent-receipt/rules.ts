/**
 * The rules the Rent Receipt Generator follows, kept in one place. Framework-free.
 *
 * These come from secondary sources (tax-help sites), not the statute, and are shown to the
 * person as "what employers usually ask for", never as law or advice (docs/products/rent-receipt.md):
 *  - landlord's PAN: employers usually ask when rent is more than ₹1,00,000 in a financial year;
 *  - a ₹1 revenue stamp: usually asked for when rent is paid in cash and a receipt is more than ₹5,000.
 * Money is held in whole paise as BigInt, so a limit comparison can never be off by a rounding error.
 */

import { financialYearLabel, type YearMonth } from './months';

export type PayMode = 'cash' | 'upi' | 'bank' | 'cheque';

export const PAY_MODES: { value: PayMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
];

export const payModeLabel = (m: PayMode): string => PAY_MODES.find((p) => p.value === m)!.label;

/** Yearly rent above which employers usually ask for the landlord's PAN, in rupees. */
export const PAN_LIMIT_RUPEES = 100_000;
/** A cash receipt above this many rupees usually carries a ₹1 revenue stamp. */
export const STAMP_LIMIT_RUPEES = 5_000;

const PAISE = BigInt(100);

/** Whole paise for an amount given as rupees and paise. */
export const toPaise = (rupees: bigint, paise: number): bigint => rupees * PAISE + BigInt(paise);

/** Rent paid in each financial year of the range, in paise: { "2026-27": …, "2027-28": … }. */
export function rentByFinancialYear(months: YearMonth[], monthlyPaise: bigint): Record<string, bigint> {
  const totals: Record<string, bigint> = {};
  for (const ym of months) {
    const fy = financialYearLabel(ym);
    totals[fy] = (totals[fy] ?? BigInt(0)) + monthlyPaise;
  }
  return totals;
}

/** True when any one financial year's rent in the range is MORE than ₹1,00,000 (exactly ₹1,00,000 is not). */
export function needsLandlordPan(months: YearMonth[], monthlyPaise: bigint): boolean {
  const limit = BigInt(PAN_LIMIT_RUPEES) * PAISE;
  return Object.values(rentByFinancialYear(months, monthlyPaise)).some((total) => total > limit);
}

/** Cash only, and MORE than ₹5,000 in a receipt (exactly ₹5,000 is not). */
export function needsRevenueStamp(mode: PayMode, monthlyPaise: bigint): boolean {
  return mode === 'cash' && monthlyPaise > BigInt(STAMP_LIMIT_RUPEES) * PAISE;
}

/** "abcde1234f" → "ABCDE1234F": upper-case, spaces removed. */
export function cleanPan(raw: string): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Five letters, four digits, one letter. Format only: we can't and don't check that the PAN exists. */
export function isValidPan(raw: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan(raw));
}

/** Free text from a form: control characters out, runs of spaces and line breaks become one space, length capped. */
export function cleanText(raw: string, max: number): string {
  return (raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
