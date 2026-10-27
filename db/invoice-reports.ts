/**
 * Operational reports (Stage F) — one small page of rows plus the totals over every match, per report.
 * Docs: docs/products/invoice-generator.md → "Reports & exports".
 *
 * The payment ledger is the source of truth. Received money is a non-voided `invoice_payments` row (by the date
 * received) or `invoices.amount_paid`, the ledger's trigger-kept total; what is owed is `total − amount_paid`. Nothing
 * here recomputes a payment, and nothing is invented for a legacy "marked paid" invoice (it has no payment rows, so
 * it appears in no payment list — only as a count). The conditions are the shared SQL fragments of
 * db/invoice-filters.ts, so every total equals the Collections page, a customer's page and a filtered invoice list.
 *
 * One currency per request. Every query is scoped to `user_id`. Quotations never appear. Voided payments are
 * excluded unless asked for, and then they are listed — never counted. Dates are plain calendar dates.
 *
 * Framework-free; takes an explicit `db`.
 */

import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { AGEING_BUCKETS, ageingBucket, daysOverdue, type AgeingBucket } from '../app/lib/invoice/collections.ts';
import { isTaxInvoice, placeOfSupplyLabel } from '../app/lib/invoice/gst-tax.ts';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import { toCents } from '../app/lib/invoice/payments.ts';
import type { AgeingRow, OutstandingRow, PaymentRow, RegisterRow, ReportQuery, ReportTotals } from '../app/lib/invoice/reports.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';
import { BALANCE, OPEN, OWED, ageingCaseSql, bucketSql, overdueSql, stateSql } from './invoice-filters.ts';
import type { Db } from './links.ts';
import { customers, invoicePayments, invoices } from './schema.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const money = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;
const day = (iso: string) => sql`${iso}::date`;
const num = (v: unknown) => Number(v ?? 0);

/** This user's invoices (never quotations) in this currency, optionally one saved customer. */
const invoiceScope = (userId: string, q: ReportQuery): SQL[] => [
  sql`${invoices.userId} = ${userId}::uuid`,
  sql`${invoices.kind} = 'invoice'`,
  sql`${invoices.currency} = ${q.currency}`,
  ...(q.customerId ? [sql`${invoices.customerId} = ${q.customerId}::uuid`] : []),
];

const LAST_PAYMENT = sql<string | null>`(select max(p.paid_on)::text from invoice_payments p where p.invoice_id = ${invoices.id} and p.voided_at is null)`;

// ─── Invoice register ────────────────────────────────────────────────────────────────────────────

type Register = { rows: RegisterRow[]; totals: Extract<ReportTotals, { report: 'register' }>; matched: number; blanked: number };

/** Invoices issued in the period (their payment position as of today). */
export async function registerPage(db: Db, userId: string, q: ReportQuery): Promise<Register> {
  const conds = [...invoiceScope(userId, q), sql`${invoices.issueDate} between ${day(q.from!)} and ${day(q.to!)}`];
  if (q.state) conds.push(stateSql(q.state, q.today));
  const where = and(...conds);

  // The page's ids are picked on narrow columns first, so only these rows' documents are read (not every match's).
  const pageIds = db
    .select({ id: invoices.id })
    .from(invoices)
    .where(where)
    .orderBy(asc(invoices.issueDate), asc(invoices.createdAt), asc(invoices.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize)
    .as('page_ids');

  const [[agg], rows] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${invoices.total}), 0)::text`,
        received: sql<string>`coalesce(sum(${invoices.amountPaid}), 0)::text`,
        balance: sql<string>`coalesce(sum(${OWED}), 0)::text`,
      })
      .from(invoices)
      .where(where),
    db
      .select({
        number: invoices.number,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        clientName: invoices.clientName,
        currency: invoices.currency,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        status: invoices.status,
        data: invoices.data,
        customerName: customers.name,
        balance: sql<number>`${OWED}::float8`,
        lastPayment: LAST_PAYMENT,
      })
      .from(invoices)
      .innerJoin(pageIds, eq(pageIds.id, invoices.id))
      .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.userId, invoices.userId)))
      .orderBy(asc(invoices.issueDate), asc(invoices.createdAt), asc(invoices.id)),
  ]);

  let blanked = 0;
  const out: RegisterRow[] = rows.map((r) => {
    const doc = r.data as Partial<Invoice> | null;
    const base = {
      number: r.number,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      client: r.clientName,
      clientGstin: doc?.client?.gstin?.trim() ?? '',
      customer: r.customerName ?? '',
      currency: r.currency,
      total: money(r.total),
      received: money(r.amountPaid),
      balance: money(r.balance),
      status: r.status,
      daysOverdue: money(r.balance) > 0 ? daysOverdue(r.dueDate, q.today) : 0,
      lastPayment: r.lastPayment,
    };
    let derived: Pick<RegisterRow, 'docType' | 'placeOfSupply' | 'subtotal' | 'discount' | 'taxable' | 'tax' | 'cgst' | 'sgst' | 'igst'> = {
      docType: doc?.docType === 'bill_of_supply' ? 'Bill of supply' : 'Invoice',
      placeOfSupply: '',
      subtotal: null,
      discount: null,
      taxable: null,
      tax: null,
      cgst: null,
      sgst: null,
      igst: null,
    };
    try {
      const t = computeTotals(doc as Invoice);
      if (toCents(t.total) === toCents(r.total)) {
        derived = {
          docType: t.gst ? 'Tax invoice' : doc?.docType === 'bill_of_supply' ? 'Bill of supply' : 'Invoice',
          placeOfSupply: t.gst ? placeOfSupplyLabel(t.gst.placeOfSupply) : '',
          subtotal: t.subtotal,
          discount: t.discount,
          taxable: t.taxable,
          tax: t.tax,
          cgst: t.gst ? t.gst.cgst : null,
          sgst: t.gst ? t.gst.sgst : null,
          igst: t.gst ? t.gst.igst : null,
        };
      } else blanked++;
    } catch {
      blanked++;
    }
    return { ...base, ...derived };
  });

  return {
    rows: out,
    matched: agg?.n ?? 0,
    blanked,
    totals: { report: 'register', count: agg?.n ?? 0, total: money(agg?.total), received: money(agg?.received), balance: money(agg?.balance) },
  };
}

// ─── Payments received ───────────────────────────────────────────────────────────────────────────

type Payments = { rows: PaymentRow[]; totals: Extract<ReportTotals, { report: 'payments' }>; matched: number };

const p = invoicePayments;

/** Payments dated in the period, from the ledger. Voided ones only when asked for, and then never in `counted`. */
export async function paymentsPage(db: Db, userId: string, q: ReportQuery): Promise<Payments> {
  const conds: SQL[] = [
    sql`${p.userId} = ${userId}::uuid`,
    sql`${p.currency} = ${q.currency}`,
    sql`${p.paidOn} between ${day(q.from!)} and ${day(q.to!)}`,
  ];
  if (!q.includeVoided) conds.push(sql`${p.voidedAt} is null`);
  if (q.method) conds.push(sql`${p.method} = ${q.method}`);
  if (q.customerId) conds.push(sql`${invoices.customerId} = ${q.customerId}::uuid`);
  const where = and(...conds);
  const joinInvoice = and(eq(invoices.id, p.invoiceId), eq(invoices.userId, p.userId));

  // Legacy invoices marked paid before payments were recorded: no ledger rows, none invented — just a count.
  const markedConds = [
    ...invoiceScope(userId, q),
    sql`${invoices.status} = 'paid' and ${invoices.amountPaid} = 0`,
    sql`${invoices.issueDate} between ${day(q.from!)} and ${day(q.to!)}`,
  ];

  const pageIds = db
    .select({ id: p.id })
    .from(p)
    .innerJoin(invoices, joinInvoice)
    .where(where)
    .orderBy(asc(p.paidOn), asc(p.createdAt), asc(p.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize)
    .as('page_ids');

  const [[agg], [marked], rows] = await Promise.all([
    db
      .select({
        counted: sql<number>`(count(*) filter (where ${p.voidedAt} is null))::int`,
        countedAmount: sql<string>`coalesce(sum(${p.amount}) filter (where ${p.voidedAt} is null), 0)::text`,
        voided: sql<number>`(count(*) filter (where ${p.voidedAt} is not null))::int`,
        voidedAmount: sql<string>`coalesce(sum(${p.amount}) filter (where ${p.voidedAt} is not null), 0)::text`,
      })
      .from(p)
      .innerJoin(invoices, joinInvoice)
      .where(where),
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${invoices.total}), 0)::text` })
      .from(invoices)
      .where(and(...markedConds)),
    db
      .select({
        id: p.id,
        paidOn: p.paidOn,
        number: invoices.number,
        client: invoices.clientName,
        customerName: customers.name,
        currency: p.currency,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        note: p.note,
        voidedOn: sql<string | null>`to_char(${p.voidedAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        voidReason: p.voidReason,
        recordedAt: sql<string>`to_char(${p.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      })
      .from(p)
      .innerJoin(pageIds, eq(pageIds.id, p.id))
      .innerJoin(invoices, joinInvoice)
      .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.userId, invoices.userId)))
      .orderBy(asc(p.paidOn), asc(p.createdAt), asc(p.id)),
  ]);

  const counted = agg?.counted ?? 0;
  const voided = agg?.voided ?? 0;
  return {
    rows: rows.map((r) => ({
      paidOn: r.paidOn,
      number: r.number,
      client: r.client,
      customer: r.customerName ?? '',
      currency: r.currency,
      amount: money(r.amount),
      method: r.method as PaymentRow['method'],
      reference: r.reference,
      note: r.note,
      voided: r.voidedOn !== null,
      voidedOn: r.voidedOn,
      voidReason: r.voidReason,
      recordedAt: r.recordedAt,
      paymentId: r.id,
    })),
    matched: counted + voided,
    totals: {
      report: 'payments',
      counted: { count: counted, amount: money(agg?.countedAmount) },
      voided: q.includeVoided ? { count: voided, amount: money(agg?.voidedAmount) } : null,
      markedPaid: { count: marked?.n ?? 0, total: money(marked?.total) },
    },
  };
}

// ─── Outstanding invoices and the ageing summary ─────────────────────────────────────────────────

const openConds = (userId: string, q: ReportQuery): SQL[] => {
  const c = [...invoiceScope(userId, q), OPEN];
  if (q.state) c.push(stateSql(q.state, q.today));
  if (q.bucket) c.push(bucketSql(q.bucket, q.today));
  return c;
};

type Outstanding = { rows: OutstandingRow[]; totals: Extract<ReportTotals, { report: 'outstanding' }>; matched: number };

/** Invoices that still have a balance, as of today (the period never applies), oldest due first. */
export async function outstandingPage(db: Db, userId: string, q: ReportQuery): Promise<Outstanding> {
  const where = and(...openConds(userId, q));
  const [[agg], rows] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        balance: sql<string>`coalesce(sum(${BALANCE}), 0)::text`,
        overdue: sql<string>`coalesce(sum(${BALANCE}) filter (where ${overdueSql(q.today)}), 0)::text`,
      })
      .from(invoices)
      .where(where),
    db
      .select({
        number: invoices.number,
        client: invoices.clientName,
        customerName: customers.name,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        currency: invoices.currency,
        total: invoices.total,
        received: invoices.amountPaid,
        status: invoices.status,
        balance: sql<number>`${BALANCE}::float8`,
      })
      .from(invoices)
      .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.userId, invoices.userId)))
      .where(where)
      .orderBy(sql`${invoices.dueDate} asc nulls last`, asc(invoices.number), asc(invoices.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
  ]);
  return {
    rows: rows.map((r) => ({
      number: r.number,
      client: r.client,
      customer: r.customerName ?? '',
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      currency: r.currency,
      total: money(r.total),
      received: money(r.received),
      balance: money(r.balance),
      daysOverdue: daysOverdue(r.dueDate, q.today),
      bucket: ageingBucket(r.dueDate, q.today),
      status: r.status,
    })),
    matched: agg?.n ?? 0,
    totals: { report: 'outstanding', count: agg?.n ?? 0, balance: money(agg?.balance), overdue: money(agg?.overdue) },
  };
}

type Ageing = { rows: AgeingRow[]; totals: Extract<ReportTotals, { report: 'ageing' }>; matched: number };

/** The outstanding balance in the five age groups — the same grouping as the Collections page. Always five rows. */
export async function ageingSummary(db: Db, userId: string, q: ReportQuery): Promise<Ageing> {
  const stateOrCustomer = [...invoiceScope(userId, q), OPEN, ...(q.state ? [stateSql(q.state, q.today)] : [])];
  const result = await db.execute(sql`
    select b.bucket, coalesce(sum(${BALANCE}), 0)::text as amount, count(*)::int as n
    from ${invoices}
    cross join lateral (select ${ageingCaseSql(q.today)} as bucket) b
    where ${and(...stateOrCustomer)}
    group by b.bucket`);
  const found = new Map(rowsOf<{ bucket: string; amount: string; n: number }>(result).map((r) => [r.bucket, r]));
  const buckets = AGEING_BUCKETS.map((b) => ({ bucket: b.key as AgeingBucket, label: b.label, count: num(found.get(b.key)?.n), amount: money(found.get(b.key)?.amount) }));
  return {
    rows: buckets.map((b) => ({ bucket: b.bucket, invoices: b.count, balance: b.amount, currency: q.currency, asOf: q.today })),
    matched: AGEING_BUCKETS.length,
    totals: {
      report: 'ageing',
      count: buckets.reduce((n, b) => n + b.count, 0),
      balance: money(buckets.reduce((n, b) => n + toCents(b.amount), 0) / 100),
      buckets,
    },
  };
}
