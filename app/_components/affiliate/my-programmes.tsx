'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SECONDARY } from '@/app/_components/account/account-shell';
import { Notice } from '@/app/_components/notice';
import { Skeleton } from '@/app/_components/skeleton';
import type { MyLink } from '@/db/affiliate-links';
import type { MyOrders } from '@/db/affiliate-orders';
import type { MyApplication as MyApplicationRow } from '@/db/affiliate-scope';
import { LinkCard } from './link-card';
import { OrdersCard } from './orders-card';

type MyApplication = MyApplicationRow & { link: MyLink | null; orders: MyOrders };
type Filter = 'all' | 'pending' | 'approved' | 'rejected';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Applied' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Not approved' },
];
const STATUS: Record<MyApplication['status'], string> = { pending: 'Waiting for review', approved: 'You’re in', rejected: 'Not approved', withdrawn: 'Withdrawn' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The programmes you've applied to or joined, and where each stands (/app/affiliate/programmes). Only your own. */
export function MyProgrammes({ initial = 'all' }: { initial?: Filter }) {
  const [rows, setRows] = useState<MyApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(initial);

  const load = useCallback(async () => {
    const res = await fetch('/api/affiliate/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('load');
    setRows(((await res.json()) as { applications: MyApplication[] }).applications);
  }, []);
  useEffect(() => {
    load().catch(() => setError('Couldn’t load your programmes. Refresh to try again.'));
  }, [load]);

  async function withdraw(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/affiliate/me/applications/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    setBusy(null);
    if (!res.ok) setError('We couldn’t withdraw that. It may already be decided.');
    await load().catch(() => undefined);
  }

  if (error && rows === null) return <Notice role="alert">{error}</Notice>;
  if (rows === null) return <Skeleton className="h-40" />;
  if (rows.length === 0) return <p className="text-muted">You haven’t applied to any programme yet. When a business shares its affiliate page with you, you’ll apply from there.</p>;

  const countOf = (f: Filter) => (f === 'all' ? rows.length : rows.filter((r) => r.status === f).length);
  const shown = rows.filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="space-y-3">
      {error && <Notice role="alert">{error}</Notice>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter your programmes">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-coral-500 bg-coral-50 text-ink' : 'border-hair bg-surface text-strong'}`}>
            {f.label}
            <span className="ml-1.5 font-normal text-muted" data-testid={`mine-count-${f.key}`}>({countOf(f.key)})</span>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl2 border border-hair bg-surface p-4" data-testid="my-application">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-bold text-ink">{r.programmeName}</p>
                <p className="break-words text-sm text-muted">{r.merchantName} · applied {day(r.createdAt)}</p>
              </div>
              <span className="rounded-full border border-hair px-3 py-1 text-xs font-bold text-strong" data-testid="my-application-status">
                {r.membership === 'suspended' ? 'Paused by the merchant' : STATUS[r.status]}
              </span>
            </div>
            {r.decisionNote && <p className="mt-2 whitespace-pre-line break-words text-sm text-strong">“{r.decisionNote}”</p>}
            {r.membership === 'suspended' && (
              <p className="mt-2 whitespace-pre-line break-words text-sm text-strong" data-testid="my-application-paused">
                {r.merchantName} has paused your place in this programme.{r.suspendNote ? ` Their reason: “${r.suspendNote}”` : ''}
              </p>
            )}
            {r.status === 'approved' && r.link && <LinkCard link={r.link} businessName={r.merchantName} />}
            {r.status === 'approved' && <OrdersCard orders={r.orders} businessName={r.merchantName} />}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {r.status === 'pending' && (
                <button type="button" className={SECONDARY} disabled={busy === r.id} onClick={() => withdraw(r.id)}>
                  Withdraw
                </button>
              )}
              <Link href={`/affiliate/${r.slug}`} className="text-sm font-semibold underline">
                View their page
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
