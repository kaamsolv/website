'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { AgeingRows, MonthlyChart } from './collections-charts';
import { StatCard } from './stat-card';
import { Segmented } from '../choice';
import {
  PRESET_LABELS,
  RANGE_PRESETS,
  financialYearLabel,
  resolvePreset,
  validateRange,
  type RangePreset,
} from '@/app/lib/invoice/collections';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { invoicesHref } from '@/app/lib/invoice/filters';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import type { Collections as Data } from '@/db/collections';

type Customer = { id: string; name: string };

/**
 * Invoices → Payments & collections (Pro). Every number comes from the server (`/api/invoices/collections`),
 * worked out from the payment ledger; this page only lays them out. One currency at a time — amounts in
 * different currencies are never added or converted. Cards and chart elements link to the exact invoices
 * behind them.
 */
export function Collections() {
  const [today] = useState(() => isoDate(new Date()));
  const [preset, setPreset] = useState<RangePreset>('fy');
  const [customFrom, setCustomFrom] = useState(() => resolvePreset('fy', isoDate(new Date())).from);
  const [customTo, setCustomTo] = useState(() => isoDate(new Date()));
  const [chosenCurrency, setChosenCurrency] = useState<CurrencyCode | null>(null);
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const range = useMemo(() => (preset === 'custom' ? { from: customFrom, to: customTo } : resolvePreset(preset, today)), [preset, customFrom, customTo, today]);
  const rangeCheck = useMemo(() => validateRange(range.from, range.to), [range]);

  useEffect(() => {
    fetch('/api/customers', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { rows?: Customer[] } | null) => setCustomers(b?.rows ?? []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    if (!rangeCheck.ok) {
      setLoading(false);
      return;
    }
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setLoading(true);
    const q = new URLSearchParams({ from: range.from, to: range.to, today });
    if (chosenCurrency) q.set('currency', chosenCurrency);
    if (customer) q.set('customer', customer);
    fetch(`/api/invoices/collections?${q}`, { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as Data & { message?: string };
        if (!r.ok) throw new Error(body.message ?? 'Couldn’t load this page.');
        return body;
      })
      .then((body) => {
        setData(body);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error && e.message ? e.message : 'Couldn’t load this page. Check your connection and try again.');
        setLoading(false);
      });
  }, [range, rangeCheck.ok, chosenCurrency, customer, today]);

  useEffect(() => {
    load();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, attempt]);

  if (error && !data) {
    return (
      <div role="alert" className="rounded-xl2 border border-hair bg-surface p-6">
        <p className="font-semibold text-ink">{error}</p>
        <button type="button" className={`${SECONDARY} mt-3`} onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  if (data.currencies.length === 0 && !customer) {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">Nothing to measure yet</p>
        <p className="mt-2 text-muted">Save an invoice, record what you’re paid, and your collections show up here.</p>
        <a href="/invoice-generator" className={`${PRIMARY} mt-5`}>
          Make an invoice
        </a>
      </div>
    );
  }

  const currency = data.currency;
  const s = data.summary;
  const money = (n: number) => formatMoney(n, currency);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const link = (f: Parameters<typeof invoicesHref>[0]) => invoicesHref({ currency, ...(customer ? { customer } : {}), ...f });
  const issued = { issuedFrom: data.range.from, issuedTo: data.range.to };
  const periodText = `${displayDate(data.range.from)} – ${displayDate(data.range.to)}`;
  const nothingInPeriod = s.invoiced.count === 0 && s.received.count === 0;

  return (
    <div className="space-y-8" aria-busy={loading}>
      {/* Filters */}
      <section aria-label="Filters" className="flex flex-wrap items-end gap-4">
        <div className="text-sm font-semibold text-ink">
          <label htmlFor="col-period">Period</label>
          <select
            id="col-period"
            value={preset}
            onChange={(e) => setPreset(e.target.value as RangePreset)}
            className={`${INPUT} mt-1 block h-11 w-auto min-w-[14rem] text-sm`}
          >
            {RANGE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        {preset === 'custom' && (
          <>
            <div className="text-sm font-semibold text-ink">
              <label htmlFor="col-from">From</label>
              <input id="col-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto text-sm`} />
            </div>
            <div className="text-sm font-semibold text-ink">
              <label htmlFor="col-to">To</label>
              <input id="col-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto text-sm`} />
            </div>
          </>
        )}
        {data.currencies.length > 1 && (
          <Segmented<CurrencyCode>
            legend="Currency"
            options={data.currencies.map((c) => ({ value: c.code, label: c.code }))}
            value={currency}
            onChange={setChosenCurrency}
          />
        )}
        {customers.length > 0 && (
          <div className="text-sm font-semibold text-ink">
            <label htmlFor="col-customer">Customer</label>
            <select id="col-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto min-w-[12rem] text-sm`}>
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>
      {!rangeCheck.ok && (
        <p role="alert" className="font-semibold text-danger-600">
          {rangeCheck.message}
        </p>
      )}
      {error && (
        <p role="alert" className="font-semibold text-danger-600">
          {error}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <p className="-mt-4 text-sm text-muted" data-testid="col-basis">
        {preset === 'fy' || preset === 'fy-1' ? `Financial year ${financialYearLabel(data.range.from)} · ` : ''}
        {periodText} · amounts in {currency}
        {data.currencies.length > 1 ? ' — each currency is shown on its own and never added to another' : ''}.
        {customer ? ' Showing one saved customer’s invoices only.' : ''}
      </p>

      {/* The five figures */}
      <section aria-label={`Totals in ${currency}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Invoiced"
          basis="Issued in this period"
          value={money(s.invoiced.amount)}
          note={`${plural(s.invoiced.count, 'invoice')} issued. Invoice value, not money received.`}
          href={s.invoiced.count ? link(issued) : undefined}
          testId="col-invoiced"
        />
        <StatCard
          label="Received"
          basis="Cash that arrived in this period"
          value={money(s.received.amount)}
          note={`${plural(s.received.count, 'payment')}, on any invoice — including ones issued earlier.`}
          href={s.received.count ? link({ paidFrom: data.range.from, paidTo: data.range.to }) : undefined}
          testId="col-received"
        />
        <StatCard
          label="Outstanding"
          basis="Still owed, as of today"
          value={money(s.outstanding.amount)}
          note={`${plural(s.outstanding.count, 'invoice')} with a balance. Not limited to this period.`}
          href={s.outstanding.count ? link({ state: 'outstanding' }) : undefined}
          testId="col-outstanding"
        />
        <StatCard
          label="Overdue"
          basis="Past the due date, as of today"
          value={money(s.overdue.amount)}
          note={s.overdue.count ? `${plural(s.overdue.count, 'invoice')} past due.` : 'Nothing past due.'}
          href={s.overdue.count ? link({ state: 'overdue' }) : undefined}
          alert={s.overdue.count > 0}
          testId="col-overdue"
        />
        <StatCard
          label="Collection rate (invoices issued in this period)"
          basis="Invoice cohort"
          value={s.collection.percent === null ? '—' : `${s.collection.percent}%`}
          note={
            s.collection.percent === null
              ? 'No invoices issued in this period to measure.'
              : `${money(s.collection.collected)} collected so far, to any date, of ${money(s.collection.invoiced)} on the ${plural(s.collection.invoices, 'invoice')} issued in this period.`
          }
          href={s.collection.invoices ? link(issued) : undefined}
          testId="col-rate"
        />
      </section>
      <p className="-mt-4 text-sm text-muted" data-testid="col-explain">
        <strong className="font-semibold text-strong">Received</strong> is cash that arrived in the period, whichever invoice it was for.{' '}
        <strong className="font-semibold text-strong">Collection rate</strong> follows the invoices <em>issued</em> in the period and shows how much of them has been
        collected so far. They answer different questions, so they won’t match.
      </p>
      {s.markedPaid.count > 0 && (
        <p className="rounded-lg border border-hair bg-wash p-3 text-sm text-strong" data-testid="col-marked">
          {plural(s.markedPaid.count, 'invoice')} ({money(s.markedPaid.total)}) issued in this period {s.markedPaid.count === 1 ? 'was' : 'were'} marked paid before payments were recorded, so{' '}
          {s.markedPaid.count === 1 ? 'it isn’t' : 'they aren’t'} counted as received or in the collection rate.{' '}
          <a href={link({ ...issued, state: 'marked_paid' })} className="font-semibold underline underline-offset-2">
            See {s.markedPaid.count === 1 ? 'it' : 'them'}
          </a>
          .
        </p>
      )}

      {/* Monthly */}
      <section aria-labelledby="monthly-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <h2 id="monthly-h" className="font-display text-lg font-bold text-ink">
          Invoiced vs received, by month
        </h2>
        <p className="mt-1 text-sm text-muted">
          <strong className="font-semibold text-strong">Invoiced</strong> is the value of invoices issued that month; <strong className="font-semibold text-strong">received</strong> is
          cash that arrived that month. They can come from different invoices, so a month needn’t balance.
        </p>
        <div className="mt-4">
          {nothingInPeriod ? (
            <p className="rounded-lg border border-dashed border-hair p-6 text-center text-muted" data-testid="col-empty-period">
              No invoices issued and no payments received in this period.
            </p>
          ) : (
            <>
              {s.received.count === 0 && (
                <p className="mb-3 text-sm font-semibold text-strong" data-testid="col-no-payments">
                  Nothing received in this period yet.
                </p>
              )}
              <MonthlyChart months={data.monthly} currency={currency} />
            </>
          )}
        </div>
      </section>

      {/* Ageing */}
      <section aria-labelledby="ageing-h">
        <h2 id="ageing-h" className="font-display text-lg font-bold text-ink">
          Outstanding by age
        </h2>
        <p className="mb-3 mt-1 text-sm text-muted">What’s still owed today, by how long it has been past due. It’s a position as of today, so the period above doesn’t change it.</p>
        {s.outstanding.count === 0 ? (
          <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted" data-testid="col-sorted">
            Nothing outstanding. Sorted.
          </p>
        ) : (
          <AgeingRows buckets={data.ageing} currency={currency} today={data.today} />
        )}
      </section>

      {/* Needs chasing */}
      <section aria-labelledby="chase-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="chase-h" className="font-display text-lg font-bold text-ink">
            Needs chasing
          </h2>
          {s.overdue.count > 5 && (
            <a href={link({ state: 'overdue' })} className="text-sm font-semibold underline underline-offset-2">
              All {s.overdue.count} overdue
            </a>
          )}
        </div>
        {data.needsChasing.length === 0 ? (
          <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted">Nothing overdue.</p>
        ) : (
          <ul aria-label="Invoices longest past due" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
            {data.needsChasing.map((r) => (
              <li key={r.id}>
                <a
                  href={`/app/invoices/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4 hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coral-500"
                  aria-label={`${r.number || 'Untitled'}, ${r.clientName || 'no client'}, ${money(r.balance)} owed, ${r.daysOverdue} days overdue. Open payments.`}
                >
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{r.number || 'Untitled'}</span> <span className="text-strong">{r.clientName || 'No client'}</span>
                    <span className="block text-sm text-danger-600">
                      Due {displayDate(r.dueDate)} · {plural(r.daysOverdue, 'day')} overdue
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-ink">{money(r.balance)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-muted">
        Figures come from the payments you’ve recorded. Quotations aren’t counted, and amounts in different currencies are never combined.{' '}
        <a href="/app/invoices/overview" className="font-semibold underline underline-offset-2">
          Back to the Overview
        </a>
        .
      </p>
    </div>
  );
}
