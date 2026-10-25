'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRIMARY, SECONDARY } from '../account/account-shell';
import { KIND_SHORT, fmtDate, plural } from './stats-data';
import { DEFAULT_EXPORT_OPTIONS } from '@/app/lib/qr/design';
import { refreshMe, useEntitlements } from '@/app/lib/me-client';

type Item = {
  id: string;
  name: string;
  kind: keyof typeof KIND_SHORT;
  shortUrl: string;
  destination: string;
  status: 'active' | 'disabled';
  scans: number;
  lastScanAt: string | null;
  createdAt: string;
  campaignId: string | null;
  campaignName: string | null;
};

const PAGE = 25;
const ROW_BTN =
  'inline-flex h-10 items-center justify-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';
const FIELD =
  'h-11 rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

type Sort = 'newest' | 'oldest' | 'scans' | 'recent' | 'name';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'scans', label: 'Most scans' },
  { value: 'recent', label: 'Recently scanned' },
  { value: 'name', label: 'Name A–Z' },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'qr-code';

/**
 * All QR codes: find, sort and manage tracked codes. Everything here works on
 * the one list the server returns (a free account has at most 3 codes, any
 * account at most 2,000), so filtering is instant. Actions never change where a
 * code points: rename, pause and duplicate leave the original link alone.
 */
export function QrList() {
  const { can } = useEntitlements();
  const campaigns = can('qr_campaigns');
  const [list, setList] = useState<Item[] | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const [kind, setKind] = useState<'all' | Item['kind']>('all');
  const [campaign, setCampaign] = useState<'all' | 'none' | string>('all');
  const [created, setCreated] = useState<'all' | '7' | '30' | '90'>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);

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

  const campaignOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of list ?? []) if (i.campaignId && i.campaignName) m.set(i.campaignId, i.campaignName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cutoff = created === 'all' ? 0 : Date.now() - Number(created) * 86_400_000;
    const rows = (list ?? []).filter(
      (i) =>
        (!needle || i.name.toLowerCase().includes(needle) || i.destination.toLowerCase().includes(needle)) &&
        (status === 'all' || i.status === status) &&
        (kind === 'all' || i.kind === kind) &&
        (campaign === 'all' || (campaign === 'none' ? !i.campaignId : i.campaignId === campaign)) &&
        (!cutoff || Date.parse(i.createdAt) >= cutoff),
    );
    const t = (v: string | null) => (v ? Date.parse(v) : 0);
    return rows.sort((a, b) =>
      sort === 'oldest' ? t(a.createdAt) - t(b.createdAt)
      : sort === 'scans' ? b.scans - a.scans || t(b.createdAt) - t(a.createdAt)
      : sort === 'recent' ? t(b.lastScanAt) - t(a.lastScanAt)
      : sort === 'name' ? a.name.localeCompare(b.name)
      : t(b.createdAt) - t(a.createdAt),
    );
  }, [list, q, status, kind, campaign, created, sort]);

  // Filters or sorting changed: back to the first page.
  useEffect(() => setPage(1), [q, status, kind, campaign, created, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * PAGE, current * PAGE);

  async function call(key: string, run: () => Promise<Response | null>, ok: string) {
    if (busy) return; // one action at a time: no double submits
    setBusy(key);
    setNotice(null);
    const res = await run();
    const body = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    setBusy(null);
    if (!res?.ok) return setNotice(body?.message ?? 'That didn’t work. Try again.');
    setNotice(ok);
    await Promise.all([load(), refreshMe()]);
  }

  const json = { 'Content-Type': 'application/json' };
  const toggle = (i: Item) =>
    call(`toggle:${i.id}`, () => fetch(`/api/qr/${i.id}`, { method: 'PUT', credentials: 'same-origin', headers: json, body: JSON.stringify({ status: i.status === 'active' ? 'disabled' : 'active' }) }).catch(() => null),
      i.status === 'active' ? `Paused “${i.name}”. Scanning it shows “link unavailable” until you resume.` : `Resumed “${i.name}”. It sends people on again.`);
  const duplicate = (i: Item) =>
    call(`dup:${i.id}`, () => fetch(`/api/qr/${i.id}/duplicate`, { method: 'POST', credentials: 'same-origin' }).catch(() => null), `Made a copy of “${i.name}”. The original is unchanged.`);
  const remove = (i: Item) => {
    if (!window.confirm(`Delete “${i.name}”? Its scan history goes too, and a printed copy will stop working. This can’t be undone.`)) return;
    return call(`delete:${i.id}`, () => fetch(`/api/qr/${i.id}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null), `Deleted “${i.name}”.`);
  };

  async function download(i: Item) {
    if (busy) return;
    setBusy(`download:${i.id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/qr/${i.id}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('missing');
      const { qr } = (await res.json()) as { qr: { shortUrl: string; design: import('@/app/lib/qr/design').QrDesign } };
      const { exportPngBlob, downloadBlob } = await import('@/app/lib/qr/export');
      downloadBlob(`${slug(i.name)}.png`, await exportPngBlob(qr.shortUrl, qr.design, DEFAULT_EXPORT_OPTIONS));
      setNotice(`Done — “${i.name}” is downloading.`);
    } catch {
      setNotice('Couldn’t make that download. Try again.');
    } finally {
      setBusy(null);
    }
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

  const filtered = q || status !== 'all' || kind !== 'all' || campaign !== 'all' || created !== 'all';
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-56 text-sm font-semibold text-ink">
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or link" className={`${FIELD} mt-1 block w-full`} />
        </label>
        <label className="text-sm font-semibold text-ink">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${FIELD} mt-1 block`}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="disabled">Paused</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-ink">
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${FIELD} mt-1 block`}>
            <option value="all">All types</option>
            {(Object.keys(KIND_SHORT) as Item['kind'][]).map((k) => (
              <option key={k} value={k}>
                {KIND_SHORT[k]}
              </option>
            ))}
          </select>
        </label>
        {campaigns && (
          <label className="text-sm font-semibold text-ink">
            Campaign
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={`${FIELD} mt-1 block`}>
              <option value="all">All</option>
              <option value="none">No campaign</option>
              {campaignOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm font-semibold text-ink">
          Made
          <select value={created} onChange={(e) => setCreated(e.target.value as typeof created)} className={`${FIELD} mt-1 block`}>
            <option value="all">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-ink">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${FIELD} mt-1 block`}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span data-testid="list-count">
          {filtered ? `${shown.length} of ${list.length}` : limit === null ? `${list.length} tracked` : `${list.length} of ${limit} tracked`}
          {filtered && ' shown'}
        </span>
        {notice && (
          <span className="font-semibold text-ink" role="status">
            {notice}
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted">
          Nothing matches.{' '}
          <button
            type="button"
            className="font-semibold text-ink underline underline-offset-2"
            onClick={() => {
              setQ('');
              setStatus('all');
              setKind('all');
              setCampaign('all');
              setCreated('all');
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <ul aria-label="Tracked QR codes" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
          {rows.map((item) => (
            <li key={item.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center md:gap-4">
              <a href={`/app/qr/${item.id}`} className="group min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-ink group-hover:underline">{item.name}</span>
                  <span className="text-sm text-muted">{KIND_SHORT[item.kind]}</span>
                  {item.status === 'disabled' && <span className="rounded-full bg-wash px-2.5 py-0.5 text-xs font-semibold text-strong">Paused</span>}
                  {campaigns && item.campaignName && (
                    <span className="rounded-full border border-hair bg-wash px-2.5 py-0.5 text-xs font-semibold text-strong">{item.campaignName}</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">{item.destination}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                  <span className="tabular-nums font-semibold text-ink">{plural(item.scans, 'scan')}</span>
                  <span>{item.lastScanAt ? `last ${fmtDate(item.lastScanAt)}` : 'no scans yet'}</span>
                  <span>made {fmtDate(item.createdAt)}</span>
                </span>
              </a>
              <div className="-ml-3 flex flex-wrap gap-1 md:ml-0">
                <a href={`/app/qr/${item.id}`} className={ROW_BTN} aria-label={`Open ${item.name}`}>
                  Open
                </a>
                <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => void download(item)} aria-label={`Download ${item.name}`}>
                  {busy === `download:${item.id}` ? 'Preparing…' : 'Download'}
                </button>
                <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => void duplicate(item)} aria-label={`Duplicate ${item.name}`}>
                  {busy === `dup:${item.id}` ? 'Copying…' : 'Duplicate'}
                </button>
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
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
          <button type="button" className={SECONDARY} disabled={current === 1} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <span>
            Page {current} of {pages}
          </span>
          <button type="button" className={SECONDARY} disabled={current === pages} onClick={() => setPage(current + 1)}>
            Next
          </button>
        </nav>
      )}
      <p className="mt-6">
        <a href="/qr-code-generator" className={SECONDARY}>
          + New QR code
        </a>
      </p>
    </div>
  );
}
