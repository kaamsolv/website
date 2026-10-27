/**
 * What a purchase switches on, and how long it lasts. Framework-free (db/ and tests import it).
 *
 * Prices live in the `plan_prices` table, never here or in the browser. This file only knows the shape:
 * two billing periods, and that the bundle is a price-list entry which grants two real plans.
 */

export const BILLING_PERIODS = ['month', 'year'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const BUNDLE_PLAN = 'invoice_qr_bundle';

const BUNDLE_GRANTS = ['invoice_pro', 'qr_pro'] as const;

export const isBillingPeriod = (v: unknown): v is BillingPeriod => v === 'month' || v === 'year';

/** The plans a purchase of `planKey` switches on. The bundle grants both; any other plan grants itself. */
export function plansGranted(planKey: string): string[] {
  return planKey === BUNDLE_PLAN ? [...BUNDLE_GRANTS] : [planKey];
}

/**
 * `from` plus one billing period, in UTC. Months clamp to the month end (31 Jan + 1 month = 28 or 29 Feb),
 * which is what Postgres does for `interval '1 month'` in the grant statement (db/billing.ts).
 */
export function addPeriod(from: Date, period: BillingPeriod): Date {
  const months = period === 'year' ? 12 : 1;
  const index = from.getUTCFullYear() * 12 + from.getUTCMonth() + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(from.getUTCDate(), lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()),
  );
}

/**
 * The split of a price that already includes GST at `rate` percent: the part before tax, and the tax. Paise in, paise out,
 * and the two always add back to the price. (The invoice shows the tax as CGST + SGST or IGST; this is the same total.)
 */
export function splitIncludingTax(pricePaise: number, rate: number): { basePaise: number; taxPaise: number } {
  const basePaise = Math.round((pricePaise * 100) / (100 + rate));
  return { basePaise, taxPaise: pricePaise - basePaise };
}

/** "₹149" or "₹1,490" from paise (prices are set in whole rupees; paise show only if present). */
export function priceLabel(amountPaise: number): string {
  const rupees = Math.floor(amountPaise / 100);
  const paise = amountPaise % 100;
  const grouped = rupees.toString().replace(/\B(?=(\d{2})*\d{3}(?!\d))/g, ',');
  return `₹${grouped}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`;
}
