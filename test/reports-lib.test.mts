/**
 * Stage F — the pure report library: request validation (nothing silently ignored), the money format, the
 * integrity check and file names. No database here; test/reports.test.mts covers the figures.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ageingCells,
  COLUMNS,
  EXPORT_CAP,
  fixed2,
  OPERATIONAL_NOTE,
  PAGE_SIZE,
  parseReportQuery,
  paymentCells,
  registerCells,
  reportFilename,
  statusWords,
  verifyRows,
  type PaymentRow,
  type RegisterRow,
  type ReportQuery,
  type ReportTotals,
} from '../app/lib/invoice/reports.ts';

const NOW = new Date('2026-10-26T12:00:00Z');
const base = { report: 'register', currency: 'INR', today: '2026-10-26', from: '2026-04-01', to: '2027-03-31' };
const parse = (o: Record<string, string>) => parseReportQuery(new URLSearchParams(o), NOW);
const good = (o: Record<string, string>): ReportQuery => {
  const r = parse(o);
  assert.ok(r.ok, JSON.stringify(r));
  return r.ok ? r.value : (undefined as never);
};
const bad = (o: Record<string, string>, pattern?: RegExp) => {
  const r = parse(o);
  assert.equal(r.ok, false, JSON.stringify(o));
  if (!r.ok && pattern) assert.match(r.message, pattern);
};

test('a report request needs a report, one currency, the visitor’s date and (for periods) a valid range', () => {
  const q = good(base);
  assert.deepEqual([q.report, q.currency, q.page, q.pageSize, q.includeVoided], ['register', 'INR', 1, PAGE_SIZE.register, false]);
  bad({ ...base, report: 'gstr1' }, /Choose a report/);
  bad({ ...base, report: '' });
  bad({ ...base, currency: '' }, /currency/);
  bad({ ...base, currency: 'XYZ' }, /currency/);
  const { today: _t, ...noToday } = base;
  bad(noToday, /device’s date/);
  bad({ ...base, today: '2026-13-40' });
  bad({ ...base, today: '2026-10-29' }, /device’s date/);
  bad({ ...base, from: '' });
  bad({ ...base, from: '2027-01-01', to: '2026-01-01' });
  bad({ ...base, from: '2024-01-01', to: '2027-01-01' }, /months/);
  const { from: _f, to: _to, ...noRange } = base;
  bad(noRange);
  good({ ...base, report: 'payments' });
});

test('outstanding and ageing are positions as of today: a period is refused, not ignored', () => {
  const o = { report: 'outstanding', currency: 'INR', today: '2026-10-26' };
  good(o);
  good({ ...o, report: 'ageing' });
  bad({ ...o, from: '2026-04-01', to: '2026-05-01' }, /period doesn’t apply/);
  bad({ ...o, report: 'ageing', from: '2026-04-01' }, /period doesn’t apply/);
});

test('filters belong to their report only', () => {
  const cust = '5b0a2a8e-3e8c-4c3a-9b0e-1b2c3d4e5f60';
  assert.equal(good({ ...base, customer: cust }).customerId, cust);
  assert.equal(good({ ...base, customer: cust.toUpperCase() }).customerId, cust, 'a customer id is compared lower-case');
  bad({ ...base, customer: 'acme' }, /customer filter/);
  bad({ ...base, customer: `${cust}' or 1=1` });

  assert.equal(good({ ...base, state: 'marked_paid' }).state, 'marked_paid');
  bad({ ...base, state: 'bogus' }, /status filter/);
  bad({ ...base, report: 'payments', state: 'unpaid' }, /doesn’t apply/);
  const o = { report: 'outstanding', currency: 'INR', today: '2026-10-26' };
  assert.equal(good({ ...o, state: 'partial' }).state, 'partial');
  bad({ ...o, state: 'paid' }, /isn’t valid for this report/);
  bad({ ...o, state: 'marked_paid' }, /isn’t valid for this report/);

  assert.equal(good({ ...o, bucket: 'd31_60' }).bucket, 'd31_60');
  bad({ ...o, bucket: 'forever' }, /age filter/);
  bad({ ...base, bucket: 'd1_30' }, /only applies to the outstanding/);

  const p = { ...base, report: 'payments' };
  assert.equal(good({ ...p, method: 'upi' }).method, 'upi');
  bad({ ...p, method: 'bitcoin' }, /payment method/);
  bad({ ...base, method: 'upi' }, /only applies to the payments/);

  assert.equal(good({ ...p, includeVoided: '1' }).includeVoided, true);
  assert.equal(good({ ...p, includeVoided: '0' }).includeVoided, false);
  bad({ ...p, includeVoided: 'yes' });
  bad({ ...base, includeVoided: '1' }, /only apply to the payments/);
});

test('paging: positive whole numbers, and never a bigger page than the report allows', () => {
  assert.equal(good({ ...base, page: '3' }).page, 3);
  assert.equal(good({ ...base, pageSize: '1' }).pageSize, 1);
  assert.equal(good({ ...base, pageSize: String(PAGE_SIZE.register) }).pageSize, PAGE_SIZE.register);
  for (const v of ['0', '-1', '1.5', 'abc', '', '9999999']) bad({ ...base, page: v });
  bad({ ...base, pageSize: String(PAGE_SIZE.register + 1) }, /at a time/);
  bad({ ...base, pageSize: '0' });
  assert.ok(PAGE_SIZE.register <= 100 && PAGE_SIZE.payments <= 500, 'pages stay small enough for one Worker request');
  assert.ok(EXPORT_CAP.register >= PAGE_SIZE.register && EXPORT_CAP.payments >= PAGE_SIZE.payments);
});

test('fixed2: two decimals, no symbol or grouping, no negative zero', () => {
  assert.equal(fixed2(1234.5), '1234.50');
  assert.equal(fixed2(0), '0.00');
  assert.equal(fixed2(-0), '0.00');
  assert.equal(fixed2(-0.001), '0.00');
  assert.equal(fixed2(125000), '125000.00');
  assert.equal(fixed2(0.1 + 0.2), '0.30');
  assert.equal(fixed2(1.005), '1.01', 'rounds the way the ledger does (toCents)');
  assert.equal(fixed2(99999999999.99), '99999999999.99');
  assert.equal(fixed2(NaN), '');
  assert.equal(fixed2(null), '');
});

const reg = (over: Partial<RegisterRow> = {}): RegisterRow => ({
  number: 'INV-1', issueDate: '2026-09-01', dueDate: '2026-09-15', docType: 'Tax invoice', client: 'Acme', clientGstin: '', customer: '', placeOfSupply: '', currency: 'INR',
  subtotal: 100, discount: 0, taxable: 100, tax: 18, cgst: 9, sgst: 9, igst: 0, total: 118, received: 0, balance: 118, status: 'unpaid', daysOverdue: 0, lastPayment: null, ...over,
});

test('register cells follow the column list exactly, with blanks (not zeros) where a figure is unknown', () => {
  const cells = registerCells(reg());
  assert.equal(cells.length, COLUMNS.register.length);
  assert.equal(cells[COLUMNS.register.findIndex((c) => c.key === 'total')], '118.00');
  const blanked = registerCells(reg({ subtotal: null, discount: null, taxable: null, tax: null, cgst: null, sgst: null, igst: null }));
  for (const k of ['subtotal', 'discount', 'taxable', 'tax', 'cgst', 'sgst', 'igst']) assert.equal(blanked[COLUMNS.register.findIndex((c) => c.key === k)], '', k);
  assert.equal(blanked[COLUMNS.register.findIndex((c) => c.key === 'total')], '118.00', 'stored figures stay');
});

test('status words follow the ledger rule', () => {
  assert.equal(statusWords('unpaid', 100, 0), 'Unpaid');
  assert.equal(statusWords('unpaid', 100, 40), 'Partially paid');
  assert.equal(statusWords('paid', 100, 100), 'Paid');
  assert.equal(statusWords('paid', 100, 0), 'Marked paid');
});

const payRow = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  paidOn: '2026-10-01', number: 'INV-1', client: 'Acme', customer: '', currency: 'INR', amount: 100, method: 'upi', reference: '', note: '', voided: false, voidedOn: null, voidReason: '',
  recordedAt: '2026-10-01T10:00:00Z', paymentId: 'p1', ...over,
});

test('voided payments are labelled, say they are not counted, and carry their date and reason', () => {
  const idx = (k: string) => COLUMNS.payments.findIndex((c) => c.key === k);
  const ok = paymentCells(payRow());
  assert.deepEqual([ok[idx('status')], ok[idx('counted')], ok[idx('method')]], ['Recorded', 'Yes', 'UPI']);
  const v = paymentCells(payRow({ voided: true, voidedOn: '2026-10-02', voidReason: 'Entered twice' }));
  assert.deepEqual([v[idx('status')], v[idx('counted')], v[idx('voidedOn')], v[idx('voidReason')]], ['Voided', 'No', '2026-10-02', 'Entered twice']);
});

test('verifyRows adds up in whole paise: no float drift, and counted and voided money are kept apart', () => {
  const rows = [paymentCells(payRow({ amount: 0.1, paymentId: 'a' })), paymentCells(payRow({ amount: 0.2, paymentId: 'b' })), paymentCells(payRow({ amount: 299.7, paymentId: 'c' }))];
  const t: ReportTotals = { report: 'payments', counted: { count: 3, amount: 300 }, voided: null, markedPaid: { count: 0, total: 0 } };
  assert.equal(verifyRows(COLUMNS.payments, rows, t).ok, true, '0.1 + 0.2 + 299.7 is exactly 300.00');
  assert.equal(verifyRows(COLUMNS.payments, rows, { ...t, counted: { count: 3, amount: 300.01 } } as ReportTotals).ok, false);
  assert.equal(verifyRows(COLUMNS.payments, rows.slice(1), t).ok, false);

  const v = paymentCells(payRow({ amount: 50, voided: true, voidedOn: '2026-10-02', paymentId: 'd' }));
  const withV: ReportTotals = { report: 'payments', counted: { count: 3, amount: 300 }, voided: { count: 1, amount: 50 }, markedPaid: { count: 0, total: 0 } };
  assert.equal(verifyRows(COLUMNS.payments, [...rows, v], withV).ok, true);
  assert.equal(verifyRows(COLUMNS.payments, [...rows, v], t).ok, false, 'voided rows must not appear unless asked for');
  assert.equal(verifyRows(COLUMNS.payments, [rows[0], rows[0], rows[2]], t).ok, false, 'one payment listed twice');
});

test('verifyRows for the register and the ageing summary', () => {
  const rows = [registerCells(reg({ total: 118, received: 18, balance: 100 })), registerCells(reg({ number: 'INV-2', total: 50.5, received: 50.5, balance: 0, status: 'paid' }))];
  const t: ReportTotals = { report: 'register', count: 2, total: 168.5, received: 68.5, balance: 100 };
  assert.equal(verifyRows(COLUMNS.register, rows, t).ok, true);
  const off = verifyRows(COLUMNS.register, rows, { ...t, balance: 100.01 });
  assert.equal(off.ok, false);
  if (!off.ok) assert.match(off.message, /Run it again/);

  const age = [
    ageingCells({ bucket: 'not_due', invoices: 0, balance: 0, currency: 'INR', asOf: '2026-10-26' }),
    ageingCells({ bucket: 'd1_30', invoices: 1, balance: 4000, currency: 'INR', asOf: '2026-10-26' }),
    ageingCells({ bucket: 'd31_60', invoices: 1, balance: 6800, currency: 'INR', asOf: '2026-10-26' }),
    ageingCells({ bucket: 'd60_plus', invoices: 2, balance: 1600, currency: 'INR', asOf: '2026-10-26' }),
  ];
  const at: ReportTotals = { report: 'ageing', count: 4, balance: 12400, buckets: [] };
  assert.equal(verifyRows(COLUMNS.ageing, age, at).ok, true);
  assert.equal(verifyRows(COLUMNS.ageing, age, { ...at, count: 5 }).ok, false);
});

test('file names say what the file is, its currency and its period or date — letters, digits and dashes only', () => {
  assert.equal(reportFilename(good(base)), 'kaamsolv-invoice-register-INR-2026-04-01-to-2027-03-31.csv');
  assert.equal(reportFilename(good({ ...base, report: 'payments', includeVoided: '1', method: 'upi' })), 'kaamsolv-payments-received-INR-2026-04-01-to-2027-03-31-filtered-with-voided.csv');
  assert.equal(reportFilename(good({ report: 'outstanding', currency: 'USD', today: '2026-10-26' })), 'kaamsolv-outstanding-invoices-USD-as-of-2026-10-26.csv');
  assert.equal(reportFilename(good({ report: 'ageing', currency: 'INR', today: '2026-10-26' })), 'kaamsolv-ageing-summary-INR-as-of-2026-10-26.csv');
  assert.match(reportFilename(good(base)), /^[A-Za-z0-9._-]+$/);
});

test('the reports never claim to be a GST return or a filing', () => {
  assert.match(OPERATIONAL_NOTE, /not GST returns, tax filings or audited statements/);
  for (const c of [...COLUMNS.register, ...COLUMNS.payments, ...COLUMNS.outstanding, ...COLUMNS.ageing]) {
    assert.doesNotMatch(c.label, /GSTR|return|filing/i, c.label);
  }
});
