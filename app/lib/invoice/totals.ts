import { gstSummary, isBillOfSupply, isTaxInvoice, type GstSummary } from './gst-tax';
import type { Invoice, LineItem } from './types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "1,25,000" / " 12.5 " / "₹500" → number; empty → 0; junk → NaN. */
export function parseNumber(input: string): number {
  const cleaned = input.replace(/[,\s₹$€£]/g, '');
  if (cleaned === '') return 0;
  return /^-?\d*\.?\d*$/.test(cleaned) && cleaned !== '.' && cleaned !== '-' ? Number(cleaned) : Number.NaN;
}

export type LineResult = { amount: number; valid: boolean };

export function lineAmount(item: LineItem): LineResult {
  const qty = parseNumber(item.qty);
  const rate = parseNumber(item.rate);
  const valid = Number.isFinite(qty) && Number.isFinite(rate) && qty >= 0 && rate >= 0;
  return { amount: valid ? round2(qty * rate) : 0, valid };
}

export type Totals = {
  lines: LineResult[];
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  /** Fields that couldn't be read; shown inline, never silently guessed. */
  problems: string[];
  /** Present on a GST tax invoice: place of supply, split and per-rate rows (gst-tax.ts). */
  gst?: GstSummary;
};

/** What the totals need. The GST fields are optional so plain invoices (and old ones) work unchanged. */
export type TotalsInput = Pick<Invoice, 'items' | 'discountType' | 'discountValue' | 'taxRate'> &
  Partial<Pick<Invoice, 'currency' | 'taxLabel' | 'seller' | 'client' | 'placeOfSupply' | 'docType'>>;

/**
 * Subtotal → discount (flat, or % of subtotal; never more than the subtotal)
 * → tax on the discounted amount → total. Rounded to 2 decimals at each step,
 * the way invoices are written.
 */
export function computeTotals(invoice: TotalsInput): Totals {
  const problems: string[] = [];
  const lines = invoice.items.map(lineAmount);
  lines.forEach((l, i) => {
    if (!l.valid) problems.push(`Item ${i + 1}: quantity and rate must be numbers, 0 or more.`);
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));

  const dv = parseNumber(invoice.discountValue);
  let discount = 0;
  if (!Number.isFinite(dv) || dv < 0) problems.push('Discount must be a number, 0 or more.');
  else if (invoice.discountType === 'percent') {
    if (dv > 100) problems.push('A percentage discount can’t be more than 100%.');
    else discount = round2((subtotal * dv) / 100);
  } else {
    discount = round2(Math.min(dv, subtotal));
  }

  const taxable = round2(subtotal - discount);

  // Composition scheme: a Bill of Supply carries no tax.
  if (isBillOfSupply(invoice)) return { lines, subtotal, discount, taxable, tax: 0, total: taxable, problems };

  // GST tax invoice: each line at its own rate (or the invoice's), split by place of supply.
  if (invoice.currency && invoice.taxLabel !== undefined && invoice.seller && invoice.client) {
    const ctx = { currency: invoice.currency, taxLabel: invoice.taxLabel, seller: invoice.seller, client: invoice.client, docType: invoice.docType, placeOfSupply: invoice.placeOfSupply };
    if (isTaxInvoice(ctx)) {
      const rates = invoice.items.map((it, i) => {
        const raw = it.gstRate?.trim() ? it.gstRate : invoice.taxRate;
        const r = parseNumber(raw);
        if (!Number.isFinite(r) || r < 0 || r > 100) {
          problems.push(`Item ${i + 1}: GST rate must be between 0 and 100%.`);
          return 0;
        }
        return r;
      });
      const gst = gstSummary(ctx, lines.map((l) => l.amount), rates, discount);
      const tax = round2(gst.cgst + gst.sgst + gst.igst);
      return { lines, subtotal, discount, taxable, tax, total: round2(taxable + tax), problems, gst };
    }
  }

  const tr = parseNumber(invoice.taxRate);
  let tax = 0;
  if (!Number.isFinite(tr) || tr < 0 || tr > 100) problems.push('Tax rate must be between 0 and 100%.');
  else tax = round2((taxable * tr) / 100);

  return { lines, subtotal, discount, taxable, tax, total: round2(taxable + tax), problems };
}
