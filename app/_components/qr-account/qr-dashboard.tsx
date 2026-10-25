'use client';

import { useState } from 'react';
import { PRIMARY, SECONDARY } from '../account/account-shell';
import { Kpi } from './kpi';
import { RangePicker } from './range-picker';
import { ScanChart } from './scan-chart';
import { KIND_SHORT, fmtDate, plural, useQrStats } from './stats-data';

/**
 * QR dashboard. Every number comes from /api/qr/stats: lifetime figures say
 * "all time", the rest say what they cover. Scans are people who scanned (bots
 * and link previews are left out) — not unique visitors — and a code's history
 * starts the day it was saved.
 */
export function QrDashboard() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const { data, error } = useQrStats({ range });

  if (error) return <p role="alert" className="text-strong">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const { totals } = data;
  if (totals.codes === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">Count your first scan</p>
        <p className="mx-auto mt-2 max-w-md text-muted">
          Make a QR for a link, press “Save tracked QR”, and its scans show up here — how many, when, and which code did best.
        </p>
        <a href="/qr-code-generator" className={`${PRIMARY} mt-5`}>
          Make a QR code
        </a>
      </div>
    );
  }

  const top = [...data.codes].filter((c) => c.inRange > 0).sort((a, b) => b.inRange - a.inRange || b.allTime - a.allTime).slice(0, 5);
  const newest = data.codes.slice(0, 5); // already newest first
  const recent = [...data.codes].filter((c) => c.lastScanAt).sort((a, b) => Date.parse(b.lastScanAt!) - Date.parse(a.lastScanAt!)).slice(0, 5);
  const { from, to } = data.range;

  return (
    <div className="space-y-6">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="QR codes" value={totals.codes} note={data.limit === null ? undefined : `${totals.codes} of ${data.limit} allowed`} testId="kpi-codes" />
        <Kpi label="Active" value={totals.active} testId="kpi-active" />
        <Kpi label="Paused" value={totals.paused} testId="kpi-paused" />
        <Kpi label="Scans" value={totals.allTime} note="all time" testId="kpi-all-time" />
        <Kpi label="Scans this month" value={totals.thisMonth} note="calendar month so far" testId="kpi-month" />
        {data.campaignCount !== null && <Kpi label="Campaigns" value={data.campaignCount} testId="kpi-campaigns" />}
      </section>

      <section aria-labelledby="activity-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="activity-h" className="font-display text-lg font-bold text-ink">
              Scan activity
            </h2>
            <p className="text-sm text-muted" data-testid="range-summary">
              {plural(totals.inRange, 'scan')} in the last {range} days ({fmtDayRange(from, to)})
            </p>
          </div>
          <RangePicker value={range} onChange={setRange} allow90={data.can.breakdowns} />
        </div>
        <div className="mt-4">
          <ScanChart days={data.series} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Scans are people who scanned — not bots or link previews, and not unique visitors. Days are in your time zone ({data.range.timeZone}). A code’s
          history starts the day it was saved.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <CodeCard title={`Top codes, last ${range} days`} empty="No scans in this range yet." testId="top-codes">
          {top.map((c) => (
            <Row key={c.id} id={c.id} name={c.name} meta={KIND_SHORT[c.kind]} right={plural(c.inRange, 'scan')} />
          ))}
        </CodeCard>
        <CodeCard title="Recent activity" empty="No scans yet." testId="recent-activity">
          {recent.map((c) => (
            <Row key={c.id} id={c.id} name={c.name} meta={`last scanned ${fmtDate(c.lastScanAt)}`} right={`${c.allTime.toLocaleString('en-IN')} all time`} />
          ))}
        </CodeCard>
        <CodeCard title="Newest codes" empty="" testId="newest-codes">
          {newest.map((c) => (
            <Row key={c.id} id={c.id} name={c.name} meta={`made ${fmtDate(c.createdAt)}${c.status === 'disabled' ? ' · paused' : ''}`} right={`${c.allTime.toLocaleString('en-IN')} all time`} />
          ))}
        </CodeCard>
        <section aria-labelledby="quick-h" className="rounded-xl2 border border-hair bg-surface p-5">
          <h2 id="quick-h" className="font-display text-lg font-bold text-ink">
            Quick actions
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <a href="/qr-code-generator" className={PRIMARY}>
              + New QR code
            </a>
            <a href="/app/qr/codes" className={SECONDARY}>
              All QR codes
            </a>
            {data.can.campaigns && (
              <a href="/app/qr/campaigns" className={SECONDARY}>
                Start a campaign
              </a>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const fmtDayRange = (from: string, to: string) => {
  const f = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f(from)} – ${f(to)}`;
};

function CodeCard({ title, empty, testId, children }: { title: string; empty: string; testId: string; children: React.ReactNode[] }) {
  return (
    <section aria-label={title} className="rounded-xl2 border border-hair bg-surface p-5" data-testid={testId}>
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {children.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hair">{children}</ul>
      )}
    </section>
  );
}

function Row({ id, name, meta, right }: { id: string; name: string; meta: string; right: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <a href={`/app/qr/${id}`} className="min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
        <span className="block truncate font-semibold text-ink hover:underline">{name}</span>
        <span className="block text-xs text-muted">{meta}</span>
      </a>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{right}</span>
    </li>
  );
}
