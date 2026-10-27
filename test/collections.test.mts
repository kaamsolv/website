/**
 * Payments & Collections (Stage D) on real Postgres (PGlite, real migrations): every figure against a scenario
 * whose numbers are worked out by hand below, the reconciliation guarantees (ageing = outstanding; every
 * drill-down list adds up to its card), currency and user isolation, and the date boundaries (31 March /
 * 1 April, due today, inclusive range edges).
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers } from '../db/schema.ts';
import { createCustomer } from '../db/directory.ts';
import { getCollections, listCurrencies } from '../db/collections.ts';
import { createInvoice, getDashboard } from '../db/invoices.ts';
import { FILTERED_LIST_CAP, listInvoicesFiltered } from '../db/invoice-filters.ts';
import { recordPayment, voidPayment } from '../db/payments.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import type { InvoiceFilter } from '../app/lib/invoice/filters.ts';
import { paymentSummary } from '../app/lib/invoice/payments.ts';
import type { CurrencyCode, Invoice } from '../app/lib/invoice/types.ts';

let db: Db;
let close: () => Promise<void>;
after(async () => close());

const TODAY = '2026-10-26';
const FY = { from: '2026-04-01', to: '2027-03-31' };

async function makeUser(email: string): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}
type Spec = { n: string; rate: string; issue: string; due: string; currency?: CurrencyCode; kind?: 'quote'; customerId?: string };
async function inv(user: string, s: Spec): Promise<string> {
  const doc: Invoice = {
    ...newInvoice(new Date(2026, 9, 10)),
    number: s.n,
    issueDate: s.issue,
    dueDate: s.due,
    currency: s.currency ?? 'INR',
    items: [{ id: 'a', description: 'Work', qty: '1', rate: s.rate }],
    taxRate: '',
    ...(s.kind ? { kind: s.kind } : {}),
    ...(s.customerId ? { customerId: s.customerId } : {}),
  };
  const r = await createInvoice(db, user, doc, null);
  assert.ok(r.ok);
  return r.ok ? r.id : '';
}
async function pay(user: string, invoice: string, amount: number, paidOn: string) {
  const r = await recordPayment(db, user, invoice, { amountCents: Math.round(amount * 100), paidOn, method: 'bank', reference: '', note: '', clientKey: randomUUID(), reconcile: false });
  assert.ok(r.ok, `payment ${amount} on ${paidOn}`);
  return r.ok ? r.payment.id : '';
}
async function makeLegacyPaid(id: string) {
  await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
  try {
    await db.execute(sql`update invoices set status = 'paid', paid_at = now() where id = ${id}::uuid`);
  } finally {
    await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
  }
}
const q = (over: Partial<{ currency: CurrencyCode; from: string; to: string; today: string; customerId: string }> = {}) => ({ ...FY, today: TODAY, ...over });

/**
 * The scenario (today 26 Oct 2026, range = FY 2026-27). INR unless noted.
 *   I1  20,000  issued 10 Apr, due 24 Apr   paid 5,000 (20 Apr) + 7,000 (15 Jun)        → ₹8,000 owed, 185 days overdue
 *   I2  10,000  issued 5 May,  due 19 May   paid 10,000 (18 May)                         → paid
 *   I3   6,000  issued 1 Sep,  due 15 Sep   a 1,000 payment recorded then voided         → ₹6,000 owed, 41 days overdue
 *   I4   3,000  issued 10 Oct, due 25 Oct   nothing                                      → ₹3,000 owed, 1 day overdue
 *   I5   4,000  issued 20 Oct, due 26 Oct   paid 1,000 (22 Oct)                          → ₹3,000 owed, due TODAY (not overdue)
 *   I6   2,500  issued 22 Oct, no due date  nothing                                      → ₹2,500 owed, not overdue
 *   I7   5,000  issued 1 May,  due 15 May   marked paid before the ledger (legacy)        → settled, nothing received
 *   I8   7,000  issued 25 Mar 2026 (LAST FY), due 8 Apr   paid 2,000 (2 Apr 2026)        → ₹5,000 owed, 201 days overdue
 *   Q1   9,999  a quotation                                                               → never counted
 *   U1 $100 issued 1 Jun, due 15 Jun, paid $40 (10 Jun) → $60 owed;   U2 $50 issued 1 Oct, due 1 Dec → $50 owed
 */
type Ids = Record<'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8' | 'Q1' | 'U1' | 'U2', string>;
let A: string;
let B: string;
let ids: Ids;
let acme: string;

before(async () => {
  ({ db, close } = await makeTestDb());
  A = await makeUser('collections-a@example.test');
  B = await makeUser('collections-b@example.test');
  const c = await createCustomer(db, A, { name: 'Acme Traders', contactName: '', email: '', phone: '', address: '', stateCode: '', gstin: '' }, null);
  assert.ok(c.ok);
  acme = c.ok ? c.id : '';

  const I1 = await inv(A, { n: 'I1', rate: '20000', issue: '2026-04-10', due: '2026-04-24', customerId: acme });
  const I2 = await inv(A, { n: 'I2', rate: '10000', issue: '2026-05-05', due: '2026-05-19' });
  const I3 = await inv(A, { n: 'I3', rate: '6000', issue: '2026-09-01', due: '2026-09-15', customerId: acme });
  const I4 = await inv(A, { n: 'I4', rate: '3000', issue: '2026-10-10', due: '2026-10-25' });
  const I5 = await inv(A, { n: 'I5', rate: '4000', issue: '2026-10-20', due: '2026-10-26' });
  const I6 = await inv(A, { n: 'I6', rate: '2500', issue: '2026-10-22', due: '' });
  const I7 = await inv(A, { n: 'I7', rate: '5000', issue: '2026-05-01', due: '2026-05-15' });
  const I8 = await inv(A, { n: 'I8', rate: '7000', issue: '2026-03-25', due: '2026-04-08' });
  const Q1 = await inv(A, { n: 'Q1', rate: '9999', issue: '2026-05-01', due: '2026-05-31', kind: 'quote' });
  const U1 = await inv(A, { n: 'U1', rate: '100', issue: '2026-06-01', due: '2026-06-15', currency: 'USD' });
  const U2 = await inv(A, { n: 'U2', rate: '50', issue: '2026-10-01', due: '2026-12-01', currency: 'USD' });
  ids = { I1, I2, I3, I4, I5, I6, I7, I8, Q1, U1, U2 };

  await pay(A, I1, 5000, '2026-04-20');
  await pay(A, I1, 7000, '2026-06-15');
  await pay(A, I2, 10000, '2026-05-18');
  const voided = await pay(A, I3, 1000, '2026-09-20');
  await voidPayment(db, A, I3, voided, 'wrong invoice');
  await pay(A, I5, 1000, '2026-10-22');
  await makeLegacyPaid(I7);
  await pay(A, I8, 2000, '2026-04-02');
  await pay(A, U1, 40, '2026-06-10');

  // Someone else's money, in the same currencies and dates, that must never show up.
  const other = await inv(B, { n: 'B1', rate: '99999', issue: '2026-05-05', due: '2026-05-10' });
  await pay(B, other, 50000, '2026-05-06');
  await inv(B, { n: 'BU', rate: '777', issue: '2026-05-05', due: '2026-05-10', currency: 'USD' });
});

const amounts = (rows: { amount: number }[]) => rows.map((r) => r.amount);

test('INR figures match the hand-worked scenario: invoiced, received, outstanding, overdue, collection', async () => {
  const c = await getCollections(db, A, q({ currency: 'INR' }));
  assert.equal(c.currency, 'INR');
  // Invoiced = value issued in the range (I1–I7; I8 is last year's, the quotation never counts).
  assert.deepEqual(c.summary.invoiced, { amount: 50500, count: 7 });
  // Received = cash dated in the range on ANY invoice, voided and legacy excluded (includes I8's ₹2,000 from last year's invoice).
  assert.deepEqual(c.summary.received, { amount: 25000, count: 5 });
  // Outstanding = balances of open invoices today (not filtered by the range): I1 8,000 + I3 6,000 + I4 3,000 + I5 3,000 + I6 2,500 + I8 5,000.
  assert.deepEqual(c.summary.outstanding, { amount: 27500, count: 6 });
  // Overdue = due before today: I1, I3, I4, I8 (I5 is due today; I6 has no due date).
  assert.deepEqual(c.summary.overdue, { amount: 22000, count: 4 });
  // Collection rate = collected so far on invoices ISSUED in the range, marked-paid excluded: 23,000 of 45,500 = 50.5% → 50.
  assert.deepEqual(c.summary.collection, { percent: 50, collected: 23000, invoiced: 45500, invoices: 6 });
  assert.deepEqual(c.summary.markedPaid, { count: 1, total: 5000 }, 'the legacy invoice is reported on its own');
  // The two measures differ on purpose: cash received in the period (25,000) vs collected on the cohort (23,000).
  assert.notEqual(c.summary.received.amount, c.summary.collection.collected);
  assert.deepEqual(c.range, FY);
  assert.equal(c.today, TODAY);
});

test('ageing buckets use the balance and add up exactly to outstanding', async () => {
  const c = await getCollections(db, A, q({ currency: 'INR' }));
  assert.deepEqual(c.ageing.map((b) => b.bucket), ['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'], 'all five, always, in order');
  assert.deepEqual(c.ageing.map((b) => [b.amount, b.count]), [
    [5500, 2], // I5 (due today) 3,000 + I6 (no due date) 2,500
    [3000, 1], // I4, 1 day
    [6000, 1], // I3, 41 days
    [0, 0], // nothing is 61–90 days overdue in this data
    [13000, 2], // I1 8,000 (185 days) + I8 5,000 (201 days)
  ]);
  assert.equal(c.ageing.reduce((s, b) => s + b.amount, 0), c.summary.outstanding.amount);
  assert.equal(c.ageing.reduce((s, b) => s + b.count, 0), c.summary.outstanding.count);
});

test('monthly: invoiced by issue month and received by payment month, every month present, totals add up to the cards', async () => {
  const c = await getCollections(db, A, q({ currency: 'INR' }));
  assert.equal(c.monthly.length, 12);
  assert.deepEqual(c.monthly.map((m) => m.month), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  const by = Object.fromEntries(c.monthly.map((m) => [m.month, m]));
  assert.deepEqual([by['2026-04'].invoiced, by['2026-04'].received, by['2026-04'].receivedCount], [20000, 7000, 2], 'Apr: I1 issued; I1 5,000 + I8 2,000 received');
  assert.deepEqual([by['2026-05'].invoiced, by['2026-05'].invoicedCount, by['2026-05'].received], [15000, 2, 10000], 'May: I2 + I7 issued (legacy still has invoice value)');
  assert.deepEqual([by['2026-06'].invoiced, by['2026-06'].received], [0, 7000]);
  assert.deepEqual([by['2026-09'].invoiced, by['2026-09'].received], [6000, 0], 'the voided ₹1,000 is not received');
  assert.deepEqual([by['2026-10'].invoiced, by['2026-10'].invoicedCount, by['2026-10'].received], [9500, 3, 1000]);
  assert.deepEqual([by['2027-03'].invoiced, by['2027-03'].received], [0, 0], 'future months are present and empty');
  assert.equal(c.monthly.reduce((s, m) => s + m.invoiced, 0), c.summary.invoiced.amount);
  assert.equal(c.monthly.reduce((s, m) => s + m.received, 0), c.summary.received.amount);
  assert.equal(c.monthly.reduce((s, m) => s + m.receivedCount, 0), c.summary.received.count);
});

test('needs chasing: the five invoices longest past due, with the balance and days overdue', async () => {
  const c = await getCollections(db, A, q({ currency: 'INR' }));
  assert.deepEqual(c.needsChasing.map((r) => [r.number, r.balance, r.daysOverdue, r.dueDate]), [
    ['I8', 5000, 201, '2026-04-08'],
    ['I1', 8000, 185, '2026-04-24'],
    ['I3', 6000, 41, '2026-09-15'],
    ['I4', 3000, 1, '2026-10-25'],
  ]);
});

test('currencies are separate: USD has its own figures, INR is unaffected, and nothing is converted or summed', async () => {
  const usd = await getCollections(db, A, q({ currency: 'USD' }));
  assert.equal(usd.currency, 'USD');
  assert.deepEqual(usd.summary.invoiced, { amount: 150, count: 2 });
  assert.deepEqual(usd.summary.received, { amount: 40, count: 1 });
  assert.deepEqual(usd.summary.outstanding, { amount: 110, count: 2 });
  assert.deepEqual(usd.summary.overdue, { amount: 60, count: 1 });
  assert.deepEqual(usd.summary.collection, { percent: 26, collected: 40, invoiced: 150, invoices: 2 });
  assert.deepEqual(usd.ageing.map((b) => b.amount), [50, 0, 0, 0, 60]);
  assert.deepEqual(usd.currencies.map((c) => [c.code, c.invoices, c.outstanding]), [['INR', 8, 27500], ['USD', 2, 110]], 'the picker lists both, INR first; quotes are not counted');
  const inr = await getCollections(db, A, q({ currency: 'INR' }));
  assert.equal(inr.summary.outstanding.amount, 27500, 'the dollars are not in the rupee figure');
  const eur = await getCollections(db, A, q({ currency: 'EUR' }));
  assert.deepEqual([eur.summary.invoiced.amount, eur.summary.received.amount, eur.summary.outstanding.amount], [0, 0, 0], 'a currency with no activity is just zeros');
  // With no currency asked for, the main currency (INR) is chosen.
  assert.equal((await getCollections(db, A, q())).currency, 'INR');
});

test('another user’s invoices and payments never appear, in any currency', async () => {
  const b = await getCollections(db, B, q({ currency: 'INR' }));
  assert.deepEqual([b.summary.invoiced.amount, b.summary.received.amount, b.summary.outstanding.amount], [99999, 50000, 49999]);
  assert.deepEqual((await getCollections(db, B, q({ currency: 'USD' }))).summary.invoiced, { amount: 777, count: 1 });
  const a = await getCollections(db, A, q({ currency: 'INR' }));
  assert.notEqual(a.summary.received.amount, 25000 + 50000);
  // A customer id that is someone else's (or invented) gives zeros, not data.
  const foreign = await getCollections(db, B, q({ currency: 'INR', customerId: acme }));
  assert.deepEqual([foreign.summary.invoiced.amount, foreign.summary.received.amount, foreign.summary.outstanding.amount], [0, 0, 0]);
});

test('customer filter: every figure is limited to that saved customer’s invoices', async () => {
  const c = await getCollections(db, A, q({ currency: 'INR', customerId: acme }));
  // Acme has I1 (20,000; 12,000 received) and I3 (6,000).
  assert.deepEqual(c.summary.invoiced, { amount: 26000, count: 2 });
  assert.deepEqual(c.summary.received, { amount: 12000, count: 2 });
  assert.deepEqual(c.summary.outstanding, { amount: 14000, count: 2 });
  assert.deepEqual(c.summary.overdue, { amount: 14000, count: 2 });
  assert.equal(c.summary.collection.percent, Math.floor((12000 * 100) / 26000));
  assert.deepEqual(c.ageing.map((b) => b.amount), [0, 0, 6000, 0, 8000]);
  assert.deepEqual(c.needsChasing.map((r) => r.number), ['I1', 'I3']);
});

test('the Overview’s numbers and the collections numbers are the same numbers', async () => {
  const { totals } = await getDashboard(db, A, TODAY, '2026-10-01');
  const inr = totals.find((t) => t.currency === 'INR')!;
  const c = await getCollections(db, A, q({ currency: 'INR' }));
  assert.equal(inr.unpaid, c.summary.outstanding.amount);
  assert.equal(inr.overdue, c.summary.overdue.amount);
  assert.equal(inr.overdueCount, c.summary.overdue.count);
});

// ─── Every drill-down reconciles with its card ───────────────────────────────────────────────────────

const list = (f: InvoiceFilter, today: string | null = TODAY) => listInvoicesFiltered(db, A, f, today);
const numbers = (r: { invoices: { number: string }[] }) => r.invoices.map((i) => i.number).sort();

test('drill-down: outstanding, overdue and each ageing bucket list exactly the invoices behind the card, and add up', async () => {
  const c = await getCollections(db, A, q({ currency: 'INR' }));
  const open = await list({ state: 'outstanding', currency: 'INR' });
  assert.deepEqual(open.totals, [{ currency: 'INR', count: 6, total: 50500 - 5000 - 10000 + 7000, balance: 27500 }].map((t) => ({ ...t, total: 20000 + 6000 + 3000 + 4000 + 2500 + 7000 })));
  assert.equal(open.totals[0].balance, c.summary.outstanding.amount);
  assert.equal(open.totals[0].count, c.summary.outstanding.count);
  assert.equal(open.invoices.reduce((s, i) => s + i.balance, 0), c.summary.outstanding.amount, 'the rows add up too');
  assert.deepEqual(numbers(open), ['I1', 'I3', 'I4', 'I5', 'I6', 'I8']);
  assert.deepEqual(open.invoices.map((i) => i.number), ['I8', 'I1', 'I3', 'I4', 'I5', 'I6'], 'oldest due first; no due date last');

  const overdue = await list({ state: 'overdue', currency: 'INR' });
  assert.deepEqual([overdue.totals[0].balance, overdue.totals[0].count], [c.summary.overdue.amount, c.summary.overdue.count]);
  assert.deepEqual(numbers(overdue), ['I1', 'I3', 'I4', 'I8']);

  for (const b of c.ageing) {
    const r = await list({ bucket: b.bucket, currency: 'INR' });
    assert.deepEqual([r.totals[0]?.balance ?? 0, r.totals[0]?.count ?? 0], [b.amount, b.count], `bucket ${b.bucket}`);
  }
});

test('drill-down: invoiced → invoices issued in the range; received → invoices with a payment in the range, each with what came in', async () => {
  const c = await getCollections(db, A, q({ currency: 'INR' }));
  const issued = await list({ currency: 'INR', issuedFrom: FY.from, issuedTo: FY.to });
  assert.deepEqual([issued.totals[0].total, issued.totals[0].count], [c.summary.invoiced.amount, c.summary.invoiced.count]);
  assert.deepEqual(numbers(issued), ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7']);
  // The collection-rate cohort is these rows without the marked-paid one.
  const cohort = issued.invoices.filter((i) => paymentSummary({ total: i.total, amountPaid: i.amountPaid, status: i.status }, TODAY).state !== 'marked_paid');
  assert.equal(cohort.reduce((s, i) => s + i.amountPaid, 0), c.summary.collection.collected);
  assert.equal(cohort.reduce((s, i) => s + i.total, 0), c.summary.collection.invoiced);

  const received = await list({ currency: 'INR', paidFrom: FY.from, paidTo: FY.to });
  assert.equal(received.totals[0].receivedInPeriod, c.summary.received.amount);
  assert.equal(received.invoices.reduce((s, i) => s + (i.receivedInPeriod ?? 0), 0), c.summary.received.amount, 'rows add up to the card');
  assert.deepEqual(Object.fromEntries(received.invoices.map((i) => [i.number, i.receivedInPeriod])), { I1: 12000, I2: 10000, I5: 1000, I8: 2000 });
  // A single month: the April bar.
  const april = await list({ currency: 'INR', paidFrom: '2026-04-01', paidTo: '2026-04-30' });
  const aprilBar = c.monthly.find((m) => m.month === '2026-04')!;
  assert.equal(april.totals[0].receivedInPeriod, aprilBar.received);
  const aprilIssued = await list({ currency: 'INR', issuedFrom: '2026-04-01', issuedTo: '2026-04-30' });
  assert.equal(aprilIssued.totals[0].total, aprilBar.invoiced);
});

test('drill-down: payment states, currency, customer; per-currency totals are never added together; quotations and other users never appear', async () => {
  assert.deepEqual(numbers(await list({ state: 'unpaid' })), ['I3', 'I4', 'I6', 'U2']);
  assert.deepEqual(numbers(await list({ state: 'partial' })), ['I1', 'I5', 'I8', 'U1']);
  assert.deepEqual(numbers(await list({ state: 'paid' })), ['I2']);
  assert.deepEqual(numbers(await list({ state: 'marked_paid' })), ['I7']);
  assert.deepEqual(numbers(await list({ currency: 'USD' })), ['U1', 'U2']);
  assert.deepEqual(numbers(await list({ customer: acme })), ['I1', 'I3']);
  assert.ok(!numbers(await list({ currency: 'INR' })).includes('Q1'), 'quotations are never listed');
  assert.ok(!numbers(await list({ currency: 'INR' })).includes('B1'), 'another user’s invoice is never listed');
  const both = await list({ state: 'outstanding' });
  assert.deepEqual(both.totals.map((t) => [t.currency, t.balance]), [['INR', 27500], ['USD', 110]], 'one total per currency, INR first');
});

test('drill-down list is capped at 200 rows, but its totals cover every match', async () => {
  const C = await makeUser('collections-cap@example.test');
  await db.execute(sql`
    insert into invoices (user_id, number, client_name, currency, total, issue_date, due_date, data)
    select ${C}::uuid, 'N' || g, 'Client', 'INR', 10, '2026-05-01'::date, '2026-05-10'::date, '{}'::jsonb from generate_series(1, ${FILTERED_LIST_CAP + 10}) g`);
  const r = await listInvoicesFiltered(db, C, { state: 'outstanding' }, TODAY);
  assert.equal(r.invoices.length, FILTERED_LIST_CAP);
  assert.equal(r.capped, true);
  assert.deepEqual(r.totals, [{ currency: 'INR', count: FILTERED_LIST_CAP + 10, total: (FILTERED_LIST_CAP + 10) * 10, balance: (FILTERED_LIST_CAP + 10) * 10 }]);
  const c = await getCollections(db, C, q({ currency: 'INR' }));
  assert.equal(c.summary.outstanding.amount, (FILTERED_LIST_CAP + 10) * 10, 'the card agrees with the totals even though the list was cut');
});

// ─── Dates: boundaries, inclusive edges, empty ───────────────────────────────────────────────────────

test('range edges are inclusive, and 31 March / 1 April fall in different financial years', async () => {
  const D = await makeUser('collections-fy@example.test');
  const mar = await inv(D, { n: 'MAR', rate: '1000', issue: '2026-03-31', due: '2026-04-30' });
  const apr = await inv(D, { n: 'APR', rate: '2000', issue: '2026-04-01', due: '2026-04-30' });
  await pay(D, mar, 300, '2026-03-31');
  await pay(D, apr, 500, '2026-04-01');
  const old = await getCollections(db, D, { currency: 'INR', from: '2025-04-01', to: '2026-03-31', today: '2026-03-31' });
  const now = await getCollections(db, D, { currency: 'INR', from: '2026-04-01', to: '2027-03-31', today: '2026-04-01' });
  assert.deepEqual([old.summary.invoiced.amount, old.summary.received.amount], [1000, 300], 'FY 2025-26 ends on 31 March, inclusive');
  assert.deepEqual([now.summary.invoiced.amount, now.summary.received.amount], [2000, 500], 'FY 2026-27 begins on 1 April, inclusive');
  assert.equal(old.monthly.at(-1)?.month, '2026-03');
  assert.equal(now.monthly[0].month, '2026-04');
  // A single-day range.
  const day = await getCollections(db, D, { currency: 'INR', from: '2026-04-01', to: '2026-04-01', today: '2026-04-01' });
  assert.deepEqual([day.summary.invoiced.amount, day.summary.received.amount, day.monthly.length], [2000, 500, 1]);
});

test('overdue on the due date and the day after, across 31 March → 1 April', async () => {
  const E = await makeUser('collections-due@example.test');
  await inv(E, { n: 'DUE', rate: '1000', issue: '2026-03-01', due: '2026-03-31' });
  const onDue = await getCollections(db, E, { currency: 'INR', from: '2026-03-01', to: '2026-03-31', today: '2026-03-31' });
  assert.deepEqual([onDue.summary.overdue.amount, onDue.ageing[0].amount, onDue.ageing[1].amount, onDue.needsChasing.length], [0, 1000, 0, 0], 'due today is not overdue');
  const dayAfter = await getCollections(db, E, { currency: 'INR', from: '2026-04-01', to: '2027-03-31', today: '2026-04-01' });
  assert.deepEqual([dayAfter.summary.overdue.amount, dayAfter.ageing[0].amount, dayAfter.ageing[1].amount], [1000, 0, 1000], 'the next calendar day it is 1 day overdue');
  assert.equal(dayAfter.needsChasing[0].daysOverdue, 1);
  // Same answer however the server's own clock is set: the date comes from the request, nothing else.
  const filtered = await listInvoicesFiltered(db, E, { state: 'overdue' }, '2026-04-01');
  assert.equal(filtered.invoices.length, 1);
  assert.equal((await listInvoicesFiltered(db, E, { state: 'overdue' }, '2026-03-31')).invoices.length, 0);
});

test('an account with nothing: zeros, every month present, five empty buckets, no currencies', async () => {
  const empty = await makeUser('collections-empty@example.test');
  const c = await getCollections(db, empty, q());
  assert.equal(c.currency, 'INR');
  assert.deepEqual(c.currencies, []);
  assert.deepEqual(amounts([c.summary.invoiced, c.summary.received, c.summary.outstanding, c.summary.overdue]), [0, 0, 0, 0]);
  assert.deepEqual(c.summary.collection, { percent: null, collected: 0, invoiced: 0, invoices: 0 }, 'nothing to measure is not 0%');
  assert.equal(c.monthly.length, 12);
  assert.ok(c.monthly.every((m) => m.invoiced === 0 && m.received === 0));
  assert.deepEqual(c.ageing.map((b) => b.amount), [0, 0, 0, 0, 0]);
  assert.deepEqual(c.needsChasing, []);
  assert.deepEqual(await listCurrencies(db, empty), []);
});

test('an invoice settled by a payment after the range still counts in its issue cohort; cash is dated by receipt, not by issue', async () => {
  const F = await makeUser('collections-cohort@example.test');
  const i = await inv(F, { n: 'LATE', rate: '1000', issue: '2026-04-05', due: '2026-04-20' });
  await pay(F, i, 1000, '2026-09-15'); // paid months later
  const april = await getCollections(db, F, { currency: 'INR', from: '2026-04-01', to: '2026-04-30', today: TODAY });
  assert.deepEqual([april.summary.invoiced.amount, april.summary.received.amount], [1000, 0], 'nothing was received IN April');
  assert.deepEqual([april.summary.collection.percent, april.summary.collection.collected], [100, 1000], 'but the April invoice has been fully collected since');
  const september = await getCollections(db, F, { currency: 'INR', from: '2026-09-01', to: '2026-09-30', today: TODAY });
  assert.deepEqual([september.summary.invoiced.amount, september.summary.received.amount, september.summary.collection.percent], [0, 1000, null], 'cash arrived in September; no invoices were issued then');
});
