'use client';

import { useCallback, useEffect, useState } from 'react';
import { SECONDARY } from '../account/account-shell';
import { CampaignForm, ROW_BTN, type Campaign } from './campaigns';
import { Kpi } from './kpi';
import { RangePicker } from './range-picker';
import { ScanChart } from './scan-chart';
import { KIND_SHORT, fmtDateOnly, plural, useQrStats } from './stats-data';

type Code = { id: string; name: string; campaignId: string | null; campaignName: string | null };

/** One campaign: its totals (each code counted once), chart, codes, and assigning codes in and out. */
export function CampaignDetail({ id }: { id: string }) {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const { data, error, reload } = useQrStats({ range, campaign: id });
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [all, setAll] = useState<Code[]>([]);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, q] = await Promise.all([
      fetch('/api/qr/campaigns', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/qr', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setCampaign(c ? ((c as { campaigns: Campaign[] }).campaigns.find((x) => x.id === id) ?? null) : null);
    setAll(q ? (q as { qr: Code[] }).qr : []);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(qrId: string, campaignId: string | null, done: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/qr/${qrId}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setNotice('That didn’t work. Try again.');
    setNotice(done);
    setPick('');
    await load();
    reload();
  }

  if (campaign === null) {
    return (
      <div>
        <p role="alert" className="text-strong">That campaign isn’t here — it may have been deleted.</p>
        <p className="mt-4">
          <a href="/app/qr/campaigns" className={SECONDARY}>
            Back to campaigns
          </a>
        </p>
      </div>
    );
  }
  if (error) return <p role="alert" className="text-strong">{error}</p>;
  if (!campaign || !data) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const inside = data.codes;
  const addable = all.filter((c) => c.campaignId !== id);

  return (
    <div className="space-y-6">
      {editing ? (
        <CampaignForm
          initial={campaign}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            setNotice('Saved.');
            await load();
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-ink">{campaign.name}</h2>
            {campaign.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{campaign.description}</p>}
            {(campaign.startsOn || campaign.endsOn) && (
              <p className="mt-1 text-sm text-muted">
                {fmtDateOnly(campaign.startsOn) ?? '…'} – {fmtDateOnly(campaign.endsOn) ?? '…'}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setEditing(true)} className={SECONDARY}>
            Edit campaign
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm font-semibold text-ink">
          {notice}
        </p>
      )}

      <section aria-label="Campaign totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="QR codes" value={data.totals.codes} testId="camp-codes" />
        <Kpi label="Scans" value={data.totals.allTime} note="all time" testId="camp-all-time" />
        <Kpi label="Scans this month" value={data.totals.thisMonth} testId="camp-month" />
        <Kpi label={`Last ${range} days`} value={data.totals.inRange} note="scans" testId="camp-range" />
      </section>

      <section aria-labelledby="camp-chart-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="camp-chart-h" className="font-display text-lg font-bold text-ink">
            Scans by day
          </h3>
          <RangePicker value={range} onChange={setRange} allow90={data.can.breakdowns} />
        </div>
        <div className="mt-4">
          <ScanChart days={data.series} />
        </div>
        <p className="mt-2 text-xs text-muted">Each code is counted once. Scans are people who scanned, not unique visitors.</p>
      </section>

      <section aria-labelledby="camp-codes-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <h3 id="camp-codes-h" className="font-display text-lg font-bold text-ink">
          Codes in this campaign
        </h3>
        {inside.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No codes yet. Add one below.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair" data-testid="camp-code-list">
            {[...inside].sort((a, b) => b.inRange - a.inRange || b.allTime - a.allTime).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <a href={`/app/qr/${c.id}`} className="min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                  <span className="block truncate font-semibold text-ink hover:underline">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {KIND_SHORT[c.kind]}
                    {c.status === 'disabled' ? ' · paused' : ''}
                  </span>
                </a>
                <span className="flex items-center gap-3 text-sm">
                  <span className="tabular-nums text-muted">
                    {plural(c.inRange, 'scan')} in {range} days · <span className="font-semibold text-ink">{c.allTime.toLocaleString('en-IN')} all time</span>
                  </span>
                  <button type="button" className={ROW_BTN} disabled={busy} onClick={() => void assign(c.id, null, `Took “${c.name}” out of the campaign.`)} aria-label={`Remove ${c.name} from this campaign`}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const code = all.find((c) => c.id === pick);
            if (code) void assign(code.id, id, `Added “${code.name}”.`);
          }}
        >
          <label className="min-w-0 flex-1 basis-56 text-sm font-semibold text-ink">
            Add a code
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              <option value="">{addable.length ? 'Choose a QR code…' : 'No other codes to add'}</option>
              {addable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.campaignName ? ` (now in ${c.campaignName})` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!pick || busy} className={SECONDARY}>
            Add to campaign
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">A code can be in one campaign at a time; adding it here moves it. Where it sends people never changes.</p>
      </section>
    </div>
  );
}
