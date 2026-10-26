/**
 * The customer workspace (Stage E): what one saved customer has been billed, has paid and still owes, the
 * invoices that were typed in by their name but never connected to them, and the explicit connect / disconnect
 * of those.
 *
 * Only invoices whose `customer_id` points at the customer count. **Nothing here ever links an invoice by
 * name on its own**: `findUnlinkedByName` merely *lists* invoices whose client name is exactly the customer's
 * (ignoring case and surrounding spaces) so the owner can look and choose; `linkInvoices` connects only the
 * invoices the owner ticked, only if they are the owner's own and not already connected, and changes
 * only `invoices.customer_id` — never the invoice document, its totals or its status. Customers are never merged.
 *
 * The money uses the same SQL fragments as the Payments & Collections page (db/invoice-filters.ts), so a
 * customer's totals equal the filtered list for `customer=<id>` and the dashboard's customer filter.
 *
 * Every query is scoped to `user_id`. Framework-free; takes an explicit `db`.
 */

import { sql } from 'drizzle-orm';
import { CURRENCIES, type CurrencyCode } from '../app/lib/invoice/types.ts';
import { getCustomer, type CustomerRow } from './directory.ts';
import { BALANCE, OPEN, overdueSql } from './invoice-filters.ts';
import type { Db } from './links.ts';
import { invoices } from './schema.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const money = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;
const known = (c: string): c is CurrencyCode => (CURRENCIES as readonly string[]).includes(c);
const inrFirst = (a: { currency: string }, b: { currency: string }) => (a.currency === 'INR' ? -1 : b.currency === 'INR' ? 1 : a.currency.localeCompare(b.currency));

export type CustomerMoney = {
  currency: CurrencyCode;
  /** Invoices (not quotations) connected to this customer, in this currency. */
  count: number;
  invoiced: number;
  /** Received through the payment ledger (a legacy "marked paid" invoice adds 0 and is counted below). */
  received: number;
  outstanding: number;
  overdue: number;
  markedPaid: { count: number; total: number };
};

export type CustomerSummary = {
  customer: CustomerRow;
  /** One block per currency, INR first. Never added together. */
  money: CustomerMoney[];
  invoiceCount: number;
  quoteCount: number;
  /** Invoices or quotations with no connection whose client name equals this customer's name. */
  unlinkedByName: number;
};

/** Lowercased, trimmed name used only to *suggest* candidates — never to connect anything. */
const nameKey = (col: unknown) => sql`lower(btrim(${col}))`;

export async function getCustomerSummary(db: Db, userId: string, customerId: string, today: string): Promise<CustomerSummary | null> {
  const customer = await getCustomer(db, userId, customerId);
  if (!customer) return null;
  const [byCurrency, counts] = await Promise.all([
    db.execute(sql`
      select ${invoices.currency} as currency,
             count(*)::int as n,
             coalesce(sum(${invoices.total}), 0)::text as invoiced,
             coalesce(sum(${invoices.amountPaid}), 0)::text as received,
             coalesce(sum(${BALANCE}) filter (where ${OPEN}), 0)::text as outstanding,
             coalesce(sum(${BALANCE}) filter (where ${overdueSql(today)}), 0)::text as overdue,
             (count(*) filter (where ${invoices.status} = 'paid' and ${invoices.amountPaid} = 0))::int as marked_n,
             coalesce(sum(${invoices.total}) filter (where ${invoices.status} = 'paid' and ${invoices.amountPaid} = 0), 0)::text as marked_total
      from ${invoices}
      where ${invoices.userId} = ${userId}::uuid and ${invoices.customerId} = ${customerId}::uuid and ${invoices.kind} = 'invoice'
      group by ${invoices.currency}`),
    db.execute(sql`
      select (count(*) filter (where ${invoices.customerId} = ${customerId}::uuid and ${invoices.kind} = 'quote'))::int as quotes,
             (count(*) filter (where ${invoices.customerId} is null and btrim(${invoices.clientName}) <> '' and ${nameKey(invoices.clientName)} = ${nameKey(sql`${customer.name}::text`)}))::int as unlinked
      from ${invoices} where ${invoices.userId} = ${userId}::uuid`),
  ]);
  const moneyRows = rowsOf<{ currency: string; n: number; invoiced: string; received: string; outstanding: string; overdue: string; marked_n: number; marked_total: string }>(byCurrency)
    .filter((r) => known(r.currency))
    .sort(inrFirst)
    .map(
      (r): CustomerMoney => ({
        currency: r.currency as CurrencyCode,
        count: r.n,
        invoiced: money(r.invoiced),
        received: money(r.received),
        outstanding: money(r.outstanding),
        overdue: money(r.overdue),
        markedPaid: { count: r.marked_n, total: money(r.marked_total) },
      }),
    );
  const c = rowsOf<{ quotes: number; unlinked: number }>(counts)[0] ?? { quotes: 0, unlinked: 0 };
  return { customer, money: moneyRows, invoiceCount: moneyRows.reduce((n, m) => n + m.count, 0), quoteCount: c.quotes, unlinkedByName: c.unlinked };
}

export type CustomerStat = { invoiceCount: number; money: { currency: CurrencyCode; invoiced: number; outstanding: number; overdue: number }[] };

/** The same figures for a page of customers at once — one grouped query, not one per customer. */
export async function listCustomerStats(db: Db, userId: string, customerIds: string[], today: string): Promise<Record<string, CustomerStat>> {
  if (!customerIds.length) return {};
  const rows = rowsOf<{ customer_id: string; currency: string; n: number; invoiced: string; outstanding: string; overdue: string }>(
    await db.execute(sql`
      select ${invoices.customerId} as customer_id, ${invoices.currency} as currency, count(*)::int as n,
             coalesce(sum(${invoices.total}), 0)::text as invoiced,
             coalesce(sum(${BALANCE}) filter (where ${OPEN}), 0)::text as outstanding,
             coalesce(sum(${BALANCE}) filter (where ${overdueSql(today)}), 0)::text as overdue
      from ${invoices}
      where ${invoices.userId} = ${userId}::uuid and ${invoices.kind} = 'invoice'
        and ${invoices.customerId} in (${sql.join(customerIds.map((i) => sql`${i}::uuid`), sql`, `)})
      group by ${invoices.customerId}, ${invoices.currency}`),
  );
  const out: Record<string, CustomerStat> = {};
  for (const r of rows.sort(inrFirst)) {
    if (!known(r.currency)) continue;
    const s = (out[r.customer_id] ??= { invoiceCount: 0, money: [] });
    s.invoiceCount += r.n;
    s.money.push({ currency: r.currency as CurrencyCode, invoiced: money(r.invoiced), outstanding: money(r.outstanding), overdue: money(r.overdue) });
  }
  return out;
}

export type UnlinkedCandidate = {
  id: string;
  number: string;
  kind: 'invoice' | 'quote';
  clientName: string;
  issueDate: string | null;
  total: number;
  currency: string;
  /** The GSTIN typed on that invoice, if any — shown so a mismatch with the customer's is visible before connecting. */
  clientGstin: string;
};

export const UNLINKED_CAP = 50;

/**
 * Invoices and quotations with **no** customer connection whose client name is exactly this customer's name (any
 * case, ignoring spaces at the ends). A suggestion list for the owner to review — it connects nothing.
 */
export async function findUnlinkedByName(db: Db, userId: string, customerId: string): Promise<{ customer: CustomerRow; candidates: UnlinkedCandidate[]; capped: boolean } | null> {
  const customer = await getCustomer(db, userId, customerId);
  if (!customer) return null;
  if (!customer.name.trim()) return { customer, candidates: [], capped: false };
  const rows = rowsOf<{ id: string; number: string; kind: string; client_name: string; issue_date: string | null; total: string; currency: string; gstin: string | null }>(
    await db.execute(sql`
      select ${invoices.id} as id, ${invoices.number} as number, ${invoices.kind} as kind, ${invoices.clientName} as client_name,
             ${invoices.issueDate}::text as issue_date, ${invoices.total}::text as total, ${invoices.currency} as currency,
             ${invoices.data} -> 'client' ->> 'gstin' as gstin
      from ${invoices}
      where ${invoices.userId} = ${userId}::uuid and ${invoices.customerId} is null
        and ${nameKey(invoices.clientName)} = ${nameKey(sql`${customer.name}::text`)}
      order by ${invoices.issueDate} desc nulls last, ${invoices.number} asc
      limit ${UNLINKED_CAP + 1}`),
  );
  return {
    customer,
    capped: rows.length > UNLINKED_CAP,
    candidates: rows.slice(0, UNLINKED_CAP).map((r) => ({
      id: r.id,
      number: r.number,
      kind: r.kind === 'quote' ? 'quote' : 'invoice',
      clientName: r.client_name,
      issueDate: r.issue_date,
      total: money(r.total),
      currency: r.currency,
      clientGstin: r.gstin ?? '',
    })),
  };
}

/**
 * Connect the given invoices to the customer — only the owner's own, only those not connected to anyone yet, only
 * to the owner's own customer, in one statement. Changes nothing but `customer_id` (not the document, `updated_at`,
 * totals or status). Returns the ids actually connected; the rest were skipped.
 */
export async function linkInvoices(db: Db, userId: string, customerId: string, invoiceIds: string[]): Promise<string[]> {
  if (!invoiceIds.length) return [];
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      update ${invoices} set customer_id = ${customerId}::uuid
      where ${invoices.userId} = ${userId}::uuid and ${invoices.customerId} is null
        and ${invoices.id} in (${sql.join(invoiceIds.map((i) => sql`${i}::uuid`), sql`, `)})
        and exists (select 1 from customers c where c.id = ${customerId}::uuid and c.user_id = ${userId}::uuid)
      returning ${invoices.id} as id`),
  );
  return rows.map((r) => r.id);
}

/** Disconnect invoices from this customer (the owner's own, currently connected to it). They keep their own typed copy of the client. */
export async function unlinkInvoices(db: Db, userId: string, customerId: string, invoiceIds: string[]): Promise<string[]> {
  if (!invoiceIds.length) return [];
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      update ${invoices} set customer_id = null
      where ${invoices.userId} = ${userId}::uuid and ${invoices.customerId} = ${customerId}::uuid
        and ${invoices.id} in (${sql.join(invoiceIds.map((i) => sql`${i}::uuid`), sql`, `)})
      returning ${invoices.id} as id`),
  );
  return rows.map((r) => r.id);
}
