/**
 * The QR Pro page's facts: the static sample QR, the made-up report, the copy's numbers, the price/checkout
 * states, and the guard that the Invoice Pro bundle cross-sell lives in the generic product page (untouched).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parsePlanPrice, priceSentence } from '../app/lib/billing/plan-price.ts';
import { EXPORT_MAX_SCANS } from '../app/lib/qr/campaigns.ts';
import { createMatrix } from '../app/lib/qr/matrix.ts';
import { QR_FREE_STRIP, QR_PRO_FACTS, QR_SCAN_NOTE, QR_STATUS_ERROR, QR_UNAVAILABLE } from '../app/lib/qr/pro-facts.ts';
import { SAMPLE_BREAKDOWNS, SAMPLE_QR_ROWS, SAMPLE_QR_SIZE, SAMPLE_URL, sampleDays } from '../app/lib/qr/sample-report.ts';
import { PRODUCTS } from '../app/lib/products.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the sample QR is static, for the production free generator, and equals what the generator makes', () => {
  assert.equal(SAMPLE_URL, 'https://kaamsolv.com/qr-code-generator');
  const m = createMatrix(SAMPLE_URL, 'M');
  assert.equal(m.size, SAMPLE_QR_SIZE);
  assert.equal(SAMPLE_QR_ROWS.length, SAMPLE_QR_SIZE);
  const stored = SAMPLE_QR_ROWS.join('');
  const made = m.data.map((b) => (b ? '1' : '0')).join('');
  assert.equal(stored, made, 'regenerate SAMPLE_QR_ROWS in app/lib/qr/sample-report.ts');
});

test('the made-up report is deterministic, ninety days, and its breakdowns each add to 100%', () => {
  const a = sampleDays();
  assert.deepEqual(a, sampleDays());
  assert.equal(a.length, 90);
  assert.ok(a.every((v) => Number.isInteger(v) && v > 0));
  for (const b of SAMPLE_BREAKDOWNS) assert.equal(b.items.reduce((n, i) => n + i.percent, 0), 100, b.title);
  assert.deepEqual(SAMPLE_BREAKDOWNS.map((b) => b.title), ['Where (country)', 'Device type', 'Referring site']); // the real analytics cards' titles
});

test('the copy carries the export cap from code, as detail, and none of what the page must not promise', () => {
  const text = [...QR_PRO_FACTS.flatMap((f) => [f.title, f.body, f.detail ?? '']), QR_FREE_STRIP, QR_SCAN_NOTE, QR_UNAVAILABLE, QR_STATUS_ERROR].join(' ');
  const cap = EXPORT_MAX_SCANS.toLocaleString('en-IN');
  assert.equal(cap, '50,000');
  const csv = QR_PRO_FACTS.find((f) => f.title === 'CSV export')!;
  assert.ok(csv.detail?.includes(cap), 'the cap is the CSV row’s secondary detail');
  assert.ok(!csv.body.includes(cap), 'and not its headline');
  assert.doesNotMatch(text, /2,?000/, 'no per-account code ceiling');
  assert.doesNotMatch(text, /\b50 campaigns|campaigns? (cap|limit)/i, 'no campaign ceiling');
  assert.doesNotMatch(text, /no ads/i);
  assert.doesNotMatch(text, /bundle/i);
  assert.doesNotMatch(text, /two months|annual|yearly saving/i);
  assert.equal(QR_PRO_FACTS.length, 5);
});

test('price and checkout: available only when payments are configured and the plan has a price', () => {
  const row = (planKey: string, period: string, amountPaise: number) => ({ planKey, period, amountPaise, name: planKey, currency: 'INR' });
  const body = (over: Record<string, unknown> = {}) => ({
    ok: true,
    configured: true,
    taxRate: 18,
    prices: [row('invoice_pro', 'month', 15000), row('qr_pro', 'month', 9900), row('qr_pro', 'year', 99000), row('invoice_qr_bundle', 'month', 19900)],
    ...over,
  });

  const both = parsePlanPrice(body(), 'qr_pro');
  assert.equal(both.status, 'available');
  if (both.status === 'available') {
    assert.equal(both.taxRate, 18);
    assert.equal(priceSentence(both.prices), '₹99 a month or ₹990 a year'); // the bundle and Invoice Pro rows are ignored
  }
  const monthOnly = parsePlanPrice(body({ prices: [row('qr_pro', 'month', 9900)], taxRate: null }), 'qr_pro');
  assert.equal(monthOnly.status === 'available' && monthOnly.taxRate, null);
  assert.equal(monthOnly.status === 'available' && priceSentence(monthOnly.prices), '₹99 a month');
  const yearOnly = parsePlanPrice(body({ prices: [row('qr_pro', 'year', 99000)] }), 'qr_pro');
  assert.equal(yearOnly.status === 'available' && priceSentence(yearOnly.prices), '₹990 a year');

  assert.deepEqual(parsePlanPrice(body({ configured: false }), 'qr_pro'), { status: 'unavailable' });
  assert.deepEqual(parsePlanPrice(body({ prices: [row('invoice_pro', 'month', 15000)] }), 'qr_pro'), { status: 'unavailable' }, 'configured but no QR Pro price');
  assert.deepEqual(parsePlanPrice(body({ prices: [row('qr_pro', 'month', 0), row('qr_pro', 'week', 100), row('qr_pro', 'year', 'x')] }), 'qr_pro'), { status: 'unavailable' }, 'invalid rows are not prices');
  assert.equal((parsePlanPrice(body({ taxRate: Number.NaN }), 'qr_pro') as { taxRate: number | null }).taxRate, null);

  for (const bad of [null, undefined, 'x', 3, {}, { ok: false, configured: true, prices: [] }, { ok: true, prices: [] }, { ok: true, configured: true, prices: 'x' }]) {
    assert.deepEqual(parsePlanPrice(bad, 'qr_pro'), { status: 'error' });
  }
});

test('QR is the only product with its own page title; the heading is "QR Pro" and its copy is not in the nav-facing data', () => {
  assert.deepEqual(PRODUCTS.filter((p) => p.pageTitle).map((p) => [p.slug, p.pageTitle]), [['qr', 'QR Pro']]);
  assert.equal(PRODUCTS.find((p) => p.slug === 'qr')!.name, 'QR codes'); // the sidebar row and top bar keep this
  const qr = PRODUCTS.find((p) => p.slug === 'qr')!;
  assert.deepEqual([qr.pro, qr.free], [[], []]);
});

test('the Invoice Pro bundle cross-sell stays in the generic product page, byte for byte, and out of the QR page', () => {
  const generic = read('app/_components/account/product-page.tsx');
  assert.match(generic, /Invoice Pro and QR Pro are also sold together as a bundle\./);
  assert.match(generic, /\{p\.planKey && !subscribed && \(/);
  assert.match(generic, /product\.slug === 'qr' \? <QrProPage product=\{product\} \/> : <GenericProductPage product=\{product\} \/>/);
  for (const file of ['app/_components/account/qr-pro-page.tsx', 'app/_components/account/qr-pro-specimen.tsx', 'app/lib/qr/pro-facts.ts', 'app/lib/qr/sample-report.ts']) {
    assert.doesNotMatch(read(file), /bundle/i, file);
  }
});
