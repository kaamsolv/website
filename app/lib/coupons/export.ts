/**
 * Files for a batch of coupon codes: a CSV that a store or a spreadsheet can read, and a plain list.
 *
 * The discount and the expiry date are LABELS. They travel with the codes so you can see what each batch was for, and
 * stores that import a CSV can read them, but a code does not enforce them: your store or till does. (Phase 2 of the
 * Coupon product enforces them on KaamSolv's side; see docs/products/coupons.md.)
 *
 * Plain ASCII only, no byte-order mark: importers that read the first header cell literally must see `code`.
 */

import { csvCell } from '../invoice/csv.ts';
import { cleanPrefix, CouponError } from './generate.ts';

export type DiscountLabel = { type: 'percent'; value: number } | { type: 'amount'; value: number };

export type CouponFileOptions = {
  /** What the codes are worth, e.g. 10 percent or an amount off. Leave out when the batch is just codes. */
  discount?: DiscountLabel | null;
  /** The last day the codes should be accepted, as YYYY-MM-DD. */
  expiresOn?: string | null;
};

/** The CSV header, in order. Importers can match on these names. */
export const COUPON_CSV_COLUMNS = ['code', 'discount_type', 'discount_value', 'expires_on'] as const;

const MAX_AMOUNT = 10_000_000;

function twoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

/** Throws `CouponError('discount')` unless the label is something a shop could really offer. */
export function checkDiscount(discount: DiscountLabel): void {
  const { type, value } = discount;
  const okType = type === 'percent' || type === 'amount';
  const max = type === 'percent' ? 100 : MAX_AMOUNT;
  if (!okType || !Number.isFinite(value) || value <= 0 || value > max || !twoDecimals(value)) {
    throw new CouponError(
      'discount',
      type === 'percent' ? 'A percentage off is more than 0 and up to 100, with at most two decimals.' : 'An amount off is more than 0, with at most two decimals.',
    );
  }
}

/** Throws `CouponError('expiry')` unless the text is a real calendar date written YYYY-MM-DD. */
export function checkExpiryDate(text: string): void {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d) return;
  }
  throw new CouponError('expiry', 'Use a real date, written like 2026-12-31.');
}

/** CSV text (CRLF line ends): a header, then one row per code. Discount and expiry cells are empty when not set. */
export function couponsToCsv(codes: readonly string[], options: CouponFileOptions = {}): string {
  const { discount, expiresOn } = options;
  if (discount) checkDiscount(discount);
  if (expiresOn) checkExpiryDate(expiresOn);
  const rows: (string | number | null)[][] = [[...COUPON_CSV_COLUMNS]];
  for (const code of codes) rows.push([code, discount ? discount.type : null, discount ? discount.value : null, expiresOn || null]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** coupon-codes-100.csv, or coupon-codes-100-diwali.csv when the batch has a prefix. */
export function couponFileName(ext: 'csv' | 'txt', count: number, prefix = ''): string {
  const tag = cleanPrefix(prefix).toLowerCase();
  return `coupon-codes-${count}${tag ? `-${tag}` : ''}.${ext}`;
}

/** One code per line, nothing else. */
export function couponsToTxt(codes: readonly string[]): string {
  return codes.length ? codes.join('\n') + '\n' : '';
}
