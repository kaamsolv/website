'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from '@/app/_components/account/account-shell';
import { Notice } from '@/app/_components/notice';
import { Skeleton } from '@/app/_components/skeleton';
import { AFFILIATE_LIMITS, categoryLabel, channelLabel, type ApplicationStatus } from '@/app/lib/affiliate/application';
import { ShareLinks } from './share-links';

type Row = {
  id: string;
  status: ApplicationStatus;
  message: string;
  decisionNote: string;
  createdAt: string;
  decidedAt: string | null;
  displayName: string;
  website: string;
  email: string;
  category: string;
  channel: string;
  country: string;
  membership: 'active' | 'suspended' | null;
  suspendNote: string;
};
type Door = { status: 'open' | 'closed' | null; pending: number; slug: string };

const FILTERS: { key: ApplicationStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'To review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Not approved' },
  { key: 'all', label: 'All' },
];
const WORD: Record<ApplicationStatus, string> = { pending: 'To review', approved: 'Approved', rejected: 'Not approved', withdrawn: 'Withdrawn' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Open or close registration, and review who has applied (/app/affiliate/applications). Manual approval only. */
export function ApplicationsPanel({ initialFilter = 'pending' }: { initialFilter?: ApplicationStatus | 'all' }) {
  const [door, setDoor] = useState<Door | null | 'none'>(null);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>(initialFilter);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<ApplicationStatus, number> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The optional reason typed on each card, and which approved card has its "suspend" box open.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [suspending, setSuspending] = useState<string | null>(null);

  const loadDoor = useCallback(async () => {
    const res = await fetch('/api/affiliate/programme', { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 404) return setDoor('none');
    const b = (await res.json()) as Door;
    setDoor({ status: b.status, pending: b.pending, slug: b.slug });
  }, []);
  const loadRows = useCallback(async (f: ApplicationStatus | 'all') => {
    const res = await fetch(`/api/affiliate/applications${f === 'all' ? '' : `?status=${f}`}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return setRows([]);
    const b = (await res.json()) as { applications: Row[]; counts: Record<ApplicationStatus, number> };
    setRows(b.applications);
    setCounts(b.counts);
  }, []);

  useEffect(() => {
    loadDoor().catch(() => setError('Couldn’t load your programme. Refresh to try again.'));
  }, [loadDoor]);
  useEffect(() => {
    setRows(null);
    loadRows(filter).catch(() => setRows([]));
  }, [filter, loadRows]);

  async function toggle(next: 'open' | 'closed') {
    setBusy('door');
    setError(null);
    const res = await fetch('/api/affiliate/programme', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }) });
    setBusy(null);
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { message?: string }).message ?? 'We couldn’t save that.');
    await loadDoor();
  }

  async function decide(id: string, decision: 'approved' | 'rejected' | 'suspended' | 'reinstated') {
    setBusy(id);
    setError(null);
    const note = decision === 'reinstated' ? '' : (notes[id] ?? '').trim();
    const res = await fetch(`/api/affiliate/applications/${id}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, note }) });
    setBusy(null);
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { message?: string }).message ?? 'We couldn’t save that.');
    else {
      setSuspending(null);
      setNotes((n) => ({ ...n, [id]: '' }));
    }
    await Promise.all([loadDoor(), loadRows(filter)]);
  }

  if (door === null) return error ? <Notice role="alert">{error}</Notice> : <Skeleton className="h-64" />;
  if (door === 'none') {
    return (
      <Notice tone="info" role="status">
        Set up your portal first, then come back here to open registration.{' '}
        <Link href="/app/affiliate/portal" className="font-bold underline">
          Set up my portal
        </Link>
      </Notice>
    );
  }

  const open = door.status === 'open';
  return (
    <div className="space-y-6">
      <section aria-labelledby="door-title" className="rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
        <h2 id="door-title" className="font-display text-lg font-extrabold text-ink">
          Registration is {open ? 'open' : 'closed'}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {open ? 'People can apply from your portal. Nobody joins until you approve them.' : 'Your portal says applications are closed. Open it when you’re ready for people to apply.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={open ? SECONDARY : PRIMARY} disabled={busy === 'door'} onClick={() => toggle(open ? 'closed' : 'open')}>
            {open ? 'Close registration' : 'Open registration'}
          </button>
          <Link href={`/affiliate/${door.slug}`} target="_blank" className="text-sm font-semibold underline">
            View my portal
          </Link>
        </div>
        <div className="mt-4 border-t border-hair pt-4">
          <ShareLinks slug={door.slug} />
        </div>
      </section>

      {error && <Notice role="alert">{error}</Notice>}

      <section aria-labelledby="apps-title">
        <h2 id="apps-title" className="font-display text-lg font-extrabold text-ink">
          Applications {door.pending > 0 && <span className="ml-1 rounded-full bg-yellowx-100 px-2 py-0.5 text-sm text-strong">{door.pending} to review</span>}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter applications">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-coral-500 bg-coral-50 text-ink' : 'border-hair bg-surface text-strong'}`}>
              {f.label}
              {counts && (
                <span className="ml-1.5 font-normal text-muted" data-testid={`count-${f.key}`}>
                  ({f.key === 'all' ? counts.pending + counts.approved + counts.rejected + counts.withdrawn : counts[f.key]})
                </span>
              )}
            </button>
          ))}
        </div>

        {rows === null ? (
          <Skeleton className="mt-4 h-32" />
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{filter === 'pending' ? 'Nothing to review. Sorted.' : 'Nothing here yet.'}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl2 border border-hair bg-surface p-4" data-testid="application">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-bold text-ink">{r.displayName || 'No name'}</p>
                    <p className="break-all text-sm text-muted">{r.email}</p>
                    {r.website && <p className="break-all text-sm text-muted">{r.website}</p>}
                  </div>
                  <span className="rounded-full border border-hair px-3 py-1 text-xs font-bold text-strong" data-testid="application-status">
                    {r.membership === 'suspended' ? 'Suspended' : WORD[r.status]}
                  </span>
                </div>
                {(r.category || r.channel || r.country) && (
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" data-testid="application-answers">
                    {r.category && (
                      <div>
                        <dt className="inline text-muted">Is: </dt>
                        <dd className="inline font-medium text-ink">{categoryLabel(r.category)}</dd>
                      </div>
                    )}
                    {r.channel && (
                      <div>
                        <dt className="inline text-muted">Shares on: </dt>
                        <dd className="inline font-medium text-ink">{channelLabel(r.channel)}</dd>
                      </div>
                    )}
                    {r.country && (
                      <div>
                        <dt className="inline text-muted">Country: </dt>
                        <dd className="inline font-medium text-ink break-words">{r.country}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {r.message && <p className="mt-2 whitespace-pre-line break-words text-sm text-strong">{r.message}</p>}
                <p className="mt-2 text-xs text-muted">Applied {day(r.createdAt)}</p>
                {r.decisionNote && <p className="mt-2 break-words text-sm text-muted">Your note: “{r.decisionNote}”</p>}
                {r.membership === 'suspended' && r.suspendNote && <p className="mt-1 break-words text-sm text-muted">Reason for pausing: “{r.suspendNote}”</p>}

                {r.status === 'pending' && (
                  <div className="mt-3">
                    <label htmlFor={`note-${r.id}`} className="block text-sm font-bold text-ink">
                      Reason or note <span className="font-normal text-muted">(optional, the applicant sees it)</span>
                    </label>
                    <textarea id={`note-${r.id}`} rows={2} maxLength={AFFILIATE_LIMITS.note} className={`${INPUT} mt-1`} value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={PRIMARY} disabled={busy === r.id} onClick={() => decide(r.id, 'approved')}>
                        Approve
                      </button>
                      <button type="button" className={SECONDARY} disabled={busy === r.id} onClick={() => decide(r.id, 'rejected')}>
                        Don’t approve
                      </button>
                    </div>
                  </div>
                )}

                {r.status === 'approved' && r.membership === 'active' && (
                  <div className="mt-3">
                    {suspending === r.id ? (
                      <>
                        <label htmlFor={`note-${r.id}`} className="block text-sm font-bold text-ink">
                          Reason <span className="font-normal text-muted">(optional, the affiliate sees it)</span>
                        </label>
                        <textarea id={`note-${r.id}`} rows={2} maxLength={AFFILIATE_LIMITS.note} className={`${INPUT} mt-1`} value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" className={PRIMARY} disabled={busy === r.id} onClick={() => decide(r.id, 'suspended')}>
                            Suspend affiliate
                          </button>
                          <button type="button" className={SECONDARY} onClick={() => setSuspending(null)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <button type="button" className={SECONDARY} onClick={() => setSuspending(r.id)}>
                        Suspend…
                      </button>
                    )}
                  </div>
                )}

                {r.status === 'approved' && r.membership === 'suspended' && (
                  <div className="mt-3">
                    <button type="button" className={PRIMARY} disabled={busy === r.id} onClick={() => decide(r.id, 'reinstated')}>
                      Reinstate
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
