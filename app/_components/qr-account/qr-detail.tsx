'use client';

import { useCallback, useEffect, useState } from 'react';
import { SECONDARY } from '../account/account-shell';
import { CopyButton } from '../copy-button';
import { ScanChart } from './scan-chart';
import { QrDownload } from '@/app/qr-code-generator/_components/qr-download';
import { QrPreview } from '@/app/qr-code-generator/_components/qr-preview';
import { DEFAULT_EXPORT_OPTIONS, type QrDesign } from '@/app/lib/qr/design';
import { KIND_LABELS, QR_NAME_MAX, type TrackableKind } from '@/app/lib/qr/tracking';
import { refreshMe } from '@/app/lib/me-client';

type Detail = {
  id: string;
  name: string;
  kind: TrackableKind;
  shortUrl: string;
  destination: string;
  status: 'active' | 'disabled';
  scans: number;
  lastScanAt: string | null;
  createdAt: string;
  design: QrDesign;
};

const INPUT =
  'h-11 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/** One tracked QR code: the picture (download it again), the scan count and chart, pause / resume, rename, delete. */
export function QrDetail({ id }: { id: string }) {
  const [qr, setQr] = useState<Detail | null>(null);
  const [days, setDays] = useState<{ day: string; scans: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    // The days are cut in the visitor's own time zone.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const res = await fetch(`/api/qr/${id}?tz=${encodeURIComponent(tz)}`, { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
    if (res?.status === 404) return setError('That QR code isn’t here — it may have been deleted.');
    if (!res?.ok) return setError('Couldn’t load that QR code. Refresh to try again.');
    const body = (await res.json()) as { qr: Detail; days: { day: string; scans: number }[] };
    setQr(body.qr);
    setName(body.qr.name);
    setDays(body.days);
    setError(null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function put(patch: { name?: string; status?: 'active' | 'disabled' }, done: string) {
    setBusy('put');
    setNotice(null);
    const res = await fetch(`/api/qr/${id}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    setBusy(null);
    if (!res?.ok) return setNotice(body?.message ?? 'That didn’t work. Try again.');
    setNotice(done);
    await load();
  }

  async function remove() {
    if (!qr || !window.confirm(`Delete “${qr.name}”? Its scan history goes too, and a printed copy will stop working. This can’t be undone.`)) return;
    setBusy('delete');
    const res = await fetch(`/api/qr/${id}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    if (!res?.ok) {
      setBusy(null);
      return setNotice('That didn’t work. Try again.');
    }
    void refreshMe();
    window.location.assign('/app/qr');
  }

  if (error) {
    return (
      <div>
        <p role="alert" className="text-strong">
          {error}
        </p>
        <p className="mt-4">
          <a href="/app/qr" className={SECONDARY}>
            Back to My QR codes
          </a>
        </p>
      </div>
    );
  }
  if (!qr) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const paused = qr.status === 'disabled';
  const shortText = qr.shortUrl.replace(/^https?:\/\//, '');

  return (
    <div className="space-y-6">
      {notice && (
        <p className="text-sm font-semibold text-ink" role="status">
          {notice}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="scans-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="scans-h" className="text-sm font-semibold text-muted">
                  Scans
                </h2>
                <p className="font-display text-4xl font-extrabold tabular-nums text-ink" data-testid="scan-total">
                  {qr.scans}
                </p>
              </div>
              <p className="text-sm text-muted">
                {qr.lastScanAt ? `Last scan ${new Date(qr.lastScanAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No scans yet'}
              </p>
            </div>
            <div className="mt-4">
              <ScanChart days={days} />
            </div>
            <p className="mt-2 text-xs text-muted">Counts people who scanned, not bots or link previews. It’s scans, not unique visitors.</p>
          </section>

          <section aria-labelledby="where-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
            <h2 id="where-h" className="font-display text-lg font-bold text-ink">
              Where it goes
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted">The QR contains</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="break-all font-semibold text-ink">{shortText}</span>
                  <CopyButton value={qr.shortUrl} label="Copy link" copiedLabel="Copied" />
                </dd>
              </div>
              <div>
                <dt className="text-muted">and sends people to</dt>
                <dd className="mt-1 break-all font-semibold text-ink">{qr.destination}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="manage-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
            <h2 id="manage-h" className="font-display text-lg font-bold text-ink">
              Manage
            </h2>
            <form
              className="mt-3 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && name.trim() !== qr.name) void put({ name }, 'Renamed.');
              }}
            >
              <label className="block min-w-0 flex-1 basis-56 text-sm font-semibold text-ink">
                Name
                <input value={name} maxLength={QR_NAME_MAX} onChange={(e) => setName(e.target.value)} className={`${INPUT} mt-1`} />
              </label>
              <button type="submit" disabled={busy !== null || !name.trim() || name.trim() === qr.name} className={SECONDARY}>
                Rename
              </button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void put(
                    { status: paused ? 'active' : 'disabled' },
                    paused ? 'Resumed. It sends people on again.' : 'Paused. Scanning it shows “link unavailable” until you resume.',
                  )
                }
                className={SECONDARY}
              >
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => void remove()} className={`${SECONDARY} hover:!text-[#B42318] dark:hover:!text-danger-600`}>
                {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
              <span className="text-sm text-muted">
                {paused ? 'Paused — scanning shows “link unavailable”.' : `${KIND_LABELS[qr.kind]} · made ${new Date(qr.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </span>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
          <QrPreview encodedText={qr.shortUrl} design={qr.design} exportPixelSize={512} empty={false} renderError={null} />
          <QrDownload encodedText={qr.shortUrl} design={qr.design} exportOptions={DEFAULT_EXPORT_OPTIONS} disabled={false} />
          <p className="text-xs text-muted">Saved designs don’t keep a logo. The QR itself is the same, so your printed copies still work.</p>
        </div>
      </div>
    </div>
  );
}
