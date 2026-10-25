'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRIMARY, SECONDARY } from '../account/account-shell';
import { KIND_LABELS, type TrackableKind } from '@/app/lib/qr/tracking';
import { refreshMe } from '@/app/lib/me-client';

type Item = {
  id: string;
  name: string;
  kind: TrackableKind;
  shortUrl: string;
  destination: string;
  status: 'active' | 'disabled';
  scans: number;
  lastScanAt: string | null;
  createdAt: string;
};

const ROW_BTN =
  'inline-flex h-10 items-center justify-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

/** My QR codes: the tracked codes, how many scans each has, and how many you may keep. */
export function QrList() {
  const [list, setList] = useState<Item[] | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/qr', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
    if (!res?.ok) return setError('Couldn’t load your QR codes. Refresh to try again.');
    const body = (await res.json()) as { qr: Item[]; limit: number | null };
    setList(body.qr);
    setLimit(body.limit);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: Item) {
    const next = item.status === 'active' ? 'disabled' : 'active';
    setBusy(`toggle:${item.id}`);
    setNotice(null);
    const res = await fetch(`/api/qr/${item.id}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setNotice('That didn’t work. Try again.');
    setList((l) => (l ? l.map((x) => (x.id === item.id ? { ...x, status: next } : x)) : l));
    setNotice(next === 'disabled' ? `Paused “${item.name}”. Scanning it shows “link unavailable” until you resume.` : `Resumed “${item.name}”. It sends people on again.`);
  }

  async function remove(item: Item) {
    if (!window.confirm(`Delete “${item.name}”? Its scan history goes too, and a printed copy will stop working. This can’t be undone.`)) return;
    setBusy(`delete:${item.id}`);
    setNotice(null);
    const res = await fetch(`/api/qr/${item.id}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setNotice('That didn’t work. Try again.');
    setNotice(`Deleted “${item.name}”.`);
    await Promise.all([load(), refreshMe()]);
  }

  if (error) return <p role="alert" className="text-strong">{error}</p>;
  if (!list) return <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  if (list.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">No tracked QR codes yet</p>
        <p className="mt-2 text-muted">Make a QR for a link, press “Save tracked QR”, and its scans are counted here.</p>
        <a href="/qr-code-generator" className={`${PRIMARY} mt-5`}>
          Make a QR code
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{limit === null ? `${list.length} tracked` : `${list.length} of ${limit} tracked`}</span>
        {notice && (
          <span className="font-semibold text-ink" role="status">
            {notice}
          </span>
        )}
      </div>
      <ul aria-label="Tracked QR codes" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
        {list.map((item) => (
          <li key={item.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center md:gap-4">
            <a href={`/app/qr/${item.id}`} className="group min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-semibold text-ink group-hover:underline">{item.name}</span>
                <span className="text-sm text-muted">{KIND_LABELS[item.kind]}</span>
                {item.status === 'disabled' && (
                  <span className="rounded-full bg-wash px-2.5 py-0.5 text-xs font-semibold text-strong">Paused</span>
                )}
              </span>
              <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                <span className="tabular-nums font-semibold text-ink">
                  {item.scans} scan{item.scans === 1 ? '' : 's'}
                </span>
                {item.lastScanAt ? <span>last {when(item.lastScanAt)}</span> : <span>no scans yet</span>}
                <span className="truncate">{item.shortUrl.replace(/^https?:\/\//, '')}</span>
              </span>
            </a>
            <div className="-ml-3 flex flex-wrap gap-1 md:ml-0">
              <a href={`/app/qr/${item.id}`} className={ROW_BTN} aria-label={`Open ${item.name}`}>
                Open
              </a>
              <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => void toggle(item)} aria-label={`${item.status === 'active' ? 'Pause' : 'Resume'} ${item.name}`}>
                {item.status === 'active' ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                className={`${ROW_BTN} hover:text-[#B42318] dark:hover:text-danger-600`}
                disabled={busy !== null}
                onClick={() => void remove(item)}
                aria-label={`Delete ${item.name}`}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6">
        <a href="/qr-code-generator" className={SECONDARY}>
          + New QR code
        </a>
      </p>
    </div>
  );
}
