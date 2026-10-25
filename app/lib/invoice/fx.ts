/**
 * Currency reference rates (Pro, Stage 2C-2). Source: Frankfurter
 * (api.frankfurter.dev) — free, no key, commercial use allowed, caching
 * encouraged. We use its default blended rates rather than its ECB-only feed,
 * because the ECB doesn't publish AED. Each rate carries its own date.
 *
 * Shown on screen only — never printed on a PDF. Framework-free.
 */

import { CURRENCIES, type CurrencyCode } from './types.ts';

/** The foreign currencies we quote against the rupee. */
export const FX_CURRENCIES = CURRENCIES.filter((c) => c !== 'INR') as Exclude<CurrencyCode, 'INR'>[];

export type FxRate = { rate: number; date: string };
/** Rupees per one unit of each currency. */
export type InrRates = Partial<Record<Exclude<CurrencyCode, 'INR'>, FxRate>>;

export const FX_NOTE = 'Reference rate. GST on exports uses the notified rate — check with your CA.';

/** One Frankfurter answer: `[{ date, base, quote, rate }]` for base → INR. */
export function readFrankfurter(body: unknown, base: string): FxRate | null {
  if (!Array.isArray(body)) return null;
  const hit = body.find((r) => r && typeof r === 'object' && (r as { base?: unknown }).base === base && (r as { quote?: unknown }).quote === 'INR') as
    | { rate?: unknown; date?: unknown }
    | undefined;
  if (!hit || typeof hit.rate !== 'number' || !(hit.rate > 0) || !Number.isFinite(hit.rate)) return null;
  const date = typeof hit.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hit.date) ? hit.date : '';
  return { rate: hit.rate, date };
}

/** An amount in `from`, in rupees, at the rate (rounded to paise). */
export const toInr = (amount: number, rate: FxRate): number => Math.round(amount * rate.rate * 100) / 100;

/** What `amount` rupees is, in a foreign currency. */
export const fromInr = (amount: number, rate: FxRate): number => Math.round((amount / rate.rate) * 100) / 100;
