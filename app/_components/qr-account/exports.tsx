'use client';

import { useEffect, useMemo, useState } from 'react';
import { PRIMARY } from '../account/account-shell';
import { downloadBlob } from '@/app/lib/image/export';
import { Segmented } from '../choice';

type Option = { id: string; name: string; campaignId: string | null; campaignName: string | null };

const FIELD =
  'mt-1 block h-11 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/** QR Pro: download your QR codes, or every scan, as a CSV for Excel or Sheets. Only your own rows; no IP or identifier is in the file. */
export function Exports() {
  const [type, setType] = useState<'codes' | 'scans'>('codes');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [campaign, setCampaign] = useState('');
  const [qr, setQr] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/qr', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { qr: Option[] } | null) => b && setOptions(b.qr))
      .catch(() => undefined);
  }, []);

  const campaigns = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) if (o.campaignId && o.campaignName) m.set(o.campaignId, o.campaignName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [options]);

  async function download(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const q = new URLSearchParams({ type, tz, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(campaign ? { campaign } : {}), ...(qr ? { qr } : {}) });
    const res = await fetch(`/api/qr/export?${q}`, { credentials: 'same-origin' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
      return setMessage({ ok: false, text: body?.message ?? 'Couldn’t make the CSV. Try again.' });
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `kaamsolv-qr-${type}.csv`;
    downloadBlob(await res.blob(), name);
    setMessage({ ok: true, text: `Done — ${name} is downloading.` });
  }

  return (
    <form onSubmit={download} className="max-w-2xl space-y-5 rounded-xl2 border border-hair bg-surface p-5 sm:p-6" aria-label="Export">
      <Segmented<'codes' | 'scans'>
        legend="What to export"
        options={[
          { value: 'codes', label: 'QR codes' },
          { value: 'scans', label: 'Every scan' },
        ]}
        value={type}
        onChange={setType}
      />
      <p className="text-sm text-muted">
        {type === 'codes'
          ? 'One row per code: name, short link, where it goes, campaign, status, scans (all time and in your date range), last scan, created.'
          : 'One row per scan: time, code, campaign, country, device type, referring site. People only — bots and link previews are left out — and no IP address or personal identifier.'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink">
          From <span className="font-normal text-muted">(optional)</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
        </label>
        <label className="text-sm font-semibold text-ink">
          To <span className="font-normal text-muted">(optional)</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD} />
        </label>
        <label className="text-sm font-semibold text-ink">
          QR code
          <select value={qr} onChange={(e) => setQr(e.target.value)} className={FIELD}>
            <option value="">All codes</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-ink">
          Campaign
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={FIELD}>
            <option value="">All campaigns</option>
            {campaigns.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">Dates are days in your time zone. A scan export is limited to 50,000 rows — pick a shorter range if it’s refused.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? 'Preparing…' : 'Download CSV'}
        </button>
        {message && (
          <span role={message.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${message.ok ? 'text-ink' : 'text-danger-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
