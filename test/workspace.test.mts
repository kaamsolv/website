/**
 * Stage 2A: GST rates, Indian identifiers, Settings, saved customers/items
 * (free limit 3 customers), customer links, numbering with a prefix, and the
 * Pro dashboard. Real Postgres (PGlite) with the real migrations.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, invoices, planFeatures, subscriptions } from '../db/schema.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { createInvoice, getDashboard, getInvoice, getProfile, saveSettings, setInvoiceStatus, updateInvoice, DEFAULT_SETTINGS } from '../db/invoices.ts';
import { createCustomer, createItem, deleteCustomer, getCustomer, listCustomers, listItems, updateCustomer } from '../db/directory.ts';
import { entitlementsFrom } from '../app/lib/entitlements.ts';
import { GST_RATES, isListedGstRate } from '../app/lib/invoice/gst.ts';
import { GST_STATES, gstinCheckChar, gstinProblem, hsnProblem, ifscProblem, stateName, upiProblem } from '../app/lib/invoice/india.ts';
import { cleanCustomer, cleanItem, cleanSettings } from '../app/lib/invoice/settings.ts';
import { cleanInvoice, formatSequentialNumber, sequenceOf } from '../app/lib/invoice/validate.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

async function makeUser(email: string): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}
const customer = (name: string) => ({ name, contactName: '', email: '', phone: '', address: '', stateCode: '27', gstin: '' });
function doc(number: string, over: Partial<ReturnType<typeof newInvoice>> = {}) {
  const inv = newInvoice(new Date(2026, 9, 10));
  return { ...inv, number, items: [{ id: 'a', description: 'Work', qty: '1', rate: '1000' }], ...over };
}

test('GST rates: the post-22 Sept 2025 slabs; 12% and 28% are no longer listed', () => {
  assert.deepEqual([...GST_RATES], ['0', '0.25', '3', '5', '18', '40']);
  assert.equal(isListedGstRate('12'), false);
  assert.equal(isListedGstRate('28'), false);
  assert.equal(isListedGstRate(' 18 '), true);
});

test('GSTIN: format, state code and the official check character', () => {
  assert.equal(gstinCheckChar('27AAPFU0939F1Z'), 'V');
  assert.equal(gstinProblem('27AAPFU0939F1ZV'), null);
  assert.equal(gstinProblem('27aapfu0939f1zv'), null, 'lower case is normalised');
  assert.match(gstinProblem('27AAPFU0939F1ZX')!, /typo/);
  assert.match(gstinProblem('27AAPFU0939F1Z')!, /15 characters/);
  assert.match(gstinProblem('00AAPFU0939F1ZV')!, /state code/);
  assert.match(gstinProblem('27AAPF10939F1ZV')!, /look like a GSTIN/);
});

test('IFSC, UPI, HSN and state codes', () => {
  assert.equal(ifscProblem('hdfc0001234'), null);
  assert.ok(ifscProblem('HDFC1001234'));
  assert.equal(upiProblem('pat.sharma@okhdfc'), null);
  assert.ok(upiProblem('pat sharma'));
  assert.equal(hsnProblem('9983'), null);
  assert.equal(hsnProblem('998314'), null);
  assert.ok(hsnProblem('99831'));
  assert.equal(stateName('27'), 'Maharashtra');
  assert.equal(stateName('38'), 'Ladakh');
  assert.equal(GST_STATES.some(([c]) => c === '28' || c === '25'), false, 'retired codes are not offered');
});

test('plans: customers free up to 3, items free, dashboard and currency rates Pro only', async () => {
  const id = await makeUser('plans@example.test');
  const free = entitlementsFrom(await getEntitlements(db, id));
  assert.equal(free.limit('invoice_client_directory'), 3);
  assert.equal(free.can('invoice_item_catalogue'), true);
  assert.equal(free.limit('invoice_item_catalogue'), null);
  assert.equal(free.can('invoice_dashboard'), false);
  assert.equal(free.can('invoice_fx_rates'), false);
  assert.equal(free.limit('invoice_save'), 20, 'unchanged');

  await db.insert(subscriptions).values({ userId: id, provider: 'manual', providerRef: 'manual:plans', planKey: 'invoice_pro', status: 'active' });
  const pro = entitlementsFrom(await getEntitlements(db, id));
  assert.equal(pro.limit('invoice_client_directory'), null);
  assert.equal(pro.can('invoice_dashboard'), true);
  assert.equal(pro.can('invoice_fx_rates'), true);
  const proKeys = (await db.select().from(planFeatures).where(eq(planFeatures.planKey, 'invoice_pro'))).length;
  assert.equal(proKeys, 13);
});

test('customers: a free account saves 3; the 4th is refused; Pro limit null is fine', async () => {
  const id = await makeUser('cust-limit@example.test');
  for (const n of ['A', 'B', 'C']) assert.equal((await createCustomer(db, id, customer(n), 3)).ok, true);
  assert.deepEqual(await createCustomer(db, id, customer('D'), 3), { ok: false, reason: 'limit' });
  assert.equal((await createCustomer(db, id, customer('D'), null)).ok, true);
  assert.deepEqual((await listCustomers(db, id, 'b')).map((c) => c.name), ['B']);
});

test('customers and items are private: another user can’t read, change or list them', async () => {
  const a = await makeUser('dir-a@example.test');
  const b = await makeUser('dir-b@example.test');
  const made = await createCustomer(db, a, customer('Secret Co'), 3);
  assert.ok(made.ok);
  const cid = made.ok ? made.id : '';
  assert.equal(await getCustomer(db, b, cid), null);
  assert.equal(await updateCustomer(db, b, cid, customer('Pwned')), false);
  assert.equal(await deleteCustomer(db, b, cid), false);
  assert.deepEqual(await listCustomers(db, b), []);
  await createItem(db, a, { name: 'Logo design', hsnSac: '998391', unit: 'pcs', rate: '5000', gstRate: '18' }, null);
  assert.deepEqual(await listItems(db, b), []);
  assert.equal((await listItems(db, a, '9983')).length, 1, 'search by HSN');
});

test('an invoice links only to the user’s own customer; deleting the customer keeps the invoice', async () => {
  const a = await makeUser('link-a@example.test');
  const b = await makeUser('link-b@example.test');
  const mine = await createCustomer(db, a, customer('Mine'), 3);
  const theirs = await createCustomer(db, b, customer('Theirs'), 3);
  const cid = mine.ok ? mine.id : '';
  const foreign = theirs.ok ? theirs.id : '';

  const linked = await createInvoice(db, a, doc('L-1', { customerId: cid }), 20);
  const sneaky = await createInvoice(db, a, doc('L-2', { customerId: foreign }), 20);
  const [r1] = await db.select({ c: invoices.customerId }).from(invoices).where(eq(invoices.id, linked.ok ? linked.id : ''));
  const [r2] = await db.select({ c: invoices.customerId }).from(invoices).where(eq(invoices.id, sneaky.ok ? sneaky.id : ''));
  assert.equal(r1.c, cid);
  assert.equal(r2.c, null, 'another user’s customer id is never linked');

  await deleteCustomer(db, a, cid);
  const kept = await getInvoice(db, a, linked.ok ? linked.id : '');
  assert.ok(kept, 'invoice survives');
  assert.equal(kept?.invoice.customerId, null);
});

test('settings: validation messages, and numbering follows the prefix', async () => {
  const bad = cleanSettings({ ...DEFAULT_SETTINGS, gstin: '27AAPFU0939F1ZX', bankIfsc: 'NOPE', upiId: 'x', invoicePrefix: 'IN V#', defaultDueDays: 400, showUpiQr: true });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['bankIfsc', 'defaultDueDays', 'gstin', 'invoicePrefix', 'upiId']);
  const mismatch = cleanSettings({ ...DEFAULT_SETTINGS, stateCode: '29', gstin: '27AAPFU0939F1ZV' });
  assert.equal(mismatch.ok, false, 'GSTIN state must match the chosen state');

  const id = await makeUser('settings@example.test');
  const good = cleanSettings({ ...DEFAULT_SETTINGS, name: 'Pat Studio', stateCode: '27', gstin: '27aapfu0939f1zv', invoicePrefix: 'KS/25-26/', nextSequence: 41 });
  assert.ok(good.ok);
  if (good.ok) await saveSettings(db, id, good.value);
  const p = await getProfile(db, id);
  assert.equal(p?.gstin, '27AAPFU0939F1ZV');
  assert.equal(p?.nextNumber, 'KS/25-26/0041');
  await createInvoice(db, id, doc('KS/25-26/0041'), 20);
  assert.equal((await getProfile(db, id))?.nextNumber, 'KS/25-26/0042');
  assert.equal(sequenceOf('INV-0007', 'KS/'), null);
  assert.equal(formatSequentialNumber(3, 'A-'), 'A-0003');
});

test('customer and item cleaning', () => {
  const c = cleanCustomer({ name: 'Acme', gstin: '27AAPFU0939F1ZV' });
  assert.ok(c.ok);
  if (c.ok) assert.equal(c.value.stateCode, '27', 'state taken from the GSTIN');
  assert.equal(cleanCustomer({ name: '' }).ok, false);
  assert.equal(cleanItem({ name: 'X', hsnSac: '12345' }).ok, false);
  assert.equal(cleanItem({ name: 'X', gstRate: '120' }).ok, false);
});

test('invoice documents keep valid GSTINs, states, HSN and payment details — and drop bad ones', () => {
  const r = cleanInvoice(
    {
      ...doc('G-1'),
      seller: { name: 'S', gstin: '27aapfu0939f1zv', state: '27' },
      client: { name: 'C', gstin: 'BROKEN', state: '99x' },
      items: [{ id: '1', description: 'Design', qty: '1', rate: '1', hsn: '9983 91', unit: 'hrs' }],
      payment: { accountName: 'Pat', accountNumber: '5010 0123', ifsc: 'hdfc0001234', bankName: 'HDFC', upiId: 'pat@ok', showUpiQr: true },
    },
    { maxItems: 10 },
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.invoice.seller.gstin, '27AAPFU0939F1ZV');
  assert.equal(r.invoice.seller.state, '27');
  assert.equal(r.invoice.client.gstin, undefined);
  assert.equal(r.invoice.client.state, undefined);
  assert.equal(r.invoice.items[0].hsn, '998391');
  assert.equal(r.invoice.payment?.accountNumber, '50100123');
  assert.equal(r.invoice.payment?.ifsc, 'HDFC0001234');
});

test('dashboard (Pro): billed this month, unpaid, overdue per currency; marking paid', async () => {
  const id = await makeUser('dash@example.test');
  const mk = async (number: string, issueDate: string, dueDate: string, rate: string, currency: 'INR' | 'USD' = 'INR') => {
    const r = await createInvoice(db, id, doc(number, { issueDate, dueDate, currency, items: [{ id: 'a', description: 'x', qty: '1', rate }] }), null);
    return r.ok ? r.id : '';
  };
  const paidOne = await mk('D-1', '2026-10-05', '2026-10-19', '1000'); // this month, will be paid
  await mk('D-2', '2026-10-10', '2026-10-30', '2000'); // this month, unpaid, not yet due
  await mk('D-3', '2026-09-01', '2026-09-15', '500'); // last month, overdue
  await mk('D-4', '2026-10-12', '2026-10-26', '100', 'USD');
  assert.equal(await setInvoiceStatus(db, id, paidOne, 'paid'), true);

  const { totals, recent } = await getDashboard(db, id, '2026-10-22', '2026-10-01');
  const inr = totals.find((t) => t.currency === 'INR')!;
  assert.equal(totals[0].currency, 'INR', 'INR first');
  assert.equal(inr.billedThisMonth, 3000);
  assert.equal(inr.unpaid, 2500);
  assert.equal(inr.overdue, 500);
  assert.equal(inr.overdueCount, 1);
  assert.equal(totals.find((t) => t.currency === 'USD')?.unpaid, 100);
  assert.equal(recent.length, 4);

  const other = await makeUser('dash-other@example.test');
  assert.equal(await setInvoiceStatus(db, other, paidOne, 'unpaid'), false, 'another user can’t change status');
  assert.deepEqual((await getDashboard(db, other, '2026-10-22', '2026-10-01')).totals, []);
  await updateInvoice(db, id, paidOne, doc('D-1', { issueDate: '2026-10-05', dueDate: '2026-10-19' }));
  assert.equal((await getInvoice(db, id, paidOne))?.status, 'paid', 'editing keeps the paid status');
});

test('deleting the account also removes saved customers and items', async () => {
  const { deleteAccount } = await import('../db/accounts.ts');
  const id = await makeUser('gone-dir@example.test');
  await createCustomer(db, id, customer('Gone Co'), 3);
  await createItem(db, id, { name: 'Gone item', hsnSac: '', unit: '', rate: '1', gstRate: '' }, null);
  await deleteAccount(db, id, 'gone-dir@example.test');
  assert.deepEqual(await listCustomers(db, id), []);
  assert.deepEqual(await listItems(db, id), []);
});
