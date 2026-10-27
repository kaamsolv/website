/**
 * Operational reports for the Invoice Generator (Stage F) — what they are, how a request is checked, what each
 * column holds, and the integrity check the browser runs on a finished export. Framework-free.
 *
 * **These are operational records of what has been entered in KaamSolv — not GST returns, tax filings or audited
 * statements** (`OPERATIONAL_NOTE`), and nothing here is named or formatted as a statutory register.
 *
 * ─── How an export works ──────────────────────────────────────────────────────────────────────────
 * The server computes every figure from the invoices and the payment ledger and hands them over in small pages
 * (100 register rows, 500 payment rows — each request stays cheap on a Worker). The browser joins the pages
 * with `toCsv` (which escapes, defuses spreadsheet formulas and adds the UTF-8 byte-order mark) and saves the
 * file. It does no money arithmetic — except the *check*: it adds up the rows it received and compares them with
 * the totals the server computed over every match (`verifyRows`). A mismatch (data changed mid-export, a dropped
 * page) means no file is offered.
 *
 * One currency per file, always. Dates are plain calendar dates (app/lib/invoice/collections.ts). Money cells are
 * plain numbers with two decimals — no symbol, no thousands separator — and the currency has its own column.
 */

import { isAgeingBucket, validateRange, AGEING_BUCKETS, type AgeingBucket } from './collections';
import { FILTER_STATES, type FilterState } from './filters';
import { METHOD_LABELS, PAYMENT_METHODS, STATE_LABELS, isPaymentMethod, paymentSummary, toCents, type PaymentMethod } from './payments';
import { clientTodayOk } from './recurring';
import { CURRENCIES, type CurrencyCode } from './types';

export const OPERATIONAL_NOTE =
  'These are operational reports of what you’ve recorded in KaamSolv. They are not GST returns, tax filings or audited statements — check anything you file with your accountant.';

export const REPORTS = ['register', 'payments', 'outstanding', 'ageing'] as const;
export type ReportKind = (typeof REPORTS)[number];

export const REPORT_LABELS: Record<ReportKind, string> = {
  register: 'Invoice register',
  payments: 'Payments received',
  outstanding: 'Outstanding invoices',
  ageing: 'Ageing summary',
};

export const REPORT_BASIS: Record<ReportKind, string> = {
  register: 'One row per invoice issued in the period (quotations aren’t included), with its payment position as of today.',
  payments: 'One row per payment recorded with a date received in the period. Voided payments only if you ask for them — and never counted.',
  outstanding: 'One row per invoice that still has a balance, as of today. The period doesn’t apply: this is a position, like the dashboard’s Outstanding.',
  ageing: 'What’s outstanding today, grouped by how long it has been past its due date — the same five groups as on Payments & collections.',
};

/** Rows per request (a register row needs its whole invoice document read, so it's the smallest). */
export const PAGE_SIZE: Record<ReportKind, number> = { register: 100, payments: 500, outstanding: 500, ageing: 10 };
/** The most rows one export may hold; past it the person is asked for a shorter period or a narrower filter. */
export const EXPORT_CAP: Record<ReportKind, number> = { register: 10_000, payments: 50_000, outstanding: 10_000, ageing: 10 };

/** The payment states an outstanding report can be narrowed to (it only ever holds invoices that still owe). */
export const OUTSTANDING_STATES = ['unpaid', 'partial', 'overdue'] as const;
export type OutstandingState = (typeof OUTSTANDING_STATES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportQuery = {
  report: ReportKind;
  currency: CurrencyCode;
  /** The visitor's calendar date: "as of" for ages, overdue and status. Required, no server-clock fallback. */
  today: string;
  /** Register: issue date. Payments: date received. Not used by outstanding or ageing. */
  from?: string;
  to?: string;
  customerId?: string;
  state?: FilterState;
  bucket?: AgeingBucket;
  method?: PaymentMethod;
  includeVoided: boolean;
  page: number;
  pageSize: number;
};

const refuse = (message: string) => ({ ok: false as const, message });

/** Checks a report request. Filters that don't belong to the chosen report are refused, not silently ignored. */
export function parseReportQuery(q: URLSearchParams, serverNow: Date = new Date()): { ok: true; value: ReportQuery } | { ok: false; message: string } {
  const report = q.get('report');
  if (!report || !(REPORTS as readonly string[]).includes(report)) return refuse('Choose a report.');
  const kind = report as ReportKind;
  const currency = q.get('currency');
  if (!currency || !(CURRENCIES as readonly string[]).includes(currency)) return refuse('Choose a currency — each file holds one.');
  const today = q.get('today');
  if (!clientTodayOk(today, serverNow)) return refuse('Your device’s date looks off. Check your clock and try again.');

  const value: ReportQuery = { report: kind, currency: currency as CurrencyCode, today, includeVoided: false, page: 1, pageSize: PAGE_SIZE[kind] };

  if (kind === 'register' || kind === 'payments') {
    const range = validateRange(q.get('from'), q.get('to'));
    if (!range.ok) return refuse(range.message);
    value.from = range.from;
    value.to = range.to;
  } else if (q.has('from') || q.has('to')) {
    return refuse('The period doesn’t apply to this report — it shows where things stand today.');
  }

  const customer = q.get('customer');
  if (customer !== null && customer !== '') {
    if (!UUID_RE.test(customer)) return refuse('That customer filter isn’t valid.');
    value.customerId = customer.toLowerCase();
  }

  const state = q.get('state');
  if (state !== null) {
    if (kind === 'register') {
      if (!(FILTER_STATES as readonly string[]).includes(state)) return refuse('That status filter isn’t valid.');
    } else if (kind === 'outstanding' || kind === 'ageing') {
      if (!(OUTSTANDING_STATES as readonly string[]).includes(state)) return refuse('That status filter isn’t valid for this report.');
    } else return refuse('A status filter doesn’t apply to this report.');
    value.state = state as FilterState;
  }

  const bucket = q.get('bucket');
  if (bucket !== null) {
    if (kind !== 'outstanding') return refuse('An age filter only applies to the outstanding report.');
    if (!isAgeingBucket(bucket)) return refuse('That age filter isn’t valid.');
    value.bucket = bucket;
  }

  const method = q.get('method');
  if (method !== null) {
    if (kind !== 'payments') return refuse('A payment-method filter only applies to the payments report.');
    if (!isPaymentMethod(method)) return refuse('That payment method isn’t valid.');
    value.method = method;
  }

  const voided = q.get('includeVoided');
  if (voided !== null) {
    if (kind !== 'payments') return refuse('Voided payments only apply to the payments report.');
    if (voided !== '1' && voided !== '0') return refuse('That voided-payments option isn’t valid.');
    value.includeVoided = voided === '1';
  }

  const rawPage = q.get('page');
  const rawSize = q.get('pageSize');
  if (rawPage !== null && !/^[1-9]\d{0,5}$/.test(rawPage)) return refuse('That page number isn’t valid.');
  if (rawSize !== null && !/^[1-9]\d{0,3}$/.test(rawSize)) return refuse('That page size isn’t valid.');
  if (rawSize !== null && Number(rawSize) > PAGE_SIZE[kind]) return refuse(`This report is read ${PAGE_SIZE[kind]} rows at a time at most.`);
  if (rawPage !== null) value.page = Number(rawPage);
  if (rawSize !== null) value.pageSize = Number(rawSize);
  return { ok: true, value };
}

// ─── Columns and cells ───────────────────────────────────────────────────────────────────────────

export type Column = { key: string; label: string };

export const COLUMNS: Record<ReportKind, Column[]> = {
  register: [
    { key: 'number', label: 'Invoice no.' },
    { key: 'issueDate', label: 'Issue date' },
    { key: 'dueDate', label: 'Due date' },
    { key: 'docType', label: 'Document type' },
    { key: 'client', label: 'Client' },
    { key: 'clientGstin', label: 'Client GSTIN' },
    { key: 'customer', label: 'Saved customer' },
    { key: 'placeOfSupply', label: 'Place of supply' },
    { key: 'currency', label: 'Currency' },
    { key: 'subtotal', label: 'Subtotal' },
    { key: 'discount', label: 'Discount' },
    { key: 'taxable', label: 'Taxable value' },
    { key: 'cgst', label: 'CGST' },
    { key: 'sgst', label: 'SGST / UTGST' },
    { key: 'igst', label: 'IGST' },
    { key: 'tax', label: 'Total tax' },
    { key: 'total', label: 'Invoice total' },
    { key: 'received', label: 'Received' },
    { key: 'balance', label: 'Balance' },
    { key: 'status', label: 'Payment status' },
    { key: 'daysOverdue', label: 'Days overdue (as of today)' },
    { key: 'lastPayment', label: 'Last payment date' },
  ],
  payments: [
    { key: 'paidOn', label: 'Date received' },
    { key: 'number', label: 'Invoice no.' },
    { key: 'client', label: 'Client' },
    { key: 'customer', label: 'Saved customer' },
    { key: 'currency', label: 'Currency' },
    { key: 'amount', label: 'Amount' },
    { key: 'method', label: 'Method' },
    { key: 'reference', label: 'Reference' },
    { key: 'note', label: 'Note' },
    { key: 'status', label: 'Status' },
    { key: 'counted', label: 'Counted in totals' },
    { key: 'voidedOn', label: 'Voided on (UTC)' },
    { key: 'voidReason', label: 'Void reason' },
    { key: 'recordedAt', label: 'Recorded at (UTC)' },
    { key: 'paymentId', label: 'Payment ID' },
  ],
  outstanding: [
    { key: 'number', label: 'Invoice no.' },
    { key: 'client', label: 'Client' },
    { key: 'customer', label: 'Saved customer' },
    { key: 'issueDate', label: 'Issue date' },
    { key: 'dueDate', label: 'Due date' },
    { key: 'currency', label: 'Currency' },
    { key: 'total', label: 'Invoice total' },
    { key: 'received', label: 'Received' },
    { key: 'balance', label: 'Balance' },
    { key: 'daysOverdue', label: 'Days overdue (as of today)' },
    { key: 'ageGroup', label: 'Age group' },
    { key: 'status', label: 'Payment status' },
  ],
  ageing: [
    { key: 'ageGroup', label: 'Age group' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'balance', label: 'Balance' },
    { key: 'currency', label: 'Currency' },
    { key: 'asOf', label: 'As of' },
  ],
};

/** Two decimals, no symbol, no grouping: "20000.50". (-0 and NaN become "0.00".) */
export function fixed2(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return (Object.is(v, -0) ? 0 : v).toFixed(2);
}
const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : fixed2(n));

export type RegisterRow = {
  number: string;
  issueDate: string | null;
  dueDate: string | null;
  docType: 'Tax invoice' | 'Bill of supply' | 'Invoice';
  client: string;
  clientGstin: string;
  customer: string;
  placeOfSupply: string;
  currency: string;
  /**
   * Worked out from the invoice's own lines. All of subtotal → total tax are null (blank cells) when those lines
   * no longer add up to the saved total — the total, received and balance are the stored, authoritative figures.
   */
  subtotal: number | null;
  discount: number | null;
  taxable: number | null;
  tax: number | null;
  /** Null when the invoice isn't a GST tax invoice (blank rather than a false 0). */
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number;
  received: number;
  balance: number;
  status: 'unpaid' | 'paid';
  daysOverdue: number;
  lastPayment: string | null;
};

export type PaymentRow = {
  paidOn: string;
  number: string;
  client: string;
  customer: string;
  currency: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  note: string;
  voided: boolean;
  voidedOn: string | null;
  voidReason: string;
  recordedAt: string;
  paymentId: string;
};

export type OutstandingRow = {
  number: string;
  client: string;
  customer: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  total: number;
  received: number;
  balance: number;
  daysOverdue: number;
  bucket: AgeingBucket;
  status: 'unpaid' | 'paid';
};

export type AgeingRow = { bucket: AgeingBucket; invoices: number; balance: number; currency: string; asOf: string };

/** The payment-status words: Unpaid, Partially paid, Paid, Marked paid — from the ledger's own rule. */
export function statusWords(status: 'unpaid' | 'paid', total: number, received: number): string {
  return STATE_LABELS[paymentSummary({ total, amountPaid: received, status }, '').state];
}

export const bucketLabel = (b: AgeingBucket): string => AGEING_BUCKETS.find((x) => x.key === b)?.label ?? b;

export const registerCells = (r: RegisterRow): string[] => [
  r.number,
  r.issueDate ?? '',
  r.dueDate ?? '',
  r.docType,
  r.client,
  r.clientGstin,
  r.customer,
  r.placeOfSupply,
  r.currency,
  money(r.subtotal),
  money(r.discount),
  money(r.taxable),
  money(r.cgst),
  money(r.sgst),
  money(r.igst),
  money(r.tax),
  money(r.total),
  money(r.received),
  money(r.balance),
  statusWords(r.status, r.total, r.received),
  String(r.daysOverdue),
  r.lastPayment ?? '',
];

export const paymentCells = (r: PaymentRow): string[] => [
  r.paidOn,
  r.number,
  r.client,
  r.customer,
  r.currency,
  money(r.amount),
  METHOD_LABELS[r.method],
  r.reference,
  r.note,
  r.voided ? 'Voided' : 'Recorded',
  r.voided ? 'No' : 'Yes',
  r.voidedOn ?? '',
  r.voidReason,
  r.recordedAt,
  r.paymentId,
];

export const outstandingCells = (r: OutstandingRow): string[] => [
  r.number,
  r.client,
  r.customer,
  r.issueDate ?? '',
  r.dueDate ?? '',
  r.currency,
  money(r.total),
  money(r.received),
  money(r.balance),
  String(r.daysOverdue),
  bucketLabel(r.bucket),
  statusWords(r.status, r.total, r.received),
];

export const ageingCells = (r: AgeingRow): string[] => [bucketLabel(r.bucket), String(r.invoices), money(r.balance), r.currency, r.asOf];

// ─── Totals, and the check on a finished export ───────────────────────────────────────────────────

export type ReportTotals =
  | { report: 'register'; count: number; total: number; received: number; balance: number }
  | {
      report: 'payments';
      counted: { count: number; amount: number };
      /** Only when voided payments were asked for: they are listed, and never added into `counted`. */
      voided: { count: number; amount: number } | null;
      /** Invoices in this currency marked paid before payments were recorded: they have no payment rows, and none are made up. */
      markedPaid: { count: number; total: number };
    }
  | { report: 'outstanding'; count: number; balance: number; overdue: number }
  | { report: 'ageing'; count: number; balance: number; buckets: { bucket: AgeingBucket; label: string; count: number; amount: number }[] };

/** How many rows a complete export of this result holds. */
export function expectedRows(t: ReportTotals): number {
  switch (t.report) {
    case 'register':
    case 'outstanding':
      return t.count;
    case 'payments':
      return t.counted.count + (t.voided?.count ?? 0);
    case 'ageing':
      return AGEING_BUCKETS.length;
  }
}

const sumCents = (rows: string[][], index: number, only?: (row: string[]) => boolean) =>
  rows.reduce((n, r) => (only && !only(r) ? n : n + Math.round(Number(r[index] || 0) * 100)), 0);

/**
 * Add up the rows that arrived and compare with the totals the server computed over every match, in whole paise.
 * Row count, money and (for payments) the counted / voided split must all agree; nothing is rounded to make them.
 */
export function verifyRows(columns: Column[], rows: string[][], totals: ReportTotals): { ok: true } | { ok: false; message: string } {
  const at = (key: string) => columns.findIndex((c) => c.key === key);
  const bad = (what: string) => ({ ok: false as const, message: `The ${what} in the file doesn’t match the totals — the data may have changed while exporting. Run it again.` });
  if (rows.length !== expectedRows(totals)) return bad('number of rows');
  switch (totals.report) {
    case 'register':
      if (sumCents(rows, at('total')) !== toCents(totals.total)) return bad('invoice totals');
      if (sumCents(rows, at('received')) !== toCents(totals.received)) return bad('amounts received');
      if (sumCents(rows, at('balance')) !== toCents(totals.balance)) return bad('balances');
      return { ok: true };
    case 'outstanding':
      if (sumCents(rows, at('balance')) !== toCents(totals.balance)) return bad('balances');
      return { ok: true };
    case 'payments': {
      const counted = at('counted');
      const amount = at('amount');
      const yes = (r: string[]) => r[counted] === 'Yes';
      const id = at('paymentId');
      if (new Set(rows.map((r) => r[id])).size !== rows.length) return bad('payments (one appeared twice)');
      if (rows.filter(yes).length !== totals.counted.count) return bad('number of counted payments');
      if (sumCents(rows, amount, yes) !== toCents(totals.counted.amount)) return bad('payment amounts');
      if (totals.voided && sumCents(rows, amount, (r) => !yes(r)) !== toCents(totals.voided.amount)) return bad('voided amounts');
      if (!totals.voided && rows.some((r) => !yes(r))) return bad('payments (voided ones appeared)');
      return { ok: true };
    }
    case 'ageing':
      if (sumCents(rows, at('balance')) !== toCents(totals.balance)) return bad('balances');
      if (rows.reduce((n, r) => n + Number(r[at('invoices')] || 0), 0) !== totals.count) return bad('number of invoices');
      return { ok: true };
  }
}

// ─── File names ──────────────────────────────────────────────────────────────────────────────────

const slug: Record<ReportKind, string> = { register: 'invoice-register', payments: 'payments-received', outstanding: 'outstanding-invoices', ageing: 'ageing-summary' };

/** `kaamsolv-invoice-register-INR-2026-04-01-to-2027-03-31.csv`; filtered and voided-inclusive files say so. Letters, digits and dashes only. */
export function reportFilename(q: ReportQuery): string {
  const when = q.report === 'register' || q.report === 'payments' ? `${q.from}-to-${q.to}` : `as-of-${q.today}`;
  const filtered = q.customerId || q.state || q.bucket || q.method ? '-filtered' : '';
  const voided = q.includeVoided ? '-with-voided' : '';
  return `kaamsolv-${slug[q.report]}-${q.currency}-${when}${filtered}${voided}.csv`.replace(/[^A-Za-z0-9._-]/g, '-');
}
