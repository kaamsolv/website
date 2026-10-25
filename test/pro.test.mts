/**
 * Stage 2C-1 (Invoice Pro): templates and brand colour, quotations with their
 * own numbering, converting a quotation into an invoice, and the dashboard
 * counting invoices only. Real Postgres (PGlite) with the real migrations.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, subscriptions } from '../db/schema.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { convertQuote, createInvoice, getDashboard, getInvoice, getProfile, listInvoices, saveSettings, DEFAULT_SETTINGS } from '../db/invoices.ts';
import { entitlementsFrom } from '../app/lib/entitlements.ts';
import { cleanDesign, contrastRatio, isHexColor, NAVY, textOn, WHITE } from '../app/lib/invoice/design.ts';
import { cleanSettings } from '../app/lib/invoice/settings.ts';
import { cleanInvoice } from '../app/lib/invoice/validate.ts';
import { isGstEstimate, isTaxInvoice } from '../app/lib/invoice/gst-tax.ts';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

async function makeUser(email: string, pro = false): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  if (pro) await db.insert(subscriptions).values({ userId: u.id, provider: 'manual', providerRef: `manual:${email}`, planKey: 'invoice_pro', status: 'active' });
  return u.id;
}
function doc(number: string, over: Partial<Invoice> = {}): Invoice {
  const inv = newInvoice(new Date(2026, 9, 22));
  return { ...inv, number, client: { ...inv.client, name: 'Acme' }, items: [{ id: 'a', description: 'Work', qty: '2', rate: '1000' }], ...over };
}

test('brand colour: text on it is white or navy, whichever reads better', () => {
  assert.equal(textOn('#0C2248'), WHITE, 'white on navy');
  assert.equal(textOn('#FDBD43'), NAVY, 'navy on yellow');
  assert.equal(textOn('#FFFFFF'), NAVY);
  for (const hex of ['#FE6336', '#38BBAC', '#6934D0', '#2E7D32', '#8B1E3F', '#123456', '#ABCDEF']) {
    assert.ok(contrastRatio(hex, textOn(hex)) >= 3, `${hex} keeps at least 3:1 for its bold text`);
  }
});

test('hex colours and designs are checked; anything unreadable falls back', () => {
  assert.equal(isHexColor('#fe6336'), true);
  assert.equal(isHexColor('#FE633'), false);
  assert.equal(isHexColor('red'), false);
  assert.equal(isHexColor('#FE6336; x'), false);
  assert.deepEqual(cleanDesign({ template: 'bold', color: '#0c2248' }), { template: 'bold', color: '#0C2248' });
  assert.deepEqual(cleanDesign({ template: 'fancy', color: 'url(x)' }), { template: 'classic', color: '#FE6336' });
  assert.deepEqual(cleanDesign(null), { template: 'classic', color: '#FE6336' });
});

test('a free account can’t save a quotation or a design by editing the request; Pro keeps both', () => {
  const sneaky = { ...doc('INV-0001'), kind: 'quote', design: { template: 'bold', color: '#6934D0' } };
  const free = cleanInvoice(sneaky, { maxItems: 10 });
  assert.ok(free.ok);
  assert.equal(free.ok && free.invoice.kind, undefined);
  assert.equal(free.ok && free.invoice.design, undefined);

  const pro = cleanInvoice(sneaky, { maxItems: 200, allowQuote: true, allowDesign: true });
  assert.ok(pro.ok);
  assert.equal(pro.ok && pro.invoice.kind, 'quote');
  assert.deepEqual(pro.ok && pro.invoice.design, { template: 'bold', color: '#6934D0' });

  const odd = cleanInvoice({ ...doc('X'), kind: 'receipt' }, { maxItems: 10, allowQuote: true });
  assert.equal(odd.ok && odd.invoice.kind, undefined, 'only "quote" is kept');
});

test('plans: templates, brand colour, quotations, no footer and unlimited items are Pro', async () => {
  const free = entitlementsFrom(await getEntitlements(db, await makeUser('plan-free@example.test')));
  const pro = entitlementsFrom(await getEntitlements(db, await makeUser('plan-pro@example.test', true)));
  for (const key of ['invoice_templates', 'invoice_brand_color', 'invoice_quote_mode', 'invoice_watermark_remove', 'invoice_unlimited_items'] as const) {
    assert.equal(free.can(key), false, `${key} free`);
    assert.equal(pro.can(key), true, `${key} Pro`);
  }
});

test('a quotation is never a tax invoice; with a GSTIN its GST is an estimate', () => {
  const gst = doc('QT-0001', {
    kind: 'quote',
    currency: 'INR',
    taxLabel: 'GST',
    taxRate: '18',
    seller: { ...newInvoice().seller, name: 'S', gstin: '27AAPFU0939F1ZV' },
  });
  assert.equal(isTaxInvoice(gst), false);
  assert.equal(isGstEstimate(gst), true);
  const t = computeTotals(gst);
  assert.equal(t.gst?.cgst, 180);
  assert.equal(t.total, 2360);
  assert.equal(isTaxInvoice({ ...gst, kind: undefined }), true, 'the same document as an invoice is a tax invoice');
  assert.equal(isGstEstimate({ ...gst, kind: undefined }), false);
});

test('settings: quotation prefix and number, default template and colour are checked', () => {
  const ok = cleanSettings({ ...DEFAULT_SETTINGS, quotePrefix: 'EST-', quoteNextNumber: 4, defaultTemplate: 'minimal', defaultBrandColor: '#38bbac' });
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.value.defaultBrandColor, '#38BBAC');
  const bad = cleanSettings({ ...DEFAULT_SETTINGS, quotePrefix: 'Q T!', quoteNextNumber: 0, defaultBrandColor: 'teal' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(!bad.ok ? bad.errors : {}).sort(), ['defaultBrandColor', 'quoteNextNumber', 'quotePrefix']);
});

test('quotation numbers run on their own: QT-0001, QT-0002 — invoice numbers don’t move', async () => {
  const id = await makeUser('quotes@example.test', true);
  await saveSettings(db, id, { ...DEFAULT_SETTINGS, name: 'Me' });
  let p = await getProfile(db, id);
  assert.equal(p?.nextNumber, 'INV-0001');
  assert.equal(p?.nextQuoteNumber, 'QT-0001');

  await createInvoice(db, id, doc('QT-0001', { kind: 'quote' }), null);
  p = await getProfile(db, id);
  assert.equal(p?.nextQuoteNumber, 'QT-0002');
  assert.equal(p?.nextNumber, 'INV-0001', 'the invoice sequence is untouched');

  await createInvoice(db, id, doc('INV-0001'), null);
  p = await getProfile(db, id);
  assert.equal(p?.nextNumber, 'INV-0002');
  assert.equal(p?.nextQuoteNumber, 'QT-0002');

  const kinds = (await listInvoices(db, id)).map((x) => x.kind).sort();
  assert.deepEqual(kinds, ['invoice', 'quote']);
});

test('converting a quotation makes a new invoice with the same lines and the next invoice number', async () => {
  const id = await makeUser('convert@example.test', true);
  await saveSettings(db, id, { ...DEFAULT_SETTINGS, name: 'Me', defaultDueDays: 7 });
  await createInvoice(db, id, doc('INV-0001'), null);
  const q = await createInvoice(db, id, doc('QT-0001', { kind: 'quote', dueDate: '2026-11-21', design: { template: 'bold', color: '#6934D0' } }), null);
  assert.ok(q.ok);

  const made = await convertQuote(db, id, q.ok ? q.id : '', '2026-10-25', null);
  assert.ok(made?.ok);
  const inv = await getInvoice(db, id, made!.ok ? made!.id : '');
  assert.equal(inv?.invoice.kind, undefined, 'an invoice');
  assert.equal(inv?.invoice.number, 'INV-0002');
  assert.equal(inv?.invoice.issueDate, '2026-10-25');
  assert.equal(inv?.invoice.dueDate, '2026-11-01', 'the account’s days to pay');
  assert.equal(inv?.invoice.client.name, 'Acme');
  assert.deepEqual(inv?.invoice.items.map((x) => [x.description, x.qty, x.rate]), [['Work', '2', '1000']]);
  assert.deepEqual(inv?.invoice.design, { template: 'bold', color: '#6934D0' }, 'the look carries over');

  const quote = await getInvoice(db, id, q.ok ? q.id : '');
  assert.equal(quote?.invoice.kind, 'quote', 'the quotation stays as it was');
  assert.equal(quote?.invoice.number, 'QT-0001');
  assert.equal((await getProfile(db, id))?.nextNumber, 'INV-0003');

  // Only a quotation of this user's converts.
  const invId = made!.ok ? made!.id : '';
  assert.equal(await convertQuote(db, id, invId, '2026-10-25', null), null, 'an invoice isn’t converted');
  const other = await makeUser('convert-other@example.test', true);
  assert.equal(await convertQuote(db, other, q.ok ? q.id : '', '2026-10-25', null), null, 'someone else’s quotation');
  // The save limit still applies.
  const full = await convertQuote(db, id, q.ok ? q.id : '', '2026-10-25', 3);
  assert.equal(full?.ok, false);
});

test('the dashboard counts invoices only — quotations aren’t money owed', async () => {
  const id = await makeUser('dash-quotes@example.test', true);
  await createInvoice(db, id, doc('INV-0001', { issueDate: '2026-10-05', dueDate: '2026-10-10' }), null);
  await createInvoice(db, id, doc('QT-0001', { kind: 'quote', issueDate: '2026-10-05', dueDate: '2026-10-10' }), null);
  const { totals, recent } = await getDashboard(db, id, '2026-10-22', '2026-10-01');
  assert.equal(totals.length, 1);
  assert.equal(totals[0].billedThisMonth, 2000);
  assert.equal(totals[0].unpaid, 2000);
  assert.equal(totals[0].overdueCount, 1);
  assert.deepEqual(recent.map((r) => r.number), ['INV-0001']);
});
