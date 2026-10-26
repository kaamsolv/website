'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRIMARY, SECONDARY } from './account-shell';
import { CustomerLinkReview } from './customer-link-review';
import { Pager } from './pager';
import { StatCard } from './stat-card';
import { StatusBadge } from './status-badge';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { invoicesHref } from '@/app/lib/invoice/filters';
import { stateName } from '@/app/lib/invoice/india';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';

type Money = { currency: CurrencyCode; count: number; invoiced: number; received: number; outstanding: number; overdue: number; markedPaid: { count: number; total: number } };
type Summary = {
  customer: { id: string; name: string; contactName: string; email: string; phone: string; address: string; stateCode: string; gstin: string };
  money: Money[];
  invoiceCount: number;
  quoteCount: number;
  unlinkedByName: number;
};
type Row = { id: string; number: string; currency: CurrencyCode; total: number; issueDate: string | null; dueDate: string | null; status: 'unpaid' | 'paid'; amountPaid: number; balance?: number };
type History = { invoices: Row[]; matched: number; page: number; pages: number; pageSize: number };

const HISTORY_PAGE = 10;

/**
 * One saved customer: their details, what they've been billed, have paid and still owe (per currency, all time,
 * from the invoices connected to them — never guessed from names), their invoice history, and the typed-in
 * invoices that could be connected. The totals and the history come from the server.
 */
export function CustomerDetail({ id }: { id: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [page, setPage] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Bumped when invoices are connected or disconnected, so the review list is read again. */
  const [version, setVersion] = useState(0);
  const today = isoDate(new Date());

  const loadSummary = useCallback(async () => {
    const res = await fetch(`/api/customers/${encodeURIComponent(id)}/summary?today=${today}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (res?.status === 404) return setProblem('notfound');
    if (!res?.ok) return setProblem('Couldn’t load this customer. Check your connection and refresh.');
    setSummary((await res.json()) as Summary);
    setProblem(null);
  }, [id, today]);

  const loadHistory = useCallback(async () => {
    const q = new URLSearchParams({ customer: id, page: String(page), pageSize: String(HISTORY_PAGE), today });
    const res = await fetch(`/api/invoices?${q}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as History;
    setHistory(body);
    if (body.page !== page) setPage(body.page);
  }, [id, page, today]);

  useEffect(() => void loadSummary(), [loadSummary]);
  useEffect(() => void loadHistory(), [loadHistory]);
  const reload = () => {
    setVersion((v) => v + 1);
    void Promise.all([loadSummary(), loadHistory()]);
  };

  async function disconnect(row: Row) {
    if (!window.confirm(`Disconnect ${row.number} from ${summary?.customer.name}? It keeps what’s printed on it, but won’t count toward this customer any more.`)) return;
    setBusy(row.id);
    const res = await fetch(`/api/customers/${encodeURIComponent(id)}/links`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect', invoiceIds: [row.id] }),
    }).catch(() => null);
    setBusy(null);
    setNotice(res?.ok ? `Disconnected ${row.number}.` : 'That didn’t work. Try again.');
    reload();
  }

  if (problem === 'notfound') {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">That customer isn’t here</p>
        <p className="mt-2 text-muted">It may have been deleted.</p>
        <a href="/app/business/customers" className={`${PRIMARY} mt-5`}>
          All customers
        </a>
      </div>
    );
  }
  if (problem) return <p role="alert" className="text-strong">{problem}</p>;
  if (!summary) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const c = summary.customer;
  const details = [c.contactName, c.email, c.phone, stateName(c.stateCode), c.gstin && `GSTIN ${c.gstin}`].filter(Boolean);
  const link = (currency: CurrencyCode, extra: Parameters<typeof invoicesHref>[0] = {}) => invoicesHref({ customer: c.id, currency, ...extra });

  return (
    <div className="space-y-8">
      <section aria-labelledby="cust-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="cust-h" className="font-display text-2xl font-bold text-ink" data-testid="cust-name">
              {c.name}
            </h2>
            {details.length > 0 && <p className="mt-1 text-strong">{details.join(' · ')}</p>}
            {c.address && <p className="mt-1 whitespace-pre-line text-sm text-muted">{c.address}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/app/business/customers?edit=${c.id}`} className={SECONDARY}>
              Edit customer
            </a>
            <a href="/app/business/customers" className={SECONDARY}>
              All customers
            </a>
          </div>
        </div>
      </section>

      {summary.money.length === 0 ? (
        <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted" data-testid="cust-empty">
          No invoices are connected to {c.name} yet. Pick them on an invoice’s “Bill to”, or connect ones you’ve typed in{summary.unlinkedByName ? ' (listed below)' : ''}.
        </p>
      ) : (
        summary.money.map((m) => {
          const money = (n: number) => formatMoney(n, m.currency);
          return (
            <section key={m.currency} aria-label={`${c.name} in ${m.currency}`} data-testid={`cust-money-${m.currency}`}>
              <h2 className="mb-3 font-display text-lg font-bold text-ink">
                {m.currency} · {m.count} invoice{m.count === 1 ? '' : 's'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Invoiced" basis="All time" value={money(m.invoiced)} href={link(m.currency)} testId={`cust-invoiced-${m.currency}`} />
                <StatCard label="Received" basis="All time" value={money(m.received)} note="From recorded payments." href={m.received > 0 ? link(m.currency, { state: 'partial' }) : undefined} linkLabel="View part-paid" testId={`cust-received-${m.currency}`} />
                <StatCard label="Outstanding" basis="Still owed, as of today" value={money(m.outstanding)} href={m.outstanding > 0 ? link(m.currency, { state: 'outstanding' }) : undefined} testId={`cust-outstanding-${m.currency}`} />
                <StatCard label="Overdue" basis="Past due, as of today" value={money(m.overdue)} alert={m.overdue > 0} href={m.overdue > 0 ? link(m.currency, { state: 'overdue' }) : undefined} testId={`cust-overdue-${m.currency}`} />
              </div>
              {m.markedPaid.count > 0 && (
                <p className="mt-2 text-sm text-muted">
                  {m.markedPaid.count} invoice{m.markedPaid.count === 1 ? '' : 's'} ({money(m.markedPaid.total)}) {m.markedPaid.count === 1 ? 'was' : 'were'} marked paid before payments were recorded — settled, but not counted as received.
                </p>
              )}
            </section>
          );
        })
      )}
      <p className="-mt-4 text-sm text-muted">
        Totals come from the invoices connected to this customer, per currency, and never add one currency to another. Quotations ({summary.quoteCount}) aren’t counted.
      </p>

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-3 font-display text-lg font-bold text-ink">
          Invoices
        </h2>
        {notice && (
          <p role="status" className="mb-3 text-sm font-semibold text-ink">
            {notice}
          </p>
        )}
        {history && history.invoices.length === 0 ? (
          <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted">Nothing to show yet.</p>
        ) : (
          <ul aria-label="Connected invoices" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
            {(history?.invoices ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <a href={`/app/invoices/${r.id}`} className="font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                    {r.number || 'Untitled'}
                  </a>{' '}
                  <span className="text-sm text-muted">{r.issueDate ? displayDate(r.issueDate) : ''}</span>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                    <span className="font-semibold tabular-nums text-ink">{formatMoney(r.total, r.currency)}</span>
                    <StatusBadge status={r.status} amountPaid={r.amountPaid} total={r.total} dueDate={r.dueDate} today={today} />
                    {r.balance !== undefined && r.balance > 0 && <span className="text-muted">{formatMoney(r.balance, r.currency)} outstanding</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <a href={`/app/invoices/${r.id}`} aria-label={`Payments for ${r.number}`} className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                    Payments
                  </a>
                  <button type="button" disabled={busy !== null} onClick={() => void disconnect(r)} aria-label={`Disconnect ${r.number} from ${c.name}`} className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash disabled:opacity-60">
                    {busy === r.id ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {history && history.matched > 0 && (
          <Pager
            page={history.page}
            pages={history.pages}
            pageSize={history.pageSize}
            matched={history.matched}
            hrefFor={(p) => `#page-${p}`}
            onGo={(href, e) => {
              e.preventDefault();
              setPage(Number(href.slice('#page-'.length)));
            }}
            label="Invoice history pages"
          />
        )}
      </section>

      <CustomerLinkReview customerId={c.id} customerName={c.name} onChanged={reload} version={version} />
    </div>
  );
}
