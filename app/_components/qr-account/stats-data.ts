'use client';

import { useEffect, useState } from 'react';

/** What /api/qr/stats returns (dates arrive as strings). Scans = people who scanned, not unique visitors. */
export type StatsCode = {
  id: string;
  name: string;
  kind: 'url' | 'whatsapp' | 'social' | 'file';
  status: 'active' | 'disabled';
  campaignId: string | null;
  campaignName: string | null;
  allTime: number;
  inRange: number;
  lastScanAt: string | null;
  createdAt: string;
};
export type Breakdown = { label: string; scans: number }[];
export type Stats = {
  range: { days: 7 | 30 | 90; from: string; to: string; timeZone: string };
  totals: { codes: number; active: number; paused: number; allTime: number; thisMonth: number; inRange: number };
  series: { day: string; scans: number }[];
  codes: StatsCode[];
  breakdowns: null | { countries: Breakdown; devices: Breakdown; referrers: Breakdown };
  campaignCount: number | null;
  limit: number | null;
  can: { campaigns: boolean; breakdowns: boolean; export: boolean };
};

export type StatsParams = { range: 7 | 30 | 90; campaign?: string; qr?: string };

/** Loads stats for the visitor's own time zone; reloads when the params change. */
export function useQrStats(params: StatsParams): { data: Stats | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { range, campaign, qr } = params;

  useEffect(() => {
    let live = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const q = new URLSearchParams({ range: String(range), tz, ...(campaign ? { campaign } : {}), ...(qr ? { qr } : {}) });
    fetch(`/api/qr/stats?${q}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) return setError((body as { message?: string }).message ?? 'Couldn’t load your numbers. Refresh to try again.');
        setError(null);
        setData(body as Stats);
      })
      .catch(() => live && setError('Couldn’t load your numbers. Refresh to try again.'));
    return () => {
      live = false;
    };
  }, [range, campaign, qr, tick]);

  return { data, error, reload: () => setTick((t) => t + 1) };
}

export const KIND_SHORT: Record<StatsCode['kind'], string> = { url: 'Website', whatsapp: 'WhatsApp', social: 'Social', file: 'File link' };

export const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** A calendar date with no time (campaign start / end): shown as written, whatever the visitor's zone. */
export const fmtDateOnly = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
