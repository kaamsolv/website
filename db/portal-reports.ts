/**
 * Reports of a merchant's portal (migration 0021). Framework-free; takes an explicit `db`.
 *
 * Anyone may file one. It is stored only if the portal exists and is live: an address that doesn't exist is accepted and
 * dropped by the same statement (nothing is inserted), so the form can't be used to find out which addresses exist.
 * A report changes nothing by itself. Operators read them with `npm run affiliate:reports`.
 * One of the few files allowed to read `merchants` (see test/affiliate-isolation.test.mts).
 */

import { sql } from 'drizzle-orm';
import type { PortalReportReason } from '../app/lib/affiliate/report.ts';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

/** Stores a report of a live portal. Returns false (and stores nothing) if there is no such portal. */
export async function createPortalReport(db: Db, input: { slug: string; reason: PortalReportReason; details: string; reporterIpHash: string }): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      insert into portal_reports (merchant_id, reason, details, reporter_ip_hash)
      select id, ${input.reason}, ${input.details}, ${input.reporterIpHash} from merchants where slug = ${input.slug} and status = 'active'
      returning id
    `),
  );
  return rows.length > 0;
}

export type ReportRow = {
  id: string;
  slug: string;
  merchantName: string;
  merchantStatus: string;
  reason: string;
  details: string;
  status: string;
  createdAt: Date;
  /** How many open reports the same portal has, so repeats stand out. */
  openForMerchant: number;
};

export async function listPortalReports(db: Db, opts: { status?: 'open' | 'reviewed' | 'dismissed' | 'all'; limit?: number } = {}): Promise<ReportRow[]> {
  const status = opts.status ?? 'open';
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select r.id, m.slug, m.name as merchant_name, m.status as merchant_status, r.reason, r.details, r.status, r.created_at,
             (select count(*)::int from portal_reports o where o.merchant_id = r.merchant_id and o.status = 'open') as open_for_merchant
      from portal_reports r join merchants m on m.id = r.merchant_id
      where (${status} = 'all' or r.status = ${status})
      order by r.created_at desc
      limit ${limit}
    `),
  );
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    merchantName: String(r.merchant_name),
    merchantStatus: String(r.merchant_status),
    reason: String(r.reason),
    details: String(r.details),
    status: String(r.status),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
    openForMerchant: Number(r.open_for_merchant),
  }));
}

/** Marks one report reviewed or dismissed. Returns false if it doesn't exist or was already handled. */
export async function handlePortalReport(db: Db, id: string, to: 'reviewed' | 'dismissed'): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`update portal_reports set status = ${to}, handled_at = now() where id = ${id}::uuid and status = 'open' returning id`),
  );
  return rows.length > 0;
}
