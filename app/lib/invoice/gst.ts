/**
 * GST rates offered in the invoice's rate dropdown. Framework-free.
 *
 * Source: GST Council, 56th meeting (3 Sept 2025) — rates rationalised to two
 * slabs, 5% and 18%, plus a 40% rate for a few luxury and "sin" goods, in force
 * from 22 September 2025 (PIB press note; Notification 9/2025-Central Tax
 * (Rate), 17 Sept 2025). 0% covers exempt/nil-rated supplies; 0.25% (rough
 * precious stones) and 3% (gold, silver, jewellery) continue. Tobacco products
 * stay on their old rates until compensation cess ends — that, and any rate not
 * listed, goes through "Other…".
 *
 * Re-check this list whenever the GST Council changes rates (CLAUDE.md §33).
 */

export const GST_RATES = ['0', '0.25', '3', '5', '18', '40'] as const;
export type GstRate = (typeof GST_RATES)[number];

/** Shown under the dropdown on screen only — never printed on the invoice. */
export const GST_RATES_NOTE = 'GST rates follow the changes from 22 September 2025.';

export const DEFAULT_GST_RATE: GstRate = '18';

export const TAX_LABELS = ['GST', 'VAT', 'Tax'] as const;

export function isListedGstRate(rate: string): rate is GstRate {
  return (GST_RATES as readonly string[]).includes(rate.trim());
}
