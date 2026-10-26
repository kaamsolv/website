/**
 * Stage E — the customer workspace on real Postgres (PGlite): per-currency totals that equal the filtered list and
 * the dashboard, the suggestion list of invoices typed in by the customer's exact name, and the explicit
 * connect / disconnect. The rule under test: **nothing is ever matched or merged by name on its own** — reads
 * change nothing, and a connection happens only for invoices the owner names, their own, not already connected.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, invoices } from '../db/schema.ts';
import { createCustomer, deleteCustomer } from '../db/directory.ts';
import { findUnlinkedByName, getCustomerSummary, linkInvoices, listCustomerStats, unlinkInvoices } from '../db/customer-workspace.ts';
import { getCollections } from '../db/collections.ts';
import { listInvoicesFiltered } from '../db/invoice-filters.ts';
import { createInvoice } from '../db/invoices.ts';
import { recordPayment } from '../db/payments.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import type { CurrencyCode, Invoice } from '../app/lib/invoice/types.ts';

let db: Db;
let close: () => Promise<void>;
const TODAY = '2026-10-26';

let A: string;
let B: string;
let acme: string; // A's customer "Acme Traders"
let acme2: string; // A's second customer with the same name
let bright: string;
let bAcme: string; // B's own "Acme Traders"
const ids: Record<string, string> = {};

async function user(email: string) {
  return (await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id }))[0].id;
}
async function customer(u: string, name: string, gstin = '') {
  const r = await createCustomer(db, u, { name, contactName: '', email: '', phone: '', address: '', stateCode: '', gstin }, null);
  assert.ok(r.ok);
  return r.ok ? r.id : '';
}
type Spec = { key: string; client: string; rate: number; due: string; currency?: CurrencyCode; kind?: 'quote'; customerId?: string; gstin?: string };
async function make(u: string, s: Spec) {
  const doc: Invoice = {
    ...newInvoice(new Date(2026, 9, 10)),
    number: s.key,
    issueDate: '2026-09-01',
    dueDate: s.due,
    currency: s.currency ?? 'INR',
    client: { name: s.client, address: '', email: '', ...(s.gstin ? { gstin: s.gstin } : {}) },
    items: [{ id: 'a', description: 'Work', qty: '1', rate: String(s.rate) }],
    taxRate: '',
    ...(s.kind ? { kind: s.kind } : {}),
    ...(s.customerId ? { customerId: s.customerId } : {}),
  };
  const r = await createInvoice(db, u, doc, null);
  assert.ok(r.ok);
  ids[s.key] = r.ok ? r.id : '';
  return ids[s.key];
}
const pay = async (u: string, id: string, amount: number) => {
  const r = await recordPayment(db, u, id, { amountCents: amount * 100, paidOn: '2026-10-01', method: 'bank', reference: '', note: '', clientKey: randomUUID(), reconcile: false });
  assert.ok(r.ok);
};
async function legacyPaid(id: string) {
  await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
  try {
    await db.execute(sql`update invoices set status = 'paid', paid_at = now() where id = ${id}::uuid`);
  } finally {
    await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
  }
}
const row = async (id: string) => (await db.select().from(invoices).where(eq(invoices.id, id)))[0];

before(async () => {
  ({ db, close } = await makeTestDb());
  A = await user('cw-a@example.test');
  B = await user('cw-b@example.test');
  acme = await customer(A, 'Acme Traders', '27AAPFU0939F1ZV');
  acme2 = await customer(A, 'Acme Traders'); // the same name again — allowed, and never merged
  bright = await customer(A, 'Bright Co');
  bAcme = await customer(B, 'Acme Traders');

  // Connected to Acme #1.
  const i1 = await make(A, { key: 'I1', client: 'Acme Traders', rate: 20000, due: '2026-09-26', customerId: acme });
  const i2 = await make(A, { key: 'I2', client: 'Acme Traders', rate: 10000, due: '2026-10-01', customerId: acme });
  await make(A, { key: 'I3', client: 'Acme Traders', rate: 100, due: '2026-10-31', currency: 'USD', customerId: acme });
  const i4 = await make(A, { key: 'I4', client: 'Acme Traders', rate: 5000, due: '2026-09-10', customerId: acme });
  await make(A, { key: 'Q1', client: 'Acme Traders', rate: 9999, due: '2026-11-30', kind: 'quote', customerId: acme });
  await pay(A, i1, 5000);
  await pay(A, i2, 10000);
  await legacyPaid(i4);
  // Typed in by name, never connected.
  await make(A, { key: 'U1', client: 'Acme Traders', rate: 1000, due: '2026-10-05', gstin: '27AAPFU0939F1ZV' });
  await make(A, { key: 'U2', client: '  acme traders ', rate: 2000, due: '2026-10-06' });
  await make(A, { key: 'U3', client: 'ACME TRADERS', rate: 3000, due: '2026-10-07', kind: 'quote' });
  await make(A, { key: 'U4', client: 'Acme Traders Ltd', rate: 4000, due: '2026-10-08' }); // close, not exact
  await make(A, { key: 'U5', client: 'Acme', rate: 5000, due: '2026-10-09' });
  await make(A, { key: 'U7', client: 'Acme   Traders', rate: 7000, due: '2026-10-11' }); // different inside the name: not exact
  await make(A, { key: 'U6', client: 'Acme Traders', rate: 6000, due: '2026-10-10', customerId: bright }); // connected to someone else
  // Another user's, with the same name.
  await make(B, { key: 'BX', client: 'Acme Traders', rate: 99999, due: '2026-10-05' });
  await make(B, { key: 'BL', client: 'Acme Traders', rate: 88888, due: '2026-10-05', customerId: bAcme });
});
after(async () => close());

test('the customer’s money is per currency, from connected invoices only, and equals the filtered list and the dashboard', async () => {
  const s = await getCustomerSummary(db, A, acme, TODAY);
  assert.ok(s);
  assert.equal(s.customer.name, 'Acme Traders');
  assert.deepEqual(s.money.map((m) => m.currency), ['INR', 'USD'], 'INR first, never added together');
  const [inr, usd] = s.money;
  // I1 20,000 (5,000 received) · I2 10,000 (paid) · I4 5,000 (marked paid, nothing on record). The quotation is not money.
  assert.deepEqual([inr.count, inr.invoiced, inr.received, inr.outstanding, inr.overdue], [3, 35000, 15000, 15000, 15000]);
  assert.deepEqual(inr.markedPaid, { count: 1, total: 5000 });
  assert.deepEqual([usd.count, usd.invoiced, usd.received, usd.outstanding, usd.overdue], [1, 100, 0, 100, 0]);
  assert.deepEqual([s.invoiceCount, s.quoteCount], [4, 1]);

  // Same numbers as the Stage D filtered list for this customer…
  for (const m of s.money) {
    const all = await listInvoicesFiltered(db, A, { customer: acme, currency: m.currency }, TODAY);
    assert.equal(all.totals[0].total, m.invoiced);
    const open = await listInvoicesFiltered(db, A, { customer: acme, currency: m.currency, state: 'outstanding' }, TODAY);
    assert.equal(open.totals[0]?.balance ?? 0, m.outstanding);
    const late = await listInvoicesFiltered(db, A, { customer: acme, currency: m.currency, state: 'overdue' }, TODAY);
    assert.equal(late.totals[0]?.balance ?? 0, m.overdue);
    assert.equal(all.invoices.reduce((n, i) => n + i.amountPaid, 0), m.received);
  }
  // …and the dashboard's customer filter (outstanding is a position, the same everywhere).
  const card = await getCollections(db, A, { currency: 'INR', from: '2026-01-01', to: '2026-12-31', today: TODAY, customerId: acme });
  assert.equal(card.summary.outstanding.amount, inr.outstanding);
  assert.equal(card.summary.overdue.amount, inr.overdue);
});

test('the same name on a second customer is a different customer: nothing is shared or merged', async () => {
  const s2 = await getCustomerSummary(db, A, acme2, TODAY);
  assert.deepEqual(s2?.money, [], 'no invoices are connected to the second “Acme Traders”');
  assert.equal(s2?.invoiceCount, 0);
  // Both customers are offered the same by-name suggestions — which is exactly why it is only ever a suggestion.
  assert.equal((await getCustomerSummary(db, A, acme, TODAY))?.unlinkedByName, 3);
  assert.equal(s2?.unlinkedByName, 3);
});

test('unlinked-by-name lists only exact names (any case, spaces at the ends), only unconnected, only the owner’s — and connects nothing', async () => {
  const found = await findUnlinkedByName(db, A, acme);
  assert.ok(found);
  assert.deepEqual(found.candidates.map((c) => c.number).sort(), ['U1', 'U2', 'U3']);
  assert.equal(found.capped, false);
  const u1 = found.candidates.find((c) => c.number === 'U1')!;
  assert.deepEqual([u1.total, u1.currency, u1.kind, u1.clientGstin], [1000, 'INR', 'invoice', '27AAPFU0939F1ZV']);
  assert.equal(found.candidates.find((c) => c.number === 'U3')!.kind, 'quote');
  assert.ok(!found.candidates.some((c) => ['U4', 'U5', 'U6', 'U7', 'BX', 'BL', 'I1'].includes(c.number)), 'near-matches, connected ones and other users’ never appear');

  // Reading — however often, and for either customer — changes nothing.
  for (const c of [acme, acme2, bright]) {
    await findUnlinkedByName(db, A, c);
    await getCustomerSummary(db, A, c, TODAY);
  }
  for (const k of ['U1', 'U2', 'U3', 'U4', 'U5']) assert.equal((await row(ids[k])).customerId, null, `${k} is still not connected`);
  // Neither does saving a customer with a matching name (acme2 was saved after those invoices existed).
  assert.equal((await row(ids.U1)).customerId, null);
  // A customer with a blank name suggests nothing.
  const blank = await customer(A, ' ');
  assert.deepEqual((await findUnlinkedByName(db, A, blank))?.candidates, []);
  // Someone else's customer is not found.
  assert.equal(await findUnlinkedByName(db, B, acme), null);
  assert.equal(await getCustomerSummary(db, B, acme, TODAY), null);
});

test('connect: only what is named; the document, dates, totals and status are untouched; it then counts in the totals', async () => {
  const before = await row(ids.U1);
  const done = await linkInvoices(db, A, acme, [ids.U1]);
  assert.deepEqual(done, [ids.U1]);
  const after = await row(ids.U1);
  assert.equal(after.customerId, acme);
  assert.deepEqual({ ...after, customerId: null }, { ...before, customerId: null }, 'every other column — document, total, status, updated_at — is exactly as it was');
  assert.equal((await row(ids.U2)).customerId, null, 'the one with the same name that was not named stays unconnected');

  const s = await getCustomerSummary(db, A, acme, TODAY);
  assert.deepEqual([s!.money[0].count, s!.money[0].invoiced, s!.money[0].outstanding], [4, 36000, 16000]);
  assert.equal(s!.unlinkedByName, 2);
  // It stays an ordinary invoice: a payment can still be recorded (the ledger rules were not touched).
  await pay(A, ids.U1, 1000);
  assert.equal((await row(ids.U1)).status, 'paid');
});

test('connect refuses what it should: someone else’s invoice, an already-connected one, a missing one, someone else’s customer', async () => {
  // Already connected to Acme (I1) or to Bright (U6): not moved.
  assert.deepEqual(await linkInvoices(db, A, bright, [ids.I1, ids.U6]), []);
  assert.equal((await row(ids.I1)).customerId, acme);
  assert.equal((await row(ids.U6)).customerId, bright);
  // Another user's invoice, by id.
  assert.deepEqual(await linkInvoices(db, A, acme, [ids.BX]), []);
  assert.equal((await row(ids.BX)).customerId, null);
  // A customer that isn't theirs, however the ids are chosen.
  assert.deepEqual(await linkInvoices(db, B, acme, [ids.BX]), [], 'B cannot attach to A’s customer');
  assert.deepEqual(await linkInvoices(db, A, bAcme, [ids.U2]), [], 'A cannot attach to B’s customer');
  assert.equal((await row(ids.U2)).customerId, null);
  // Missing and duplicate ids are harmless; a quotation can be connected.
  assert.deepEqual(await linkInvoices(db, A, acme, [randomUUID(), ids.U3, ids.U3]), [ids.U3]);
  assert.deepEqual(await linkInvoices(db, A, acme, []), []);
});

test('disconnect: only from the customer they are connected to, only the owner’s; the invoice keeps its own copy of the client', async () => {
  assert.deepEqual(await unlinkInvoices(db, A, bright, [ids.U3]), [], 'not connected to Bright');
  assert.deepEqual(await unlinkInvoices(db, B, acme, [ids.U3]), [], 'not B’s');
  assert.deepEqual(await unlinkInvoices(db, A, acme, [ids.U3]), [ids.U3]);
  const r = await row(ids.U3);
  assert.equal(r.customerId, null);
  assert.equal(r.clientName, 'ACME TRADERS', 'the typed client name is still there');
  assert.equal((r.data as { client: { name: string } }).client.name, 'ACME TRADERS');
});

test('stats for a page of customers come from one grouped query and match each customer’s summary', async () => {
  const stats = await listCustomerStats(db, A, [acme, acme2, bright], TODAY);
  const s = await getCustomerSummary(db, A, acme, TODAY);
  assert.deepEqual(stats[acme].money.map((m) => [m.currency, m.invoiced, m.outstanding, m.overdue]), s!.money.map((m) => [m.currency, m.invoiced, m.outstanding, m.overdue]));
  assert.equal(stats[acme].invoiceCount, s!.invoiceCount);
  assert.equal(stats[acme2], undefined, 'a customer with no invoices has no stats');
  assert.equal(stats[bright].invoiceCount, 1);
  assert.deepEqual(await listCustomerStats(db, A, [bAcme], TODAY), {}, 'another user’s customer id gives nothing');
  assert.deepEqual(await listCustomerStats(db, A, [], TODAY), {});
});

test('deleting a customer disconnects its invoices but keeps them, with their own copy of the client', async () => {
  const c = await customer(A, 'Temporary Co');
  const t = await make(A, { key: 'T1', client: 'Temporary Co', rate: 700, due: '2026-10-30', customerId: c });
  assert.equal((await row(t)).customerId, c);
  assert.equal(await deleteCustomer(db, A, c), true);
  const r = await row(t);
  assert.deepEqual([r.customerId, r.clientName, r.total], [null, 'Temporary Co', 700]);
  assert.equal(await getCustomerSummary(db, A, c, TODAY), null);
});
