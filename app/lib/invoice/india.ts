/**
 * Indian business identifiers for invoices: GST state codes, GSTIN, IFSC, UPI.
 * Format checks only — nothing is looked up online (a live GSTIN check needs a
 * licensed GST Suvidha Provider). Framework-free.
 */

/**
 * States and union territories with their GST state codes, as used in the first
 * two digits of a GSTIN. 26 is Dadra & Nagar Haveli and Daman & Diu (merged in
 * 2020; old code 25 retired); 37 is Andhra Pradesh (28 was pre-2014); 38 is
 * Ladakh; 97 is "Other Territory".
 */
export const GST_STATES = [
  ['01', 'Jammu and Kashmir'],
  ['02', 'Himachal Pradesh'],
  ['03', 'Punjab'],
  ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'],
  ['06', 'Haryana'],
  ['07', 'Delhi'],
  ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'],
  ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'],
  ['14', 'Manipur'],
  ['15', 'Mizoram'],
  ['16', 'Tripura'],
  ['17', 'Meghalaya'],
  ['18', 'Assam'],
  ['19', 'West Bengal'],
  ['20', 'Jharkhand'],
  ['21', 'Odisha'],
  ['22', 'Chhattisgarh'],
  ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['27', 'Maharashtra'],
  ['29', 'Karnataka'],
  ['30', 'Goa'],
  ['31', 'Lakshadweep'],
  ['32', 'Kerala'],
  ['33', 'Tamil Nadu'],
  ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'],
  ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'],
  ['38', 'Ladakh'],
  ['97', 'Other Territory'],
] as const;

export type GstStateCode = (typeof GST_STATES)[number][0];

const STATE_NAMES = new Map<string, string>(GST_STATES);
/** Older codes that can still appear in a valid GSTIN. */
const LEGACY_GSTIN_STATES = new Set(['25', '28', '99']);

export function isStateCode(code: unknown): code is GstStateCode {
  return typeof code === 'string' && STATE_NAMES.has(code);
}

export function stateName(code: string | null | undefined): string {
  return (code && STATE_NAMES.get(code)) || '';
}

const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The GSTIN check character for the first 14 characters (official algorithm). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = BASE36.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36];
}

export const normalizeGstin = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** null when valid; otherwise a short, plain message for the field. */
export function gstinProblem(input: string): string | null {
  const g = normalizeGstin(input);
  if (g.length !== 15) return 'A GSTIN has 15 characters.';
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z][A-Z][0-9A-Z]$/.test(g)) return 'That doesn’t look like a GSTIN — check for typos.';
  const state = g.slice(0, 2);
  if (!STATE_NAMES.has(state) && !LEGACY_GSTIN_STATES.has(state)) return 'The first two digits aren’t a GST state code.';
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'That GSTIN has a typo — its last character doesn’t match.';
  return null;
}

export const normalizeIfsc = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export function ifscProblem(input: string): string | null {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalizeIfsc(input)) ? null : 'An IFSC looks like HDFC0001234 — 4 letters, a 0, then 6 letters or digits.';
}

export function upiProblem(input: string): string | null {
  return /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(input.trim()) ? null : 'A UPI ID looks like name@bank.';
}

export function hsnProblem(input: string): string | null {
  return /^\d{4}(\d{2}){0,2}$/.test(input.trim()) ? null : 'HSN/SAC codes are 4, 6 or 8 digits.';
}
