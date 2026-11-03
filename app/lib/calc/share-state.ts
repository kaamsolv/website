/**
 * The numbers in a shared calculator link. A link like /sip-calculator?a=5000&r=12&y=10 opens the calculator with those
 * values filled in. Everything read from a link is untrusted: each key is checked against its own range, anything else
 * is ignored, and the page address, title and search tags never change with it.
 */

export type ShareKey = 'a' | 'r' | 'y' | 'm' | 's' | 'f' | 'g' | 'i' | 't' | 'd';

/** key: [min, max]. Counts (years, months, days) must also be whole numbers. */
const RANGES: Record<ShareKey, { min: number; max: number; whole?: boolean }> = {
  a: { min: 1, max: 1_000_000_000 }, // amount
  r: { min: 0, max: 50 }, // rate
  y: { min: 0, max: 50, whole: true }, // years
  m: { min: 0, max: 11, whole: true }, // months
  d: { min: 0, max: 365, whole: true }, // days
  s: { min: 0, max: 50 }, // step-up
  g: { min: 1, max: 1_000_000_000 }, // goal
  i: { min: 0, max: 12 }, // inflation
  t: { min: 0, max: 40 }, // tax
  f: { min: 0, max: 4, whole: true }, // compounding index
};

export type ShareValues = Partial<Record<ShareKey, number>>;

/** Pick out the valid values from a query string; unknown keys and out-of-range values are dropped. */
export function readShare(search: string): ShareValues {
  const out: ShareValues = {};
  const params = new URLSearchParams(search);
  for (const key of Object.keys(RANGES) as ShareKey[]) {
    const raw = params.get(key);
    if (raw === null || !/^\d{1,10}(\.\d{1,2})?$/.test(raw)) continue;
    const n = Number(raw);
    const { min, max, whole } = RANGES[key];
    if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) continue;
    out[key] = n;
  }
  return out;
}

/** A query string (without "?") for the values given; empty values are left out. */
export function writeShare(values: ShareValues): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(RANGES) as ShareKey[]) {
    const n = values[key];
    if (n !== undefined && Number.isFinite(n)) params.set(key, String(n));
  }
  return params.toString();
}
