/**
 * Scan statistics and exports for tracked QR codes (docs/products/qr-tracking.md).
 *
 * What a "scan" is — one rule everywhere: a `click_events` row whose
 * `device_class <> 'bot'`. That is exactly what `recordClick` adds to
 * `links.click_count`, and neither is written while a code is paused, so the
 * all-time total (`click_count`) and any date-range count agree. They count
 * scans, not unique people: no IP, cookie or identifier is kept.
 *
 * Efficiency: a request runs a handful of grouped queries, each bounded by
 * `occurred_at >= <start of range>` and by the user's own links (the
 * `(link_id, occurred_at)` index). There are no per-code lookups and full
 * history is never loaded. Days are cut in the visitor's time zone.
 *
 * Every query is scoped to `user_id`. Framework-free; takes an explicit `db`.
 */

import { sql, type SQL } from 'drizzle-orm';
import { lastDays } from './qr.ts';
import type { Range } from '../app/lib/qr/campaigns.ts';
import type { TrackableKind } from '../app/lib/qr/tracking.ts';
import type { Db } from './links.ts';

export type StatsScope = { campaignId?: string | null; qrId?: string | null };

export type CodeStat = {
  id: string;
  name: string;
  kind: TrackableKind;
  status: 'active' | 'disabled';
  campaignId: string | null;
  campaignName: string | null;
  /** All-time scans (`links.click_count`). */
  allTime: number;
  /** Scans in the chosen range. */
  inRange: number;
  lastScanAt: Date | null;
  createdAt: Date;
};

export type Breakdown = { label: string; scans: number }[];

export type QrStats = {
  range: { days: Range; from: string; to: string; timeZone: string };
  totals: { codes: number; active: number; paused: number; allTime: number; thisMonth: number; inRange: number };
  series: { day: string; scans: number }[];
  codes: CodeStat[];
  /** Null unless asked for (`qr_breakdowns`). */
  breakdowns: null | { countries: Breakdown; devices: Breakdown; referrers: Breakdown };
};

type Rows<T> = { rows: T[] };
const rowsOf = <T>(r: unknown): T[] => (r as Rows<T>).rows;

function scopeSql(userId: string, scope: StatsScope | undefined): SQL {
  return sql`q.user_id = ${userId}::uuid
    ${scope?.campaignId ? sql`and q.campaign_id = ${scope.campaignId}::uuid` : sql``}
    ${scope?.qrId ? sql`and q.id = ${scope.qrId}::uuid` : sql``}`;
}

/** Local midnight of `YYYY-MM-DD` in `timeZone`, as a timestamptz expression. */
const localMidnight = (day: string, timeZone: string) => sql`(${day}::timestamp at time zone ${timeZone})`;

export async function getQrStats(
  db: Db,
  userId: string,
  opts: { days: Range; timeZone: string; breakdowns: boolean; scope?: StatsScope; now?: Date },
): Promise<QrStats> {
  const now = opts.now ?? new Date();
  const days = lastDays(opts.days, opts.timeZone, now);
  const today = days[days.length - 1];
  const monthStart = `${today.slice(0, 7)}-01`;
  const scope = scopeSql(userId, opts.scope);
  const since = localMidnight(days[0] < monthStart ? days[0] : monthStart, opts.timeZone);
  const rangeFrom = localMidnight(days[0], opts.timeZone);
  const monthFrom = localMidnight(monthStart, opts.timeZone);

  // Scans of the scoped codes since the start of whichever is earlier: the range or this month. People only.
  const ev = sql`from qr_codes q join click_events e on e.link_id = q.link_id
                 where ${scope} and e.occurred_at >= ${since} and e.device_class <> 'bot'`;
  const group = (col: string, fallback: string): SQL =>
    sql`select coalesce(${sql.raw(col)}::text, ${fallback}) as label, count(*)::int as n
        from qr_codes q join click_events e on e.link_id = q.link_id
        where ${scope} and e.occurred_at >= ${rangeFrom} and e.device_class <> 'bot'
        group by 1 order by n desc, label limit 10`;

  const [codesR, perCodeR, seriesR, monthR, countriesR, devicesR, referrersR] = await Promise.all([
    db.execute(sql`
      select q.id, q.name, q.kind, q.campaign_id, c.name as campaign_name, q.created_at,
             l.status, l.click_count::float8 as all_time, l.last_clicked_at
      from qr_codes q join links l on l.id = q.link_id left join qr_campaigns c on c.id = q.campaign_id
      where ${scope}
      order by q.created_at desc`),
    db.execute(sql`select q.id as qr_id, count(*)::int as n ${ev} and e.occurred_at >= ${rangeFrom} group by q.id`),
    db.execute(sql`select to_char(e.occurred_at at time zone ${opts.timeZone}, 'YYYY-MM-DD') as day, count(*)::int as n ${ev} and e.occurred_at >= ${rangeFrom} group by 1`),
    db.execute(sql`select count(*)::int as n ${ev} and e.occurred_at >= ${monthFrom}`),
    opts.breakdowns ? db.execute(group('e.country', 'Unknown')) : null,
    opts.breakdowns ? db.execute(group('e.device_class', 'unknown')) : null,
    opts.breakdowns ? db.execute(group('e.referrer_host', 'Direct or unknown')) : null,
  ]);

  const perCode = new Map(rowsOf<{ qr_id: string; n: number }>(perCodeR).map((r) => [r.qr_id, Number(r.n)]));
  const byDay = new Map(rowsOf<{ day: string; n: number }>(seriesR).map((r) => [r.day, Number(r.n)]));
  const series = days.map((day) => ({ day, scans: byDay.get(day) ?? 0 }));

  const codes: CodeStat[] = rowsOf<{
    id: string; name: string; kind: TrackableKind; campaign_id: string | null; campaign_name: string | null;
    created_at: string | Date; status: 'active' | 'disabled'; all_time: number; last_clicked_at: string | Date | null;
  }>(codesR).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    status: r.status,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    allTime: Number(r.all_time),
    inRange: perCode.get(r.id) ?? 0,
    lastScanAt: r.last_clicked_at ? new Date(r.last_clicked_at) : null,
    createdAt: new Date(r.created_at),
  }));

  const labelled = (r: unknown): Breakdown => rowsOf<{ label: string; n: number }>(r).map((x) => ({ label: x.label, scans: Number(x.n) }));
  return {
    range: { days: opts.days, from: days[0], to: today, timeZone: opts.timeZone },
    totals: {
      codes: codes.length,
      active: codes.filter((c) => c.status === 'active').length,
      paused: codes.filter((c) => c.status === 'disabled').length,
      allTime: codes.reduce((n, c) => n + c.allTime, 0),
      thisMonth: Number(rowsOf<{ n: number }>(monthR)[0]?.n ?? 0),
      inRange: series.reduce((n, d) => n + d.scans, 0),
    },
    series,
    codes,
    breakdowns: opts.breakdowns && countriesR && devicesR && referrersR ? { countries: labelled(countriesR), devices: labelled(devicesR), referrers: labelled(referrersR) } : null,
  };
}

// ─── Exports (Pro: qr_export) ───────────────────────────────────────────────

export type ExportRange = { from?: string; to?: string; timeZone: string };

/** `from` / `to` are inclusive local days (YYYY-MM-DD); returns the SQL bounds on `e.occurred_at`. */
function rangeSql(r: ExportRange): SQL {
  return sql`${r.from ? sql`and e.occurred_at >= ${localMidnight(r.from, r.timeZone)}` : sql``}
             ${r.to ? sql`and e.occurred_at < ${localMidnight(r.to, r.timeZone)} + interval '1 day'` : sql``}`;
}

export type CodeExportRow = {
  name: string; shortCode: string; destination: string; kind: string; campaign: string | null;
  status: string; allTime: number; inRange: number; lastScanAt: Date | null; createdAt: Date;
};

/** One row per code, with all-time scans and scans in the range. Scan counts come from one grouped join, not per-code queries. */
export async function exportCodes(db: Db, userId: string, range: ExportRange, scope?: StatsScope): Promise<CodeExportRow[]> {
  const result = await db.execute(sql`
    select q.name, l.short_code, l.destination, q.kind, c.name as campaign, l.status, l.click_count::float8 as all_time,
           coalesce(s.n, 0)::int as in_range, l.last_clicked_at, q.created_at
    from qr_codes q join links l on l.id = q.link_id left join qr_campaigns c on c.id = q.campaign_id
    left join (
      select q2.id as qr_id, count(*) as n
      from qr_codes q2 join click_events e on e.link_id = q2.link_id
      where q2.user_id = ${userId}::uuid and e.device_class <> 'bot' ${rangeSql(range)}
      group by q2.id
    ) s on s.qr_id = q.id
    where ${scopeSql(userId, scope)}
    order by q.created_at desc`);
  return rowsOf<{
    name: string; short_code: string; destination: string; kind: string; campaign: string | null; status: string;
    all_time: number; in_range: number; last_clicked_at: string | Date | null; created_at: string | Date;
  }>(result).map((r) => ({
    name: r.name, shortCode: r.short_code, destination: r.destination, kind: r.kind, campaign: r.campaign, status: r.status,
    allTime: Number(r.all_time), inRange: Number(r.in_range), lastScanAt: r.last_clicked_at ? new Date(r.last_clicked_at) : null, createdAt: new Date(r.created_at),
  }));
}

export type ScanExportRow = { at: Date; name: string; shortCode: string; campaign: string | null; country: string | null; device: string; referrer: string | null };

/** One row per scan, oldest first. Reads one more than `limit` so the caller can refuse an over-large export instead of cutting it. */
export async function exportScans(db: Db, userId: string, range: ExportRange, limit: number, scope?: StatsScope): Promise<ScanExportRow[]> {
  const result = await db.execute(sql`
    select e.occurred_at, q.name, l.short_code, c.name as campaign, e.country, e.device_class, e.referrer_host
    from qr_codes q join links l on l.id = q.link_id join click_events e on e.link_id = q.link_id
    left join qr_campaigns c on c.id = q.campaign_id
    where ${scopeSql(userId, scope)} and e.device_class <> 'bot' ${rangeSql(range)}
    order by e.occurred_at, e.id
    limit ${limit + 1}`);
  return rowsOf<{ occurred_at: string | Date; name: string; short_code: string; campaign: string | null; country: string | null; device_class: string; referrer_host: string | null }>(result).map((r) => ({
    at: new Date(r.occurred_at), name: r.name, shortCode: r.short_code, campaign: r.campaign, country: r.country, device: r.device_class, referrer: r.referrer_host,
  }));
}
