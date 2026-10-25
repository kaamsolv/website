/**
 * Invoice filters as SQL — one definition of "outstanding", "overdue", the ageing buckets and the
 * payment states, shared by the Payments & Collections figures (db/collections.ts) and the filtered
 * invoice list that its cards and charts link to, so a drill-down always adds up to what it came from.
 *
 * Everything reads the payment ledger's cached totals (`invoices.amount_paid`, kept by the ledger
 * triggers) — nothing here recomputes a payment. Every query is scoped to `user_id`, and any filter
 * means invoices only (`kind = 'invoice'`). Dates are plain calendar dates (app/lib/invoice/collections.ts).
 *
 * Framework-free; takes an explicit `db`.
 */

import { and, sql, type SQL } from 'drizzle-orm';
import { EARLIEST_DATE, LATEST_DATE, type AgeingBucket } from '../app/lib/invoice/collections.ts';
import type { FilterState, InvoiceFilter } from '../app/lib/invoice/filters.ts';
import { SUMMARY_COLUMNS, type InvoiceSummary } from './invoices.ts';
import type { Db } from './links.ts';
import { invoices } from './schema.ts';

/** Still owed: not settled, with a balance. Paid, marked-paid and zero-total invoices owe nothing. */
export const OPEN: SQL = sql`(${invoices.status} = 'unpaid' and ${invoices.total} > ${invoices.amountPaid})`;
/** What is still owed on an open invoice. */
export const BALANCE: SQL = sql`(${invoices.total} - ${invoices.amountPaid})`;
/** Balance for any row: 0 unless it is open. */
export const OWED: SQL = sql`(case when ${OPEN} then ${BALANCE} else 0 end)`;

const day = (iso: string) => sql`${iso}::date`;

/** Open and past its due date. Due today is not overdue; no due date is never overdue. */
export const overdueSql = (today: string): SQL => sql`(${OPEN} and ${invoices.dueDate} < ${day(today)})`;

export function bucketSql(bucket: AgeingBucket, today: string): SQL {
  const age = sql`(${day(today)} - ${invoices.dueDate})`;
  switch (bucket) {
    case 'not_due':
      return sql`(${OPEN} and (${invoices.dueDate} is null or ${invoices.dueDate} >= ${day(today)}))`;
    case 'd1_30':
      return sql`(${OPEN} and ${age} between 1 and 30)`;
    case 'd31_60':
      return sql`(${OPEN} and ${age} between 31 and 60)`;
    case 'd60_plus':
      return sql`(${OPEN} and ${age} > 60)`;
  }
}

export function stateSql(state: FilterState, today: string | null): SQL {
  switch (state) {
    case 'unpaid':
      return sql`(${invoices.status} = 'unpaid' and ${invoices.amountPaid} = 0)`;
    case 'partial':
      return sql`(${invoices.status} = 'unpaid' and ${invoices.amountPaid} > 0)`;
    case 'paid':
      return sql`(${invoices.status} = 'paid' and ${invoices.amountPaid} > 0)`;
    case 'marked_paid':
      return sql`(${invoices.status} = 'paid' and ${invoices.amountPaid} = 0)`;
    case 'outstanding':
      return OPEN;
    case 'overdue':
      return overdueSql(today ?? '1970-01-01');
  }
}

/** A non-voided payment dated in [from, to] on the invoice. */
const paidInRange = (from: string, to: string): SQL =>
  sql`exists (select 1 from invoice_payments p where p.invoice_id = ${invoices.id} and p.voided_at is null and p.paid_on between ${day(from)} and ${day(to)})`;

/** Money received on the invoice with a payment dated in [from, to] — what a "received in period" row shows. */
const receivedInRangeSql = (from: string, to: string): SQL =>
  sql`(select coalesce(sum(p.amount), 0) from invoice_payments p where p.invoice_id = ${invoices.id} and p.voided_at is null and p.paid_on between ${day(from)} and ${day(to)})`;

/** The WHERE conditions for a filter: this user's invoices (never quotations) plus each filter given. */
export function invoiceConditions(userId: string, f: InvoiceFilter, today: string | null): SQL[] {
  const c: SQL[] = [sql`${invoices.userId} = ${userId}::uuid`, sql`${invoices.kind} = 'invoice'`];
  if (f.state) c.push(stateSql(f.state, today));
  if (f.currency) c.push(sql`${invoices.currency} = ${f.currency}`);
  if (f.bucket) c.push(bucketSql(f.bucket, today ?? '1970-01-01'));
  if (f.issuedFrom || f.issuedTo) {
    c.push(sql`${invoices.issueDate} between ${day(f.issuedFrom ?? EARLIEST_DATE)} and ${day(f.issuedTo ?? LATEST_DATE)}`);
  }
  if (f.paidFrom || f.paidTo) c.push(paidInRange(f.paidFrom ?? EARLIEST_DATE, f.paidTo ?? LATEST_DATE));
  if (f.customer) c.push(sql`${invoices.customerId} = ${f.customer}::uuid`);
  return c;
}

export type FilteredInvoice = InvoiceSummary & {
  /** Still owed (0 unless open). */
  balance: number;
  /** Present when filtering by payment date: money received in that period on this invoice. */
  receivedInPeriod?: number;
};

export type FilterTotals = {
  currency: string;
  count: number;
  total: number;
  balance: number;
  receivedInPeriod?: number;
};

export const FILTERED_LIST_CAP = 200;

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * The invoices matching a filter, oldest-due first for balances and newest first otherwise, capped at
 * 200 — plus **totals over every match** (per currency), which are what reconcile with a dashboard figure
 * whether or not the list was cut.
 */
export async function listInvoicesFiltered(
  db: Db,
  userId: string,
  f: InvoiceFilter,
  today: string | null,
): Promise<{ invoices: FilteredInvoice[]; totals: FilterTotals[]; capped: boolean }> {
  const where = and(...invoiceConditions(userId, f, today));
  const paidRange = f.paidFrom || f.paidTo ? { from: f.paidFrom ?? EARLIEST_DATE, to: f.paidTo ?? LATEST_DATE } : null;
  const byBalance = f.state === 'outstanding' || f.state === 'overdue' || f.bucket !== undefined;

  const rows = await db
    .select({
      ...SUMMARY_COLUMNS,
      balance: sql<number>`${OWED}::float8`,
      receivedInPeriod: paidRange ? sql<number>`${receivedInRangeSql(paidRange.from, paidRange.to)}::float8` : sql<number>`0::float8`,
    })
    .from(invoices)
    .where(where)
    .orderBy(
      ...(byBalance
        ? [sql`${invoices.dueDate} asc nulls last`, sql`${invoices.number} asc`]
        : [sql`${invoices.issueDate} desc nulls last`, sql`${invoices.createdAt} desc`]),
    )
    .limit(FILTERED_LIST_CAP + 1);

  const totalRows = await db
    .select({
      currency: invoices.currency,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${invoices.total}), 0)::float8`,
      balance: sql<number>`coalesce(sum(${OWED}), 0)::float8`,
      receivedInPeriod: paidRange ? sql<number>`coalesce(sum(${receivedInRangeSql(paidRange.from, paidRange.to)}), 0)::float8` : sql<number>`0::float8`,
    })
    .from(invoices)
    .where(where)
    .groupBy(invoices.currency);
  totalRows.sort((a, b) => (a.currency === 'INR' ? -1 : b.currency === 'INR' ? 1 : a.currency.localeCompare(b.currency)));

  const capped = rows.length > FILTERED_LIST_CAP;
  return {
    invoices: rows.slice(0, FILTERED_LIST_CAP).map((r) => {
      const { receivedInPeriod, ...rest } = r;
      return { ...rest, balance: round2(r.balance), ...(paidRange ? { receivedInPeriod: round2(receivedInPeriod) } : {}) };
    }),
    totals: totalRows.map((t) => ({
      currency: t.currency,
      count: t.count,
      total: round2(t.total),
      balance: round2(t.balance),
      ...(paidRange ? { receivedInPeriod: round2(t.receivedInPeriod) } : {}),
    })),
    capped,
  };
}
