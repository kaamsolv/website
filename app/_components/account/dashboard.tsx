'use client';

import { useEffect, useState } from 'react';
import { SECONDARY } from './account-shell';
import { RecurCard } from './recur-card';
import { rateText, useFxRates } from '../invoice/fx-line';
import { StatusBadge } from './status-badge';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { FX_NOTE, toInr, type FxRate } from '@/app/lib/invoice/fx';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';

type Totals = { currency: CurrencyCode; billedThisMonth: number; unpaid: number; overdue: number; overdueCount: number };
type Recent = { id: string; number: string; clientName: string; currency: CurrencyCode; total: number; issueDate: string | null; dueDate: string | null; status: 'unpaid' | 'paid'; amountPaid: number };

/** Pro dashboard: billed this month, unpaid, overdue (per currency) and recent invoices. */
export function Dashboard() {
  const [data, setData] = useState<{ today: string; totals: Totals[]; recent: Recent[] } | null>(null);
  const [error, setError] = useState(false);
  const rates = useFxRates();

  useEffect(() => {
    // The visitor's own calendar decides "this month" and "overdue".
    fetch(`/api/dashboard?today=${isoDate(new Date())}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <p role="alert">Couldn’t load your dashboard. Refresh to try again.</p>;
  if (!data) return <div className="h-48 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  if (data.recent.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">Nothing billed yet</p>
        <p className="mt-2 text-muted">Save your first invoice and your totals show up here.</p>
      </div>
    );
  }

  const rows = data.totals.length ? data.totals : [{ currency: 'INR' as CurrencyCode, billedThisMonth: 0, unpaid: 0, overdue: 0, overdueCount: 0 }];
  return (
    <div className="space-y-8">
      <RecurCard />
      {rows.map((t) => {
        const rate: FxRate | undefined = t.currency === 'INR' ? undefined : rates?.[t.currency as 'USD' | 'EUR' | 'GBP' | 'AED'];
        return (
        <div key={t.currency}>
        <section aria-label={`Totals in ${t.currency}`} className="grid gap-4 sm:grid-cols-3">
          <Stat label="Billed this month" value={formatMoney(t.billedThisMonth, t.currency)} />
          <Stat label="Unpaid" value={formatMoney(t.unpaid, t.currency)} />
          <Stat
            label="Overdue"
            value={formatMoney(t.overdue, t.currency)}
            note={t.overdueCount ? `${t.overdueCount} invoice${t.overdueCount === 1 ? '' : 's'} past due` : 'Nothing past due'}
            alert={t.overdueCount > 0}
          />
        </section>
        {rate && (
          <p className="mt-2 text-sm text-muted" data-testid={`fx-${t.currency}`}>
            In rupees, roughly: <span className="font-semibold text-ink">{formatMoney(toInr(t.billedThisMonth, rate), 'INR')}</span> billed ·{' '}
            <span className="font-semibold text-ink">{formatMoney(toInr(t.unpaid, rate), 'INR')}</span> unpaid ·{' '}
            <span className="font-semibold text-ink">{formatMoney(toInr(t.overdue, rate), 'INR')}</span> overdue. {rateText(t.currency, rate)}. {FX_NOTE}
          </p>
        )}
        </div>
        );
      })}

      <section aria-labelledby="recent-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-h" className="font-display text-lg font-bold text-ink">
            Recent invoices
          </h2>
          <a href="/app/invoices" className="text-sm font-semibold underline underline-offset-2">
            All invoices
          </a>
        </div>
        <ul aria-label="Recent invoices" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
          {data.recent.map((inv) => (
            <li key={inv.id}>
              <a href={`/invoice-generator?id=${inv.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{inv.number || 'Untitled'}</span>{' '}
                  <span className="text-strong">{inv.clientName || 'No client'}</span>
                  {inv.issueDate && <span className="block text-sm text-muted">{displayDate(inv.issueDate)}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <StatusBadge status={inv.status} amountPaid={inv.amountPaid} total={inv.total} dueDate={inv.dueDate} today={data.today} />
                  <span className="font-semibold tabular-nums text-ink">{formatMoney(inv.total, inv.currency)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <a href="/invoice-generator" className={SECONDARY}>
          + New invoice
        </a>
        <a href="/app/business/customers" className={SECONDARY}>
          + Add customer
        </a>
        <a href="/app/invoices/collections" className={SECONDARY}>
          Payments &amp; collections
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value, note, alert = false }: { label: string; value: string; note?: string; alert?: boolean }) {
  return (
    <div className="rounded-xl2 border border-hair bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{value}</p>
      {note && <p className={`mt-1 text-sm ${alert ? 'font-semibold text-danger-600' : 'text-muted'}`}>{note}</p>}
    </div>
  );
}
