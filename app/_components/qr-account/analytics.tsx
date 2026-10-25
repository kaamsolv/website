'use client';

import { useEffect, useMemo, useState } from 'react';
import { Kpi } from './kpi';
import { RangePicker } from './range-picker';
import { ScanChart } from './scan-chart';
import { KIND_SHORT, fmtDate, plural, useQrStats, type Breakdown } from './stats-data';

type Option = { id: string; name: string; campaignId: string | null; campaignName: string | null };

const FIELD =
  'mt-1 block h-11 rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/**
 * Scan analytics. Free accounts get the total, the trend (7 / 30 days), scans by
 * code and last scans. With `qr_breakdowns` it also shows country, device and
 * referring site and the 90-day range; with `qr_campaigns` it adds the campaign
 * filter and scans by campaign — the server leaves those out otherwise.
 * What we record: time, country (approximate, from the network), device type,
 * referring site. No IP, no unique-visitor count, no city.
 */
export function Analytics() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [campaign, setCampaign] = useState('');
  const [qr, setQr] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const { data, error } = useQrStats({ range, campaign: campaign || undefined, qr: qr || undefined });

  useEffect(() => {
    fetch('/api/qr', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { qr: Option[] } | null) => b && setOptions(b.qr))
      .catch(() => undefined);
  }, []);

  const campaignOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) if (o.campaignId && o.campaignName) m.set(o.campaignId, o.campaignName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [options]);

  const byCampaign = useMemo(() => {
    if (!data?.can.campaigns) return [];
    const m = new Map<string, { name: string; inRange: number; allTime: number; codes: number }>();
    for (const c of data.codes) {
      const key = c.campaignId ?? 'none';
      const row = m.get(key) ?? { name: c.campaignName ?? 'No campaign', inRange: 0, allTime: 0, codes: 0 };
      row.inRange += c.inRange; // each code once, so a campaign's total is the sum of its codes
      row.allTime += c.allTime;
      row.codes += 1;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.inRange - a.inRange || b.allTime - a.allTime);
  }, [data]);

  if (error) return <p role="alert" className="text-strong">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;
  if (!data.totals.codes && !campaign && !qr && !options.length) {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">Nothing to measure yet</p>
        <p className="mt-2 text-muted">Save a tracked QR code and its scans will be analysed here.</p>
        <a href="/qr-code-generator" className="mt-4 inline-block font-semibold text-ink underline underline-offset-2">
          Make a QR code
        </a>
      </div>
    );
  }

  const codes = [...data.codes].sort((a, b) => b.inRange - a.inRange || b.allTime - a.allTime);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <RangePicker value={range} onChange={setRange} allow90={data.can.breakdowns} />
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
        {data.can.campaigns && (
          <label className="text-sm font-semibold text-ink">
            Campaign
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={FIELD}>
              <option value="">All campaigns</option>
              {campaignOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Scans, last ${range} days`} value={data.totals.inRange} testId="an-range" />
        <Kpi label="Scans this month" value={data.totals.thisMonth} testId="an-month" />
        <Kpi label="Scans" value={data.totals.allTime} note="all time" testId="an-all-time" />
        <Kpi label="QR codes" value={data.totals.codes} note="in this view" testId="an-codes" />
      </section>

      <section aria-labelledby="trend-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <h2 id="trend-h" className="font-display text-lg font-bold text-ink">
          Scans over time
        </h2>
        <div className="mt-3">
          <ScanChart days={data.series} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Scans are people who scanned — bots and link previews are left out — and they’re scans, not unique visitors. Days are in your time zone ({data.range.timeZone}).
        </p>
      </section>

      <section aria-labelledby="bycode-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <h2 id="bycode-h" className="font-display text-lg font-bold text-ink">
          Scans by code
        </h2>
        {codes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No codes in this view.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="by-code">
              <thead>
                <tr className="text-muted">
                  <th className="py-2 pr-3 font-semibold">Code</th>
                  <th className="px-3 py-2 text-right font-semibold">Last {range} days</th>
                  <th className="px-3 py-2 text-right font-semibold">All time</th>
                  <th className="hidden py-2 pl-3 font-semibold sm:table-cell">Last scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3">
                      <a href={`/app/qr/${c.id}`} className="font-semibold text-ink hover:underline">
                        {c.name}
                      </a>
                      <span className="block text-xs text-muted">
                        {KIND_SHORT[c.kind]}
                        {c.status === 'disabled' ? ' · paused' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">{c.inRange.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.allTime.toLocaleString('en-IN')}</td>
                    <td className="hidden py-2 pl-3 text-muted sm:table-cell">{fmtDate(c.lastScanAt) ?? 'No scans yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.can.campaigns && byCampaign.length > 0 && (
        <section aria-labelledby="bycamp-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
          <h2 id="bycamp-h" className="font-display text-lg font-bold text-ink">
            Scans by campaign
          </h2>
          <ul className="mt-2 divide-y divide-hair" data-testid="by-campaign">
            {byCampaign.map((c) => (
              <li key={c.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span>
                  <span className="font-semibold text-ink">{c.name}</span> <span className="text-sm text-muted">{plural(c.codes, 'code')}</span>
                </span>
                <span className="text-sm tabular-nums text-muted">
                  <span className="font-semibold text-ink">{plural(c.inRange, 'scan')}</span> in {range} days · {c.allTime.toLocaleString('en-IN')} all time
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.breakdowns && (
        <div className="grid gap-6 lg:grid-cols-3">
          <BreakdownCard title="Where (country)" note="Approximate — from the network a phone used, not its exact location." items={data.breakdowns.countries} total={data.totals.inRange} country testId="bk-country" />
          <BreakdownCard title="Device type" items={data.breakdowns.devices} total={data.totals.inRange} testId="bk-device" />
          <BreakdownCard title="Referring site" note="The website a scan came from, when the phone says so." items={data.breakdowns.referrers} total={data.totals.inRange} testId="bk-referrer" />
        </div>
      )}
    </div>
  );
}

const regionName = (code: string): string => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

function BreakdownCard({ title, items, total, note, country, testId }: { title: string; items: Breakdown; total: number; note?: string; country?: boolean; testId: string }) {
  return (
    <section aria-label={title} className="rounded-xl2 border border-hair bg-surface p-5" data-testid={testId}>
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No scans in this range.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((i) => (
            <li key={i.label} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate text-ink">{country && /^[A-Z]{2}$/.test(i.label) ? `${regionName(i.label)} (${i.label})` : i.label}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {i.scans.toLocaleString('en-IN')} · {total ? Math.round((i.scans / total) * 100) : 0}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-wash" aria-hidden="true">
                <div className="h-full rounded-full bg-coral-500" style={{ width: `${total ? Math.max(2, (i.scans / total) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </section>
  );
}
