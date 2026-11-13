'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ACCESS_VIEWS, VIEW_LABELS, type AccessView } from '@/app/lib/invoice/accountant-access';
import { Skeleton } from '@/app/_components/skeleton';

type Meta = { businessName: string; today: string; lastMonth: { period: string; label: string }; currencies: string[]; can: string[] };
type Table = { columns: string[]; rows: string[][]; matched: number; page: number; pages: number };

const FIELD = 'h-11 rounded-xl border border-hair bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const BTN = 'inline-flex h-11 items-center justify-center rounded-full border border-hair bg-surface px-4 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

/** Months from the current one back 24, as { value: "2026-10", label: "October 2026" }. */
function months(today: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let i = 0; i < 24; i++) {
    const value = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ value, label: new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** A client's books, read-only: invoices, payments and customers by month, and the monthly pack. No form here changes anything. */
export function ClientBooks({ ownerId }: { ownerId: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [view, setView] = useState<AccessView>('register');
  const [period, setPeriod] = useState('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const [table, setTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/accountant-access/data?owner=${ownerId}&view=meta`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as Meta & { message?: string };
        if (!r.ok) return setProblem(b.message ?? 'We couldn’t open these books.');
        setMeta(b);
        setPeriod(b.lastMonth.period);
        setCurrency(b.currencies[0] ?? 'INR');
      })
      .catch(() => setProblem('We couldn’t open these books. Check your connection and try again.'));
  }, [ownerId]);

  const load = useCallback(async () => {
    if (!meta) return;
    setLoading(true);
    setProblem(null);
    const q = new URLSearchParams({ owner: ownerId, view, page: String(page) });
    if (view !== 'customers') {
      q.set('period', period);
      q.set('currency', currency);
    }
    const r = await fetch(`/api/accountant-access/data?${q}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    const b = (await r?.json().catch(() => null)) as (Table & { message?: string }) | null;
    setLoading(false);
    if (r?.ok && b) setTable(b);
    else {
      setTable(null);
      setProblem(b?.message ?? 'We couldn’t load that. Try again in a moment.');
    }
  }, [meta, ownerId, view, page, period, currency]);
  useEffect(() => {
    void load();
  }, [load]);

  if (problem && !meta) {
    return (
      <main id="main" className="kk-container py-10">
        <p role="alert" className="text-danger-600" data-testid="books-problem">{problem}</p>
        <Link href="/accountant/clients" className="mt-3 inline-block font-semibold underline">Back to your clients</Link>
      </main>
    );
  }
  if (!meta) return <main id="main" className="kk-container py-10"><Skeleton className="h-40" /></main>;

  return (
    <main id="main" className="kk-container py-10" data-testid="client-books">
      <p className="text-sm"><Link href="/accountant/clients" className="font-semibold underline">All clients</Link></p>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink">{meta.businessName || 'Client'}</h1>
      <p className="mt-1 text-sm text-muted">Read-only. {meta.can[0]} You can’t change anything here.</p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="What to look at" className="flex gap-2">
          {ACCESS_VIEWS.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); setPage(1); }} className={`${BTN} ${view === v ? '!bg-navy-900 !text-white' : ''}`} data-testid={`tab-${v}`}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {view !== 'customers' && (
          <>
            <label className="text-sm font-semibold text-ink">
              Month
              <select className={`${FIELD} mt-1 block`} value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }}>
                {months(meta.today).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            {meta.currencies.length > 1 && (
              <label className="text-sm font-semibold text-ink">
                Currency
                <select className={`${FIELD} mt-1 block`} value={currency} onChange={(e) => { setCurrency(e.target.value); setPage(1); }}>
                  {meta.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        <a className={`${BTN} sm:ml-auto`} href={`/api/accountant-access/pack?owner=${ownerId}&period=${meta.lastMonth.period}`} data-testid="download-pack">Download {meta.lastMonth.label} pack</a>
      </div>

      {problem && <p role="alert" className="mt-4 text-sm text-danger-600" data-testid="books-problem">{problem}</p>}
      <div className="mt-4" aria-busy={loading}>
        {table && (
          table.rows.length === 0 ? (
            <p className="rounded-xl2 border border-dashed border-hair p-6 text-strong" data-testid="books-empty">Nothing here for that choice.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted" data-testid="books-count">{table.matched} {table.matched === 1 ? 'row' : 'rows'} · page {table.page} of {table.pages}</p>
              <div className="overflow-x-auto rounded-xl2 border border-hair">
                <table className="w-full min-w-max text-left text-sm" data-testid="books-table">
                  <caption className="sr-only">{VIEW_LABELS[view]}</caption>
                  <thead className="bg-wash text-xs text-muted">
                    <tr>{table.columns.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {table.rows.map((r, i) => (
                      <tr key={i}>{r.map((cell, j) => <td key={j} className="whitespace-nowrap px-3 py-2 text-strong">{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.pages > 1 && (
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" className={BTN} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <button type="button" className={BTN} disabled={page >= table.pages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              )}
            </>
          )
        )}
      </div>
    </main>
  );
}
