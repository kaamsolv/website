/**
 * GST tax invoice maths (Stage 2B). Framework-free.
 *
 * When does an invoice become a GST tax invoice? The seller has a valid GSTIN,
 * the currency is INR, the tax type is GST, and the seller isn't on the
 * composition scheme (that's a Bill of Supply, with no tax).
 *
 * Place of supply decides the split (IGST Act ss. 7–8 / place-of-supply rules):
 *   same state as the seller        → CGST + SGST (half each)
 *   same Union Territory without a
 *   legislature (UT_WITHOUT_LEGISLATURE) → CGST + UTGST
 *   a different state / outside India → IGST
 *
 * Each line may carry its own rate. The invoice-level discount is spread over
 * the lines in proportion to their amounts, so every rate's taxable value is
 * right; tax is worked out per rate and rounded to paise.
 */

import { gstinProblem, isStateCode, stateName } from './india';
import type { Invoice } from './types';

/** GST code for supplies to outside India (exports). */
export const EXPORT_CODE = '96';

/** UTs without their own legislature charge UTGST instead of SGST. Delhi (07), Puducherry (34) and J&K (01) have legislatures → SGST. */
export const UT_WITHOUT_LEGISLATURE = new Set(['04', '26', '31', '35', '38']);

export type Split = 'intra' | 'ut' | 'inter';

export type RateRow = { rate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number };

export type GstSummary = {
  split: Split;
  /** Place of supply used (state code or EXPORT_CODE). */
  placeOfSupply: string;
  sellerState: string;
  rows: RateRow[];
  cgst: number;
  sgst: number;
  igst: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const validGstin = (g: string | undefined): string | null => (g && !gstinProblem(g) ? g.trim().toUpperCase() : null);

export function placeOfSupplyLabel(code: string): string {
  if (code === EXPORT_CODE) return 'Outside India (export)';
  const name = stateName(code);
  return name ? `${name} (${code})` : '';
}

export function isPlaceOfSupply(code: unknown): code is string {
  return code === EXPORT_CODE || isStateCode(code);
}

type Ctx = Pick<Invoice, 'currency' | 'taxLabel' | 'seller' | 'client'> & Partial<Pick<Invoice, 'docType' | 'placeOfSupply' | 'kind'>>;

export function isBillOfSupply(inv: Partial<Pick<Invoice, 'docType'>>): boolean {
  return inv.docType === 'bill_of_supply';
}

/** The seller's GST state: their GSTIN's first two digits, else the state they chose. */
export function sellerStateOf(inv: Pick<Invoice, 'seller'>): string {
  const g = validGstin(inv.seller.gstin);
  return g ? g.slice(0, 2) : (inv.seller.state ?? '');
}

/** True when this invoice should be a GST tax invoice. A quotation never is (it's an estimate). */
export function isTaxInvoice(inv: Ctx): boolean {
  return inv.kind !== 'quote' && inv.currency === 'INR' && inv.taxLabel.trim() === 'GST' && !!validGstin(inv.seller.gstin) && !isBillOfSupply(inv);
}

/**
 * GST split for a quotation: the same place-of-supply maths as a tax invoice,
 * shown as an estimate. Only when the seller has a GSTIN and charges GST in INR.
 */
export function isGstEstimate(inv: Ctx): boolean {
  return inv.kind === 'quote' && inv.currency === 'INR' && inv.taxLabel.trim() === 'GST' && !!validGstin(inv.seller.gstin) && !isBillOfSupply(inv);
}

/** Place of supply: chosen, else the client's GSTIN state, else the client's state, else the seller's. */
export function placeOfSupplyOf(inv: Ctx): string {
  if (inv.placeOfSupply && isPlaceOfSupply(inv.placeOfSupply)) return inv.placeOfSupply;
  const cg = validGstin(inv.client.gstin);
  if (cg) return cg.slice(0, 2);
  if (inv.client.state && isStateCode(inv.client.state)) return inv.client.state;
  return sellerStateOf(inv);
}

export function splitFor(sellerState: string, pos: string): Split {
  if (!sellerState || pos === EXPORT_CODE || pos !== sellerState) return 'inter';
  return UT_WITHOUT_LEGISLATURE.has(pos) ? 'ut' : 'intra';
}

/**
 * Per-rate tax for a tax invoice. `amounts[i]` is line i's amount (0 if
 * invalid); `rates[i]` its GST rate. Returns null if any rate can't be read.
 */
export function gstSummary(inv: Ctx, amounts: number[], rates: number[], discount: number): GstSummary {
  const sellerState = sellerStateOf(inv);
  const pos = placeOfSupplyOf(inv);
  const split = splitFor(sellerState, pos);

  // Group line amounts by rate, then spread the discount in proportion.
  const groups = new Map<number, number>();
  amounts.forEach((a, i) => groups.set(rates[i], round2((groups.get(rates[i]) ?? 0) + a)));
  const subtotal = round2(amounts.reduce((s, a) => s + a, 0));
  const ordered = [...groups.entries()].sort(([a], [b]) => a - b).filter(([, amt]) => amt > 0);
  let discountLeft = round2(Math.min(discount, subtotal));

  const rows: RateRow[] = ordered.map(([rate, amount], idx) => {
    // The last group takes the rounding remainder so the discounts add up exactly.
    const share = idx === ordered.length - 1 ? discountLeft : round2((discount * amount) / (subtotal || 1));
    discountLeft = round2(discountLeft - share);
    const taxable = round2(amount - share);
    if (split === 'inter') {
      const igst = round2((taxable * rate) / 100);
      return { rate, taxable, cgst: 0, sgst: 0, igst, tax: igst };
    }
    const half = round2((taxable * rate) / 200);
    return { rate, taxable, cgst: half, sgst: half, igst: 0, tax: round2(half * 2) };
  });

  return {
    split,
    placeOfSupply: pos,
    sellerState,
    rows,
    cgst: round2(rows.reduce((s, r) => s + r.cgst, 0)),
    sgst: round2(rows.reduce((s, r) => s + r.sgst, 0)),
    igst: round2(rows.reduce((s, r) => s + r.igst, 0)),
  };
}

/** Tax-invoice numbers: at most 16 characters — letters, digits, "-" and "/" (CGST Rule 46(b)). */
export function taxInvoiceNumberProblem(number: string): string | null {
  const n = number.trim();
  if (!n) return 'A tax invoice needs a number.';
  if (n.length > 16) return 'GST invoice numbers can be at most 16 characters.';
  if (!/^[A-Za-z0-9/-]+$/.test(n)) return 'GST invoice numbers can only use letters, digits, - and /.';
  return null;
}
