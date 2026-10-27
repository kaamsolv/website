/**
 * Stage F — operational reports on real Postgres (PGlite). Every report is checked against the figure it must
 * reconcile with: the Collections page (invoiced / received / outstanding / overdue / ageing), a customer's page
 * and the filtered invoice list — all built from the same ledger and the same SQL fragments. Also: voided payments
 * are never counted, legacy "marked paid" invoices get no invented payments, one currency per file, other users'
 * data never appears, and a file assembled from pages passes (and a tampered one fails) the integrity check.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers } from '../db/schema.ts';
import { createCustomer } from '../db/directory.ts';
import { getCollections } from '../db/collections.ts';
import { getCustomerSummary } from '../db/customer-workspace.ts';
import { listInvoicesFiltered, listInvoicesPage } from '../db/invoice-filters.ts';
import { createInvoice } from '../db/invoices.ts';
import { recordPayment, voidPayment } from '../db/payments.ts';
import { ageingSummary, outstandingPage, paymentsPage, registerPage } from '../db/invoice-reports.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import type { CurrencyCode, Invoice } from '../app/lib/invoice/types.ts';
import {
  ageingCells,
  COLUMNS,
  outstandingCells,
  parseReportQuery,
  paymentCells,
  registerCells,
  verifyRows,
  type ReportKind,
  type ReportQuery,
  type ReportTotals,
} from '../app/lib/invoice/reports.ts';
import { parseListQuery } from '../app/lib/invoice/list-query.ts';
import { parseCsv, toCsv } from '../app/lib/invoice/csv.ts';

let db: Db;
let close: () => Promise<void>;
const TODAY = '2026-10-26';
const NOW = new Date('2026-10-26T12:00:00Z');
const FY = { from: '2026-04-01', to: '2027-03-31' };

let A: string;
let B: string;
let acme: string;
const ids: Record<string, string> = {};
const paymentIds: Record<string, string> = {};

async function user(email: string) {
  return (await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id }))[0].id;
}

type Spec = {
  key: string;
  client?: string;
  rate: number;
  issue: string;
  due: string;
  currency?: CurrencyCode;
  kind?: 'quote';
  customerId?: string;
  gst?: { clientState: string; gstRate: string };
  taxRate?: string;
  clientGstin?: string;
};
async function make(u: string, s: Spec) {
  const doc: Invoice = {
    ...newInvoice(new Date(2026, 9, 10)),
    number: s.key,
    issueDate: s.issue,
    dueDate: s.due,
    currency: s.currency ?? 'INR',
    seller: s.gst ? { name: 'Seller', address: '', email: '', gstin: '27AAPFU0939F1ZV', state: '27' } : { name: 'Seller', address: '', email: '' },
    client: { name: s.client ?? 'Client', address: '', email: '', ...(s.gst ? { state: s.gst.clientState } : {}), ...(s.clientGstin ? { gstin: s.clientGstin } : {}) },
    items: [{ id: 'a', description: 'Work', qty: '1', rate: String(s.rate), ...(s.gst ? { gstRate: s.gst.gstRate } : {}) }],
    taxRate: s.taxRate ?? '0',
    ...(s.kind ? { kind: s.kind } : {}),
    ...(s.customerId ? { customerId: s.customerId } : {}),
  };
  const r = await createInvoice(db, u, doc, null);
  assert.ok(r.ok, `${s.key} saved`);
  ids[s.key] = r.ok ? r.id : '';
  return ids[s.key];
}
async function pay(u: string, key: string, amount: number, paidOn: string, method: 'bank' | 'upi' | 'cash' = 'bank', reference = '') {
  const r = await recordPayment(db, u, ids[key], { amountCents: Math.round(amount * 100), paidOn, method, reference, note: '', clientKey: randomUUID(), reconcile: false });
  assert.ok(r.ok, `${key} payment recorded`);
  if (r.ok) paymentIds[`${key}:${paidOn}:${amount}`] = r.payment.id;
  return r.ok ? r.payment.id : '';
}
async function legacyPaid(id: string) {
  await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
  try {
    await db.execute(sql`update invoices set status = 'paid', paid_at = now() where id = ${id}::uuid`);
  } finally {
    await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
  }
}

function query(report: ReportKind, extra: Record<string, string> = {}, currency = 'INR'): ReportQuery {
  const p = new URLSearchParams({ report, currency, today: TODAY, ...(report === 'register' || report === 'payments' ? FY : {}), ...extra });
  const r = parseReportQuery(p, NOW);
  assert.ok(r.ok, JSON.stringify(r));
  return r.ok ? r.value : (undefined as never);
}

/** Read every page of a report the way the browser does, and return the rows as cells with the last totals. */
async function readAll(q: ReportQuery, pageSize: number) {
  const fn = { register: registerPage, payments: paymentsPage, outstanding: outstandingPage, ageing: ageingSummary }[q.report];
  const cells = { register: registerCells, payments: paymentCells, outstanding: outstandingCells, ageing: ageingCells }[q.report] as (r: never) => string[];
  const rows: string[][] = [];
  let totals: ReportTotals | undefined;
  let matched = 0;
  for (let page = 1; ; page++) {
    const r = await fn(db, A, { ...q, page, pageSize });
    rows.push(...(r.rows as never[]).map(cells));
    totals = r.totals;
    matched = r.matched;
    if (page * pageSize >= r.matched || q.report === 'ageing') break;
  }
  return { rows, totals: totals!, matched };
}

before(async () => {
  ({ db, close } = await makeTestDb());
  A = await user('rp-a@example.test');
  B = await user('rp-b@example.test');
  const c = await createCustomer(db, A, { name: 'Acme Traders', contactName: '', email: '', phone: '', address: '', stateCode: '', gstin: '' }, null);
  assert.ok(c.ok);
  acme = c.ok ? c.id : '';

  // GST, inter-state: 10,000 @ 18% → IGST 1,800 → 11,800. Partly paid, overdue 41 days.
  await make(A, { key: 'G1', client: 'Acme Traders', rate: 10000, issue: '2026-09-01', due: '2026-09-15', gst: { clientState: '29', gstRate: '18' }, customerId: acme, clientGstin: '29AAGCB7383J1Z4' });
  // GST, intra-state: 20,000 @ 5% → CGST 500 + SGST 500 → 21,000. Paid in two payments.
  await make(A, { key: 'G2', client: 'Acme Traders', rate: 20000, issue: '2026-09-10', due: '2026-11-30', gst: { clientState: '27', gstRate: '5' }, customerId: acme });
  // Plain 10% tax: 1,000 → 1,100, unpaid, long overdue, not connected to a customer.
  await make(A, { key: 'P1', client: 'Plain Client', rate: 1000, issue: '2026-04-05', due: '2026-05-05', taxRate: '10' });
  // Legacy: marked paid before payments existed.
  const l1 = await make(A, { key: 'L1', client: 'Old Friend', rate: 3000, issue: '2026-09-02', due: '2026-09-20' });
  await legacyPaid(l1);
  // A mistaken payment, voided: the invoice owes its full amount again.
  await make(A, { key: 'V1', client: 'Voided Co', rate: 4000, issue: '2026-09-03', due: '2026-10-20' });
  // Another currency, a quotation, and one issued before the financial year.
  await make(A, { key: 'U1', client: 'Dollar Co', rate: 100, issue: '2026-09-05', due: '2026-10-31', currency: 'USD' });
  await make(A, { key: 'Q1', client: 'Acme Traders', rate: 9999, issue: '2026-09-06', due: '2026-11-30', kind: 'quote' });
  await make(A, { key: 'OLD', client: 'Last Year Ltd', rate: 500, issue: '2025-12-01', due: '2025-12-15' });

  await pay(A, 'G1', 5000, '2026-09-20', 'upi', 'UTR=123');
  await pay(A, 'G2', 10000, '2026-10-01', 'bank', '=SUM(A1)');
  await pay(A, 'G2', 11000, '2026-10-05', 'upi');
  const v = await pay(A, 'V1', 4000, '2026-09-30', 'cash');
  assert.ok((await voidPayment(db, A, ids.V1, v, 'Entered twice')).ok);
  await pay(A, 'U1', 40, '2026-10-02');

  // Someone else's, same names and amounts.
  await make(B, { key: 'BX', client: 'Acme Traders', rate: 777, issue: '2026-09-01', due: '2026-09-15' });
  await pay(B, 'BX', 100, '2026-09-20');
});
after(async () => close());

test('the register lists invoices issued in the period (never quotations, never another currency or user), and its totals are the Collections figures', async () => {
  const r = await readAll(query('register'), 100);
  assert.deepEqual(r.rows.map((x) => x[0]), ['P1', 'G1', 'L1', 'V1', 'G2'], 'oldest issue first; quote, USD and last-year invoices are not here');
  const t = r.totals;
  assert.equal(t.report, 'register');
  if (t.report !== 'register') return;
  // 11,800 + 21,000 + 1,100 + 3,000 + 4,000
  assert.deepEqual([t.count, t.total, t.received, t.balance], [5, 40900, 26000, 11900]);

  const col = await getCollections(db, A, { currency: 'INR', from: FY.from, to: FY.to, today: TODAY });
  assert.equal(t.total, col.summary.invoiced.amount);
  assert.equal(t.count, col.summary.invoiced.count);
  // Outstanding for the period's invoices is part of the all-time outstanding (+ the last-year invoice's 500).
  assert.equal(t.balance + 500, col.summary.outstanding.amount);
  assert.equal(verifyRows(COLUMNS.register, r.rows, t).ok, true);
});

test('register totals equal the filtered invoice list and the paged list for the same filter', async () => {
  const t = (await registerPage(db, A, query('register'))).totals;
  const f = await listInvoicesFiltered(db, A, { currency: 'INR', issuedFrom: FY.from, issuedTo: FY.to }, TODAY);
  assert.deepEqual([f.totals[0].count, f.totals[0].total, f.totals[0].balance], [t.count, t.total, t.balance]);
  const lq = parseListQuery(new URLSearchParams({ currency: 'INR', issuedFrom: FY.from, issuedTo: FY.to, today: TODAY }), NOW);
  assert.ok(lq.ok);
  const paged = await listInvoicesPage(db, A, lq.ok ? lq.value : (undefined as never));
  assert.equal(paged.totals[0].total, t.total);

  for (const state of ['unpaid', 'partial', 'paid', 'marked_paid', 'outstanding', 'overdue'] as const) {
    const reg = await registerPage(db, A, query('register', { state }));
    const list = await listInvoicesFiltered(db, A, { currency: 'INR', issuedFrom: FY.from, issuedTo: FY.to, state }, TODAY);
    assert.deepEqual(
      [reg.totals.count, reg.totals.total, reg.totals.balance],
      [list.totals[0]?.count ?? 0, list.totals[0]?.total ?? 0, list.totals[0]?.balance ?? 0],
      `state=${state}`,
    );
  }
});

test('register rows: status words, GST split, plain tax, last payment, and customer link', async () => {
  const r = await registerPage(db, A, query('register'));
  const byNo = Object.fromEntries(r.rows.map((x) => [x.number, registerCells(x)]));
  const col = (key: string) => COLUMNS.register.findIndex((c) => c.key === key);
  const cell = (no: string, key: string) => byNo[no][col(key)];

  // G1: inter-state → IGST only; taxable + tax = total; partly paid and overdue.
  assert.deepEqual([cell('G1', 'docType'), cell('G1', 'taxable'), cell('G1', 'cgst'), cell('G1', 'sgst'), cell('G1', 'igst'), cell('G1', 'tax'), cell('G1', 'total')], ['Tax invoice', '10000.00', '0.00', '0.00', '1800.00', '1800.00', '11800.00']);
  assert.match(cell('G1', 'placeOfSupply'), /\(29\)/);
  assert.equal(cell('G1', 'clientGstin'), '29AAGCB7383J1Z4');
  assert.equal(cell('G1', 'customer'), 'Acme Traders');
  assert.equal(cell('G1', 'status'), 'Partially paid');
  assert.deepEqual([cell('G1', 'received'), cell('G1', 'balance'), cell('G1', 'daysOverdue'), cell('G1', 'lastPayment')], ['5000.00', '6800.00', '41', '2026-09-20']);
  // G2: intra-state → CGST + SGST.
  assert.deepEqual([cell('G2', 'cgst'), cell('G2', 'sgst'), cell('G2', 'igst'), cell('G2', 'total'), cell('G2', 'status'), cell('G2', 'daysOverdue'), cell('G2', 'lastPayment')], ['500.00', '500.00', '0.00', '21000.00', 'Paid', '0', '2026-10-05']);
  // P1: plain tax rate, no GST split, no saved customer.
  assert.deepEqual([cell('P1', 'docType'), cell('P1', 'taxable'), cell('P1', 'tax'), cell('P1', 'cgst'), cell('P1', 'total'), cell('P1', 'customer'), cell('P1', 'status'), cell('P1', 'lastPayment')], ['Invoice', '1000.00', '100.00', '', '1100.00', '', 'Unpaid', '']);
  // L1: legacy marked paid — settled, nothing received, no invented payment.
  assert.deepEqual([cell('L1', 'status'), cell('L1', 'received'), cell('L1', 'balance'), cell('L1', 'lastPayment'), cell('L1', 'daysOverdue')], ['Marked paid', '0.00', '0.00', '', '0']);
  // V1: the payment was voided, so it owes everything and shows no last payment.
  assert.deepEqual([cell('V1', 'status'), cell('V1', 'received'), cell('V1', 'balance'), cell('V1', 'lastPayment'), cell('V1', 'daysOverdue')], ['Unpaid', '0.00', '4000.00', '', '6']);
  for (const x of r.rows) assert.equal(x.currency, 'INR');
  assert.equal(r.blanked, 0);
});

test('an invoice whose saved total no longer matches its lines keeps its stored figures and blanks the derived tax columns', async () => {
  const before = (await registerPage(db, A, query('register'))).totals;
  await db.execute(sql`update invoices set data = jsonb_set(data, '{items,0,rate}', '"1"') where id = ${ids.P1}::uuid`);
  try {
    const r = await registerPage(db, A, query('register'));
    assert.equal(r.blanked, 1);
    const p1 = r.rows.find((x) => x.number === 'P1')!;
    assert.deepEqual([p1.total, p1.subtotal, p1.taxable, p1.tax, p1.cgst], [1100, null, null, null, null]);
    assert.deepEqual(r.totals, before, 'totals come from the stored columns, not from re-reading documents');
  } finally {
    await db.execute(sql`update invoices set data = jsonb_set(data, '{items,0,rate}', '"1000"') where id = ${ids.P1}::uuid`);
  }
});

test('payments: counted money equals Collections received; voided payments are left out unless asked for and then never counted', async () => {
  const q = query('payments');
  const r = await readAll(q, 2);
  const t = r.totals;
  assert.equal(t.report, 'payments');
  if (t.report !== 'payments') return;
  assert.deepEqual(r.rows.map((x) => x[1]), ['G1', 'G2', 'G2'], 'oldest first; the voided V1 payment and the USD one are not here');
  assert.deepEqual([t.counted.count, t.counted.amount, t.voided], [3, 26000, null]);

  const col = await getCollections(db, A, { currency: 'INR', from: FY.from, to: FY.to, today: TODAY });
  assert.equal(t.counted.amount, col.summary.received.amount);
  assert.equal(t.counted.count, col.summary.received.count);
  assert.equal(verifyRows(COLUMNS.payments, r.rows, t).ok, true);

  // With voided payments: listed, labelled, still not counted.
  const withVoided = await readAll(query('payments', { includeVoided: '1' }), 2);
  const wt = withVoided.totals;
  if (wt.report !== 'payments') return;
  assert.deepEqual([wt.counted.count, wt.counted.amount, wt.voided], [3, 26000, { count: 1, amount: 4000 }]);
  assert.equal(withVoided.rows.length, 4);
  const idx = (key: string) => COLUMNS.payments.findIndex((c) => c.key === key);
  const voided = withVoided.rows.find((x) => x[idx('status')] === 'Voided')!;
  assert.deepEqual([voided[1], voided[idx('counted')], voided[idx('voidReason')], voided[idx('amount')]], ['V1', 'No', 'Entered twice', '4000.00']);
  assert.match(voided[idx('voidedOn')], /^\d{4}-\d{2}-\d{2}$/);
  assert.match(voided[idx('recordedAt')], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(verifyRows(COLUMNS.payments, withVoided.rows, wt).ok, true);
  assert.equal(withVoided.rows.filter((x) => x[idx('counted')] === 'Yes').length, 3);
});

test('payments: a legacy marked-paid invoice has no rows (none are invented) and is only counted in a notice', async () => {
  const r = await paymentsPage(db, A, query('payments'));
  assert.ok(!r.rows.some((x) => x.number === 'L1'));
  assert.deepEqual(r.totals.markedPaid, { count: 1, total: 3000 });
  const col = await getCollections(db, A, { currency: 'INR', from: FY.from, to: FY.to, today: TODAY });
  assert.deepEqual(r.totals.markedPaid, col.summary.markedPaid);
});

test('payments: method and customer filters, and the customer total equals the customer page', async () => {
  const upi = await paymentsPage(db, A, query('payments', { method: 'upi' }));
  assert.deepEqual(upi.rows.map((x) => [x.number, x.amount]), [['G1', 5000], ['G2', 11000]]);
  assert.deepEqual([upi.totals.counted.count, upi.totals.counted.amount], [2, 16000]);

  const forAcme = await paymentsPage(db, A, query('payments', { customer: acme }));
  const summary = await getCustomerSummary(db, A, acme, TODAY);
  assert.equal(forAcme.totals.counted.amount, summary!.money[0].received);
  const col = await getCollections(db, A, { currency: 'INR', from: FY.from, to: FY.to, today: TODAY, customerId: acme });
  assert.equal(forAcme.totals.counted.amount, col.summary.received.amount);
  for (const x of forAcme.rows) assert.equal(x.customer, 'Acme Traders');

  const period = await paymentsPage(db, A, query('payments', { from: '2026-10-01', to: '2026-10-31' }));
  assert.deepEqual(period.rows.map((x) => x.paidOn), ['2026-10-01', '2026-10-05'], 'the period is the date received');
});

test('one currency per file: USD is separate, and nothing is converted or added in', async () => {
  const usd = await paymentsPage(db, A, query('payments', {}, 'USD'));
  assert.deepEqual(usd.rows.map((x) => [x.number, x.currency, x.amount]), [['U1', 'USD', 40]]);
  const usdReg = await registerPage(db, A, query('register', {}, 'USD'));
  assert.deepEqual([usdReg.totals.count, usdReg.totals.total, usdReg.totals.balance], [1, 100, 60]);
  const eur = await registerPage(db, A, query('register', {}, 'EUR'));
  assert.deepEqual([eur.rows.length, eur.matched, eur.totals.total], [0, 0, 0]);
});

test('outstanding and ageing equal the Collections page; filters equal the filtered list', async () => {
  const col = await getCollections(db, A, { currency: 'INR', from: FY.from, to: FY.to, today: TODAY });
  const out = await readAll(query('outstanding'), 2);
  const t = out.totals;
  assert.equal(t.report, 'outstanding');
  if (t.report !== 'outstanding') return;
  assert.deepEqual(out.rows.map((x) => x[0]), ['OLD', 'P1', 'G1', 'V1'], 'oldest due first; paid, marked-paid and quotations never appear');
  assert.deepEqual([t.count, t.balance, t.overdue], [col.summary.outstanding.count, col.summary.outstanding.amount, col.summary.overdue.amount]);
  assert.equal(t.balance, 12400);
  assert.equal(verifyRows(COLUMNS.outstanding, out.rows, t).ok, true);

  const ageing = await ageingSummary(db, A, query('ageing'));
  assert.deepEqual(
    ageing.totals.buckets.map((b) => [b.bucket, b.amount, b.count]),
    col.ageing.map((b) => [b.bucket, b.amount, b.count]),
  );
  assert.equal(ageing.totals.balance, col.summary.outstanding.amount);
  assert.equal(ageing.totals.count, col.summary.outstanding.count);
  assert.equal(ageing.rows.length, 4, 'all four groups, always');
  assert.equal(verifyRows(COLUMNS.ageing, ageing.rows.map(ageingCells), ageing.totals).ok, true);

  for (const bucket of ['not_due', 'd1_30', 'd31_60', 'd60_plus'] as const) {
    const r = await outstandingPage(db, A, query('outstanding', { bucket }));
    const list = await listInvoicesFiltered(db, A, { currency: 'INR', bucket }, TODAY);
    assert.deepEqual([r.totals.count, r.totals.balance], [list.totals[0]?.count ?? 0, list.totals[0]?.balance ?? 0], `bucket=${bucket}`);
  }
  for (const state of ['unpaid', 'partial', 'overdue'] as const) {
    const r = await outstandingPage(db, A, query('outstanding', { state }));
    const list = await listInvoicesFiltered(db, A, { currency: 'INR', state: state === 'overdue' ? 'overdue' : state }, TODAY);
    const expectedBalance = state === 'overdue' ? list.totals[0].balance : list.totals[0]?.balance ?? 0;
    assert.equal(r.totals.balance, expectedBalance, `state=${state}`);
  }
  const acmeOwes = await outstandingPage(db, A, query('outstanding', { customer: acme }));
  const summary = await getCustomerSummary(db, A, acme, TODAY);
  assert.equal(acmeOwes.totals.balance, summary!.money[0].outstanding);
  assert.equal(acmeOwes.totals.overdue, summary!.money[0].overdue);
});

test('outstanding rows: ages and groups as of the visitor’s date', async () => {
  const r = await outstandingPage(db, A, query('outstanding'));
  const cells = Object.fromEntries(r.rows.map((x) => [x.number, outstandingCells(x)]));
  const col = (key: string) => COLUMNS.outstanding.findIndex((c) => c.key === key);
  assert.deepEqual([cells.V1[col('daysOverdue')], cells.V1[col('ageGroup')], cells.V1[col('status')]], ['6', '1–30 days overdue', 'Unpaid']);
  assert.deepEqual([cells.G1[col('daysOverdue')], cells.G1[col('ageGroup')], cells.G1[col('status')], cells.G1[col('balance')]], ['41', '31–60 days overdue', 'Partially paid', '6800.00']);
  assert.equal(cells.OLD[col('ageGroup')], 'Over 60 days overdue');
  // The same data, one day later: nothing stored changes, the ages do.
  const later = await outstandingPage(db, A, { ...query('outstanding'), today: '2026-10-27' });
  assert.equal(outstandingCells(later.rows.find((x) => x.number === 'V1')!)[col('daysOverdue')], '7');
});

test('another user’s data never appears, in any report', async () => {
  const fn = [registerPage, paymentsPage, outstandingPage] as const;
  const asB = (report: ReportKind) => query(report);
  const reg = await registerPage(db, B, asB('register'));
  assert.deepEqual(reg.rows.map((x) => x.number), ['BX']);
  assert.equal(reg.totals.total, 777);
  const pay = await paymentsPage(db, B, asB('payments'));
  assert.deepEqual(pay.rows.map((x) => [x.number, x.amount]), [['BX', 100]]);
  const out = await outstandingPage(db, B, asB('outstanding'));
  assert.equal(out.totals.balance, 677);
  assert.equal((await ageingSummary(db, B, asB('ageing'))).totals.balance, 677);
  // B asking for A's customer finds nothing.
  assert.equal((await registerPage(db, B, query('register', { customer: acme }))).matched, 0);
  assert.equal((await paymentsPage(db, B, query('payments', { customer: acme }))).matched, 0);
  assert.equal(fn.length, 3);
});

test('pages add up: any page size gives the same rows and the same totals, and the joined file passes the integrity check', async () => {
  for (const report of ['register', 'payments', 'outstanding'] as const) {
    const q = query(report, report === 'payments' ? { includeVoided: '1' } : {});
    const whole = await readAll(q, 500);
    for (const size of [1, 2, 3]) {
      const paged = await readAll(q, size);
      assert.deepEqual(paged.rows, whole.rows, `${report} @ ${size}`);
      assert.deepEqual(paged.totals, whole.totals);
      assert.equal(verifyRows(COLUMNS[report], paged.rows, paged.totals).ok, true, `${report} @ ${size} verifies`);
    }
  }
});

test('the integrity check refuses a file that doesn’t add up (dropped page, changed amount, voided row sneaking in)', async () => {
  const out = await readAll(query('outstanding'), 2);
  const balance = COLUMNS.outstanding.findIndex((c) => c.key === 'balance');
  assert.equal(verifyRows(COLUMNS.outstanding, out.rows.slice(0, -1), out.totals).ok, false, 'a missing row');
  const tampered = out.rows.map((r, i) => (i === 0 ? r.map((c, j) => (j === balance ? '1.00' : c)) : r));
  assert.equal(verifyRows(COLUMNS.outstanding, tampered, out.totals).ok, false, 'a changed amount');

  const pay = await readAll(query('payments'), 2);
  const withVoided = await readAll(query('payments', { includeVoided: '1' }), 2);
  assert.equal(verifyRows(COLUMNS.payments, withVoided.rows, pay.totals).ok, false, 'voided rows are not allowed when they weren’t asked for');
  const status = COLUMNS.payments.findIndex((c) => c.key === 'counted');
  const flipped = withVoided.rows.map((r) => r.map((c, j) => (j === status ? 'Yes' : c)));
  assert.equal(verifyRows(COLUMNS.payments, flipped, withVoided.totals).ok, false, 'a voided payment marked as counted');
});

test('hostile text in names, references and notes survives the CSV round trip and cannot start a formula', async () => {
  const out = await readAll(query('payments'), 100);
  const csv = toCsv([COLUMNS.payments.map((c) => c.label), ...out.rows]);
  assert.ok(csv.startsWith('﻿'), 'UTF-8 byte-order mark');
  assert.ok(csv.includes('\r\n'));
  const parsed = parseCsv(csv.replace(/^﻿/, ''));
  const ref = COLUMNS.payments.findIndex((c) => c.key === 'reference');
  const refs = parsed.slice(1).map((r) => r[ref]);
  assert.ok(refs.includes('\'=SUM(A1)'), 'a leading = is defused with a quote, not removed');
  assert.ok(refs.includes('UTR=123'), 'an equals sign inside text is left alone');
  for (const row of parsed.slice(1)) for (const cell of row) assert.ok(!/^[=+\-@\t\r]/.test(cell) || /^-?\d+(\.\d+)?$/.test(cell), `no cell starts a formula: ${cell}`);
});
