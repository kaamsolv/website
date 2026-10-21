import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, lineAmount, parseNumber } from '../app/lib/invoice/totals.ts';
import { formatMoney } from '../app/lib/invoice/money.ts';
import { addDays, hasContent, isoDate, newInvoice, newInvoiceNumber, newLineItem } from '../app/lib/invoice/defaults.ts';
import { MAX_FREE_ITEMS } from '../app/lib/invoice/limits.ts';
import { ENTITLEMENT_KEYS, NO_ENTITLEMENTS, entitlementsFrom } from '../app/lib/entitlements.ts';

const item = (qty: string, rate: string) => ({ ...newLineItem(), qty, rate });
const base = { discountType: 'percent' as const, discountValue: '', taxRate: '' };

test('parse numbers as people type them', () => {
  assert.equal(parseNumber('1,25,000'), 125000);
  assert.equal(parseNumber(' ₹500 '), 500);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.ok(Number.isNaN(parseNumber('12abc')));
  assert.ok(Number.isNaN(parseNumber('.')));
});

test('line amount = qty × rate, rounded to paise; invalid flagged', () => {
  assert.deepEqual(lineAmount(item('3', '333.33')), { amount: 999.99, valid: true });
  assert.deepEqual(lineAmount(item('1.5', '2.25')), { amount: 3.38, valid: true }); // 3.375 → 3.38
  assert.deepEqual(lineAmount(item('-1', '50')), { amount: 0, valid: false });
  assert.deepEqual(lineAmount(item('2', '')), { amount: 0, valid: true }); // empty rate = 0, not an error
});

test('subtotal → % discount → tax on discounted amount → total', () => {
  const t = computeTotals({ items: [item('2', '5000'), item('1', '2500')], discountType: 'percent', discountValue: '10', taxRate: '18' });
  assert.equal(t.subtotal, 12500);
  assert.equal(t.discount, 1250);
  assert.equal(t.taxable, 11250);
  assert.equal(t.tax, 2025);
  assert.equal(t.total, 13275);
  assert.deepEqual(t.problems, []);
});

test('flat discount never exceeds the subtotal; zero rows are fine', () => {
  const t = computeTotals({ items: [item('1', '400'), item('1', '')], discountType: 'flat', discountValue: '1000', taxRate: '5' });
  assert.equal(t.discount, 400);
  assert.equal(t.total, 0);
});

test('bad inputs are reported, not guessed', () => {
  const t = computeTotals({ items: [item('x', '10')], discountType: 'percent', discountValue: '150', taxRate: '-2' });
  assert.equal(t.problems.length, 3);
  assert.equal(t.total, 0);
});

test('currency formatting per code', () => {
  assert.equal(formatMoney(125000, 'INR'), '₹1,25,000.00');
  assert.equal(formatMoney(1250.5, 'USD'), '$1,250.50');
  assert.equal(formatMoney(1250.5, 'EUR'), '€1,250.50');
  assert.equal(formatMoney(1250.5, 'GBP'), '£1,250.50');
  assert.equal(formatMoney(1250.5, 'AED'), 'AED 1,250.50');
});

test('invoice number and dates', () => {
  assert.equal(newInvoiceNumber(new Date(2026, 9, 21), () => 0.4827), 'INV-20261021-4827');
  assert.equal(isoDate(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(addDays('2026-10-21', 14), '2026-11-04');
  assert.equal(addDays('2026-12-25', 14), '2027-01-08');
  const inv = newInvoice(new Date(2026, 9, 21));
  assert.equal(inv.dueDate, '2026-11-04');
  assert.equal(inv.items.length, 1);
  assert.equal(hasContent(inv), false);
  assert.equal(hasContent({ ...inv, client: { ...inv.client, name: 'Acme' } }), true);
});

test('free tier: 10 items, and no paid entitlements by default', () => {
  assert.equal(MAX_FREE_ITEMS, 10);
  const free = entitlementsFrom(NO_ENTITLEMENTS);
  for (const key of ENTITLEMENT_KEYS) assert.equal(free.can(key), false, key);
  assert.equal(entitlementsFrom(['invoice_save']).can('invoice_save'), true);
  assert.equal(entitlementsFrom(['invoice_save']).can('invoice_watermark_remove'), false);
});
