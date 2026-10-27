/**
 * Payments & Collections — the figures behind the Pro dashboard (docs/products/invoice-generator.md → "Collections").
 *
 * The payment ledger is the source of truth: money received is the sum of non-voided `invoice_payments`
 * (by the date received), and what is owed is `invoices.total − invoices.amount_paid`, the ledger's trigger-kept
 * total. Nothing here — and nothing in the browser — recomputes a payment.
 *
 *   Invoiced        Σ total of invoices **issued** in the range             (invoice value, not money)
 *   Received        Σ payments **dated** in the range, on any invoice        (cash basis; legacy "marked paid" adds 0)
 *   Outstanding     Σ balance of open invoices **as of today**               (not filtered by the range)
 *   Overdue         the part of that with due date < today
 *   Collection rate Σ amount_paid ÷ Σ total of invoices **issued in the range**, marked-paid excluded
 *                   — the invoice-cohort rate: money collected so far, to any date, on that cohort
 *   Ageing          Outstanding split by days past due: not yet due · 1–30 · 31–60 · over 60
 *
 * One currency at a time, always: every query filters `currency = $c`, and nothing is summed or converted
 * across currencies. Every query is scoped to `user_id` (and, optionally, one of the user's saved customers).
 * Quotations never count. Dates are plain calendar dates, never converted (app/lib/invoice/collections.ts).
 * A request is a currency lookup, then five small grouped queries in parallel — no row-by-row work.
 *
 * Framework-free; takes an explicit `db`.
 */

import { sql, type SQL } from 'drizzle-orm';
import {
  AGEING_BUCKETS,
  collectionRate,
  daysOverdue,
  monthsBetween,
  type AgeingBucket,
  type CollectionsQuery,
} from '../app/lib/invoice/collections.ts';
import { CURRENCIES, type CurrencyCode } from '../app/lib/invoice/types.ts';
import { toCents } from '../app/lib/invoice/payments.ts';
import { BALANCE, OPEN, bucketSql, overdueSql } from './invoice-filters.ts';
import type { Db } from './links.ts';
import { invoices } from './schema.ts';

export type MoneyCount = { amount: number; count: number };

export type CurrencyOption = { code: CurrencyCode; invoices: number; outstanding: number };

export type Collections = {
  currency: CurrencyCode;
  /** Every currency the account has invoices in, INR first. Never summed together. */
  currencies: CurrencyOption[];
  range: { from: string; to: string };
  today: string;
  summary: {
    invoiced: MoneyCount;
    received: MoneyCount;
    outstanding: MoneyCount;
    overdue: MoneyCount;
    /** The invoice-cohort rate: collected so far on invoices issued in the range ÷ their total. */
    collection: { percent: number | null; collected: number; invoiced: number; invoices: number };
    /** Invoices issued in the range that were marked paid before payments were recorded: settled, but not counted as received. */
    markedPaid: { count: number; total: number };
  };
  /** Every month of the range, zero-filled. */
  monthly: { month: string; invoiced: number; invoicedCount: number; received: number; receivedCount: number }[];
  /** All four buckets, always; they add up to `summary.outstanding`. */
  ageing: { bucket: AgeingBucket; label: string; amount: number; count: number }[];
  /** The five invoices longest past due. */
  needsChasing: { id: string; number: string; clientName: string; dueDate: string; balance: number; daysOverdue: number }[];
};

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const money = (text: string | number | null | undefined) => Math.round(Number(text ?? 0) * 100) / 100;
const cents = (text: string | number | null | undefined) => toCents(Number(text ?? 0));
const day = (iso: string) => sql`${iso}::date`;
const isKnown = (c: string): c is CurrencyCode => (CURRENCIES as readonly string[]).includes(c);

/** The currencies an account has invoices in (INR first), with what is owed in each. */
export async function listCurrencies(db: Db, userId: string): Promise<CurrencyOption[]> {
  const rows = rowsOf<{ currency: string; n: number; outstanding: string }>(
    await db.execute(sql`
      select ${invoices.currency} as currency, count(*)::int as n,
             coalesce(sum(${BALANCE}) filter (where ${OPEN}), 0)::text as outstanding
      from ${invoices}
      where ${invoices.userId} = ${userId}::uuid and ${invoices.kind} = 'invoice'
      group by ${invoices.currency}`),
  );
  return rows
    .filter((r) => isKnown(r.currency))
    .map((r) => ({ code: r.currency as CurrencyCode, invoices: r.n, outstanding: money(r.outstanding) }))
    .sort((a, b) => (a.code === 'INR' ? -1 : b.code === 'INR' ? 1 : a.code.localeCompare(b.code)));
}

/** INR when the account has it, otherwise whichever currency is owed the most, otherwise INR. */
export function defaultCurrency(options: CurrencyOption[]): CurrencyCode {
  if (options.some((o) => o.code === 'INR')) return 'INR';
  return [...options].sort((a, b) => b.outstanding - a.outstanding || b.invoices - a.invoices)[0]?.code ?? 'INR';
}

export async function getCollections(db: Db, userId: string, q: CollectionsQuery): Promise<Collections> {
  const currencies = await listCurrencies(db, userId);
  const currency = q.currency ?? defaultCurrency(currencies);
  const { from, to, today } = q;

  /** This user's invoices in this currency (and customer), the scope of every invoice-based query below. */
  const scope: SQL = sql`${invoices.userId} = ${userId}::uuid and ${invoices.kind} = 'invoice' and ${invoices.currency} = ${currency}
    ${q.customerId ? sql`and ${invoices.customerId} = ${q.customerId}::uuid` : sql``}`;
  const issuedInRange = sql`${invoices.issueDate} between ${day(from)} and ${day(to)}`;
  const markedPaid = sql`(${invoices.status} = 'paid' and ${invoices.amountPaid} = 0)`;
  /** Ledger payments in this currency (and customer), non-voided, dated in the range. */
  const paymentsFrom = sql`from invoice_payments p ${
    q.customerId ? sql`join ${invoices} i on i.id = p.invoice_id and i.user_id = p.user_id and i.customer_id = ${q.customerId}::uuid` : sql``
  }
    where p.user_id = ${userId}::uuid and p.currency = ${currency} and p.voided_at is null and p.paid_on between ${day(from)} and ${day(to)}`;

  const [summaryRows, receivedRows, invoicedByMonth, receivedByMonth, ageingRows, chasingRows] = await Promise.all([
    db.execute(sql`
      select
        coalesce(sum(${invoices.total}) filter (where ${issuedInRange}), 0)::text as invoiced,
        (count(*) filter (where ${issuedInRange}))::int as invoiced_n,
        coalesce(sum(${BALANCE}) filter (where ${OPEN}), 0)::text as outstanding,
        (count(*) filter (where ${OPEN}))::int as outstanding_n,
        coalesce(sum(${BALANCE}) filter (where ${overdueSql(today)}), 0)::text as overdue,
        (count(*) filter (where ${overdueSql(today)}))::int as overdue_n,
        coalesce(sum(${invoices.amountPaid}) filter (where ${issuedInRange} and not ${markedPaid}), 0)::text as cohort_collected,
        coalesce(sum(${invoices.total}) filter (where ${issuedInRange} and not ${markedPaid}), 0)::text as cohort_invoiced,
        (count(*) filter (where ${issuedInRange} and not ${markedPaid}))::int as cohort_n,
        (count(*) filter (where ${issuedInRange} and ${markedPaid}))::int as marked_n,
        coalesce(sum(${invoices.total}) filter (where ${issuedInRange} and ${markedPaid}), 0)::text as marked_total
      from ${invoices} where ${scope}`),
    db.execute(sql`select coalesce(sum(p.amount), 0)::text as amount, count(*)::int as n ${paymentsFrom}`),
    db.execute(sql`
      select to_char(${invoices.issueDate}, 'YYYY-MM') as month, coalesce(sum(${invoices.total}), 0)::text as amount, count(*)::int as n
      from ${invoices} where ${scope} and ${issuedInRange} group by 1`),
    db.execute(sql`select to_char(p.paid_on, 'YYYY-MM') as month, coalesce(sum(p.amount), 0)::text as amount, count(*)::int as n ${paymentsFrom} group by 1`),
    db.execute(sql`
      select b.bucket, coalesce(sum(${BALANCE}), 0)::text as amount, count(*)::int as n
      from ${invoices}
      cross join lateral (select case
          when ${bucketSql('not_due', today)} then 'not_due'
          when ${bucketSql('d1_30', today)} then 'd1_30'
          when ${bucketSql('d31_60', today)} then 'd31_60'
          else 'd60_plus' end as bucket) b
      where ${scope} and ${OPEN}
      group by b.bucket`),
    db.execute(sql`
      select ${invoices.id} as id, ${invoices.number} as number, ${invoices.clientName} as client_name,
             ${invoices.dueDate}::text as due_date, ${BALANCE}::text as balance
      from ${invoices} where ${scope} and ${overdueSql(today)}
      order by ${invoices.dueDate} asc, ${BALANCE} desc, ${invoices.number} asc limit 5`),
  ]);

  const s = rowsOf<Record<string, string | number>>(summaryRows)[0] ?? {};
  const received = rowsOf<{ amount: string; n: number }>(receivedRows)[0] ?? { amount: '0', n: 0 };
  const invoicedMonths = new Map(rowsOf<{ month: string; amount: string; n: number }>(invoicedByMonth).map((r) => [r.month, r]));
  const receivedMonths = new Map(rowsOf<{ month: string; amount: string; n: number }>(receivedByMonth).map((r) => [r.month, r]));
  const buckets = new Map(rowsOf<{ bucket: string; amount: string; n: number }>(ageingRows).map((r) => [r.bucket, r]));

  return {
    currency,
    currencies,
    range: { from, to },
    today,
    summary: {
      invoiced: { amount: money(s.invoiced), count: Number(s.invoiced_n ?? 0) },
      received: { amount: money(received.amount), count: received.n },
      outstanding: { amount: money(s.outstanding), count: Number(s.outstanding_n ?? 0) },
      overdue: { amount: money(s.overdue), count: Number(s.overdue_n ?? 0) },
      collection: {
        percent: collectionRate(cents(s.cohort_collected), cents(s.cohort_invoiced)),
        collected: money(s.cohort_collected),
        invoiced: money(s.cohort_invoiced),
        invoices: Number(s.cohort_n ?? 0),
      },
      markedPaid: { count: Number(s.marked_n ?? 0), total: money(s.marked_total) },
    },
    monthly: monthsBetween(from, to).map((month) => ({
      month,
      invoiced: money(invoicedMonths.get(month)?.amount),
      invoicedCount: invoicedMonths.get(month)?.n ?? 0,
      received: money(receivedMonths.get(month)?.amount),
      receivedCount: receivedMonths.get(month)?.n ?? 0,
    })),
    ageing: AGEING_BUCKETS.map((b) => ({ bucket: b.key, label: b.label, amount: money(buckets.get(b.key)?.amount), count: buckets.get(b.key)?.n ?? 0 })),
    needsChasing: rowsOf<{ id: string; number: string; client_name: string; due_date: string; balance: string }>(chasingRows).map((r) => ({
      id: r.id,
      number: r.number,
      clientName: r.client_name,
      dueDate: r.due_date,
      balance: money(r.balance),
      daysOverdue: daysOverdue(r.due_date, today),
    })),
  };
}
