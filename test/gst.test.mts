/**
 * Stage 2B: GST tax invoice maths — when an invoice is a tax invoice, place of
 * supply, CGST/SGST vs UTGST vs IGST, per-line rates with a discount spread,
 * Bill of Supply, the 16-character number rule, and amounts in words.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import { EXPORT_CODE, isTaxInvoice, placeOfSupplyLabel, placeOfSupplyOf, splitFor, taxInvoiceNumberProblem } from '../app/lib/invoice/gst-tax.ts';
import { indianNumberWords, rupeesInWords } from '../app/lib/invoice/words.ts';
import { gstinCheckChar } from '../app/lib/invoice/india.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';

const MH_GSTIN = '27AAPFU0939F1ZV'; // Maharashtra
const KA_GSTIN = '29AAGCB7383J1Z4'; // Karnataka

function inv(over: Partial<Invoice> = {}): Invoice {
  const base = newInvoice(new Date(2026, 9, 22));
  return {
    ...base,
    currency: 'INR',
    taxLabel: 'GST',
    taxRate: '18',
    seller: { ...base.seller, name: 'S', gstin: MH_GSTIN },
    client: { ...base.client, name: 'C' },
    items: [{ id: 'a', description: 'Design', qty: '1', rate: '10000' }],
    ...over,
  };
}

test('a tax invoice needs a valid seller GSTIN, INR, GST and no composition', () => {
  assert.equal(isTaxInvoice(inv()), true);
  assert.equal(isTaxInvoice(inv({ seller: { name: 'S', address: '', email: '', phone: '' } })), false, 'no GSTIN');
  assert.equal(isTaxInvoice(inv({ seller: { name: 'S', address: '', email: '', phone: '', gstin: '27AAPFU0939F1ZX' } })), false, 'bad GSTIN');
  assert.equal(isTaxInvoice(inv({ currency: 'USD' })), false);
  assert.equal(isTaxInvoice(inv({ taxLabel: 'VAT' })), false);
  assert.equal(isTaxInvoice(inv({ docType: 'bill_of_supply' })), false);
});

test('same state: CGST + SGST, half each', () => {
  const t = computeTotals(inv({ client: { name: 'C', address: '', email: '', gstin: '27AAACR5055K1Z7' } }));
  assert.equal(t.gst?.split, 'intra');
  assert.deepEqual([t.gst?.cgst, t.gst?.sgst, t.gst?.igst], [900, 900, 0]);
  assert.equal(t.total, 11800);
});

test('different state: IGST; place of supply from the client GSTIN, then state, then the seller', () => {
  const t = computeTotals(inv({ client: { name: 'C', address: '', email: '', gstin: KA_GSTIN } }));
  assert.equal(t.gst?.split, 'inter');
  assert.equal(t.gst?.placeOfSupply, '29');
  assert.deepEqual([t.gst?.cgst, t.gst?.sgst, t.gst?.igst], [0, 0, 1800]);
  assert.equal(placeOfSupplyOf(inv({ client: { name: 'C', address: '', email: '', state: '33' } })), '33');
  assert.equal(placeOfSupplyOf(inv()), '27', 'no client details: the seller’s own state');
  assert.equal(placeOfSupplyOf(inv({ placeOfSupply: '07', client: { name: 'C', address: '', email: '', gstin: KA_GSTIN } })), '07', 'chosen wins');
  assert.equal(placeOfSupplyLabel('29'), 'Karnataka (29)');
});

test('UTs without a legislature charge UTGST; Delhi, Puducherry and J&K charge SGST; exports are IGST', () => {
  for (const ut of ['04', '26', '31', '35', '38']) assert.equal(splitFor(ut, ut), 'ut', ut);
  for (const st of ['07', '34', '01']) assert.equal(splitFor(st, st), 'intra', st);
  assert.equal(splitFor('27', EXPORT_CODE), 'inter');
  assert.equal(placeOfSupplyLabel(EXPORT_CODE), 'Outside India (export)');
  // A Chandigarh seller billing in Chandigarh: CGST + UTGST, half each.
  const chdGstin = `04AAPFU0939F1Z${gstinCheckChar('04AAPFU0939F1Z')}`;
  const t = computeTotals(inv({ seller: { name: 'S', address: '', email: '', phone: '', gstin: chdGstin }, placeOfSupply: '04' }));
  assert.equal(t.gst?.split, 'ut');
  assert.deepEqual([t.gst?.cgst, t.gst?.sgst, t.gst?.igst], [900, 900, 0]);
  const exported = computeTotals(inv({ placeOfSupply: EXPORT_CODE }));
  assert.deepEqual([exported.gst?.split, exported.gst?.igst], ['inter', 1800]);
});

test('per-line rates with a discount spread in proportion; totals add up to the paise', () => {
  const t = computeTotals(
    inv({
      client: { name: 'C', address: '', email: '', gstin: KA_GSTIN },
      discountType: 'flat',
      discountValue: '1000',
      items: [
        { id: 'a', description: 'Goods', qty: '1', rate: '7500', gstRate: '5' },
        { id: 'b', description: 'Service', qty: '1', rate: '2500', gstRate: '18' },
        { id: 'c', description: 'Exempt', qty: '1', rate: '333.33', gstRate: '0' },
      ],
    }),
  );
  const rows = t.gst!.rows;
  assert.deepEqual(rows.map((r) => r.rate), [0, 5, 18]);
  // Discount 1000 over 10333.33: 0% gets 32.26, 5% gets 725.81, 18% the rest (241.93).
  assert.deepEqual(rows.map((r) => r.taxable), [301.07, 6774.19, 2258.07]);
  assert.equal(round(rows.reduce((s, r) => s + r.taxable, 0)), t.taxable);
  assert.deepEqual(rows.map((r) => r.igst), [0, 338.71, 406.45]);
  assert.equal(t.tax, 745.16);
  assert.equal(t.total, round(t.taxable + t.tax));
});

test('a line without its own rate uses the invoice rate; a bad rate is reported', () => {
  const t = computeTotals(inv({ items: [{ id: 'a', description: 'x', qty: '1', rate: '100', gstRate: 'abc' }] }));
  assert.match(t.problems.join(), /GST rate must be between 0 and 100%/);
});

test('old invoices and non-GST invoices total exactly as before', () => {
  const plain = { items: [{ id: 'a', description: 'x', qty: '2', rate: '1000' }], discountType: 'percent' as const, discountValue: '10', taxRate: '18' };
  assert.deepEqual(computeTotals(plain), { lines: [{ amount: 2000, valid: true }], subtotal: 2000, discount: 200, taxable: 1800, tax: 324, total: 2124, problems: [] });
  const noGstin = computeTotals(inv({ seller: { name: 'S', address: '', email: '', phone: '' } }));
  assert.equal(noGstin.gst, undefined);
  assert.equal(noGstin.tax, 1800);
});

test('Bill of Supply (composition): no tax at all', () => {
  const t = computeTotals(inv({ docType: 'bill_of_supply' }));
  assert.equal(t.tax, 0);
  assert.equal(t.total, 10000);
  assert.equal(t.gst, undefined);
});

test('GST invoice numbers: up to 16 characters, letters, digits, - and /', () => {
  assert.equal(taxInvoiceNumberProblem('KS/25-26/0007'), null);
  assert.match(taxInvoiceNumberProblem('INV-20261022-4827X')!, /16 characters/);
  assert.match(taxInvoiceNumberProblem('INV 0007')!, /letters, digits/);
  assert.match(taxInvoiceNumberProblem('')!, /needs a number/);
});

test('amounts in words, the Indian way', () => {
  assert.equal(indianNumberWords(0), 'Zero');
  assert.equal(indianNumberWords(53100), 'Fifty-Three Thousand One Hundred');
  assert.equal(indianNumberWords(125000), 'One Lakh Twenty-Five Thousand');
  assert.equal(indianNumberWords(12500000), 'One Crore Twenty-Five Lakh');
  assert.equal(indianNumberWords(1234567891), 'One Hundred Twenty-Three Crore Forty-Five Lakh Sixty-Seven Thousand Eight Hundred Ninety-One');
  assert.equal(rupeesInWords(53100), 'Rupees Fifty-Three Thousand One Hundred Only');
  assert.equal(rupeesInWords(1180.5), 'Rupees One Thousand One Hundred Eighty and Fifty Paise Only');
  assert.equal(rupeesInWords(0.07), 'Rupees Zero and Seven Paise Only');
});

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
