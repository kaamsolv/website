/**
 * Tracked (dynamic) QR codes — data access (docs/products/qr-tracking.md).
 *
 * A tracked QR is a `qr_codes` row plus the `links` row it points through; the
 * QR image encodes `kaamsolv.com/{code}` and scans are that link's clicks, so
 * the redirect route and click recording are unchanged.
 *
 * Every query is scoped by `user_id` — callers pass the signed-in user's id,
 * never one from the request — so another user's code is simply "not found".
 * Neon over HTTP has no transactions, so multi-row writes are single statements.
 * Framework-free; takes an explicit `db`.
 */

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { DEFAULT_LENGTH, MAX_ATTEMPTS, MAX_LENGTH, generateShortCode } from '../app/lib/short-code.ts';
import { isReservedCode } from '../app/lib/reserved-routes.ts';
import { CHART_DAYS, DEFAULT_TIME_ZONE, QR_HARD_CAP, type TrackableKind } from '../app/lib/qr/tracking.ts';
import type { QrDesign } from '../app/lib/qr/design.ts';
import type { QrPayload } from '../app/lib/qr/types.ts';
import { isUniqueViolation, type Db } from './links.ts';
import { links, qrCodes } from './schema.ts';

export type QrSummary = {
  id: string;
  name: string;
  kind: TrackableKind;
  shortCode: string;
  destination: string;
  /** 'active' | 'disabled' — a paused code shows "link unavailable" when scanned. */
  status: 'active' | 'disabled';
  /** People who scanned (bots and link-preview fetchers are not counted). */
  scans: number;
  lastScanAt: Date | null;
  createdAt: Date;
};

const SUMMARY = {
  id: qrCodes.id,
  name: qrCodes.name,
  kind: qrCodes.kind,
  shortCode: links.shortCode,
  destination: links.destination,
  status: links.status,
  scans: links.clickCount,
  lastScanAt: links.lastClickedAt,
  createdAt: qrCodes.createdAt,
};

export async function countQr(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(qrCodes).where(eq(qrCodes.userId, userId));
  return row?.n ?? 0;
}

export async function listQr(db: Db, userId: string): Promise<QrSummary[]> {
  const rows = await db
    .select(SUMMARY)
    .from(qrCodes)
    .innerJoin(links, eq(links.id, qrCodes.linkId))
    .where(eq(qrCodes.userId, userId))
    .orderBy(desc(qrCodes.createdAt));
  return rows as QrSummary[];
}

export type QrDetail = QrSummary & { payload: QrPayload; design: QrDesign };

export async function getQr(db: Db, userId: string, id: string): Promise<QrDetail | null> {
  const [row] = await db
    .select({ ...SUMMARY, payload: qrCodes.payload, design: qrCodes.design })
    .from(qrCodes)
    .innerJoin(links, eq(links.id, qrCodes.linkId))
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, userId)));
  return (row as QrDetail | undefined) ?? null;
}

export type CreateQrInput = {
  name: string;
  kind: TrackableKind;
  payload: QrPayload;
  design: QrDesign;
  /** The https link the QR leads to — worked out on the server from the payload, then screened. */
  destination: string;
  createdIpHash?: string | null;
  screenedAt?: Date | null;
};

export type CreateQrResult = { ok: true; id: string; shortCode: string } | { ok: false; reason: 'limit' };

/**
 * Save a tracked QR, checking the plan's limit in the same statement as the
 * inserts: a refused save leaves no orphan link, and requests that arrive one
 * after another can never pass the limit. (Two requests in the very same
 * instant could each see room under Postgres's default isolation and both
 * insert, so a free account can overshoot by a request — the per-user rate
 * limit bounds that, and the hard cap is the real ceiling. Same pattern as
 * `createInvoice`.) `limit` null = unlimited, still under the account-wide
 * hard cap. A short-code collision retries with a fresh code, widening the
 * keyspace, like `createShortLink`.
 */
export async function createTrackedQr(db: Db, userId: string, input: CreateQrInput, limit: number | null): Promise<CreateQrResult> {
  const cap = Math.min(limit ?? QR_HARD_CAP, QR_HARD_CAP);
  const payload = JSON.stringify(input.payload);
  const design = JSON.stringify(input.design);
  let length = DEFAULT_LENGTH;

  for (let attempt = 0; attempt < MAX_ATTEMPTS * 4; attempt += 1) {
    let code = generateShortCode(length);
    for (let i = 0; i < MAX_ATTEMPTS && isReservedCode(code); i += 1) code = generateShortCode(length);

    try {
      const result = await db.execute<{ id: string; short_code: string }>(sql`
        with capped as (
          select 1 as ok where (select count(*) from ${qrCodes} where ${qrCodes.userId} = ${userId}::uuid) < ${cap}
        ),
        new_link as (
          insert into ${links} (short_code, destination, account_id, created_ip_hash, screened_at)
          select ${code}, ${input.destination}, ${userId}::uuid, ${input.createdIpHash ?? null}, ${input.screenedAt ? input.screenedAt.toISOString() : null}::timestamptz
          from capped
          returning id, short_code
        ),
        new_qr as (
          insert into ${qrCodes} (user_id, link_id, name, kind, payload, design)
          select ${userId}::uuid, new_link.id, ${input.name}, ${input.kind}, ${payload}::jsonb, ${design}::jsonb
          from new_link
          returning id
        )
        select new_qr.id as id, new_link.short_code as short_code from new_qr, new_link`);
      const row = (result as unknown as { rows: { id: string; short_code: string }[] }).rows[0];
      if (!row) return { ok: false, reason: 'limit' };
      return { ok: true, id: row.id, shortCode: row.short_code };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if ((attempt + 1) % MAX_ATTEMPTS === 0 && length < MAX_LENGTH) length += 1;
    }
  }
  throw new Error('createTrackedQr: exhausted attempts finding a free short code');
}

/** The user's own QR code id → its link id, in one subquery so ownership is part of every write. */
const ownLink = (userId: string, id: string) =>
  sql`(select ${qrCodes.linkId} from ${qrCodes} where ${qrCodes.id} = ${id}::uuid and ${qrCodes.userId} = ${userId}::uuid)`;

/** Pause (`disabled`) or resume (`active`). Takes effect on the next scan: redirects are no-store. */
export async function setQrStatus(db: Db, userId: string, id: string, status: 'active' | 'disabled'): Promise<boolean> {
  const rows = await db
    .update(links)
    .set({ status, updatedAt: new Date() })
    .where(and(sql`${links.id} = ${ownLink(userId, id)}`, eq(links.accountId, userId)))
    .returning({ id: links.id });
  return rows.length > 0;
}

export async function renameQr(db: Db, userId: string, id: string, name: string): Promise<boolean> {
  const rows = await db
    .update(qrCodes)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, userId)))
    .returning({ id: qrCodes.id });
  return rows.length > 0;
}

/** Delete the code **and its link** (its scans go too). A printed copy then shows "not found". */
export async function deleteQr(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(links)
    .where(and(sql`${links.id} = ${ownLink(userId, id)}`, eq(links.accountId, userId)))
    .returning({ id: links.id });
  return rows.length > 0;
}

export type DailyScans = { day: string; scans: number }[];

/** `YYYY-MM-DD` for each of the last `days` calendar days in `timeZone`, oldest first. */
export function lastDays(days: number, timeZone: string, now: Date = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(now); // en-CA formats as YYYY-MM-DD
  const [y, m, d] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Scans per day for one code over the last `days` days, in the visitor's time
 * zone, zero-filled. People only: bots and link-preview fetchers are left out,
 * the same rule as the scan total. Null if it isn't this user's code.
 */
export async function dailyScans(
  db: Db,
  userId: string,
  id: string,
  timeZone: string = DEFAULT_TIME_ZONE,
  days: number = CHART_DAYS,
  now: Date = new Date(),
): Promise<DailyScans | null> {
  const [own] = await db.select({ linkId: qrCodes.linkId }).from(qrCodes).where(and(eq(qrCodes.id, id), eq(qrCodes.userId, userId)));
  if (!own) return null;

  const wanted = lastDays(days, timeZone, now);
  const since = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.execute<{ day: string; scans: number }>(sql`
    select to_char(occurred_at at time zone ${timeZone}, 'YYYY-MM-DD') as day, count(*)::int as scans
    from click_events
    where link_id = ${own.linkId}::uuid and device_class <> 'bot' and occurred_at >= ${since}::timestamptz
    group by 1`);
  const byDay = new Map((result as unknown as { rows: { day: string; scans: number }[] }).rows.map((r) => [r.day, Number(r.scans)]));
  return wanted.map((day) => ({ day, scans: byDay.get(day) ?? 0 }));
}
