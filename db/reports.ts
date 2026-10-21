/**
 * Abuse-report data access (2b.2). Framework-free; explicit `db`.
 *
 * Reports never change a link's status — an operator reviews them
 * (npm run link:reports / link:status) and decides. Otherwise anyone could
 * take down a legitimate link by reporting it repeatedly.
 */

import { count, desc, eq, max, sql } from 'drizzle-orm';
import type { ReportReason } from '../app/lib/report.ts';
import type { Db } from './links.ts';
import { linkReports, links } from './schema.ts';

/**
 * Store a report against the link with this code. Returns false — without
 * error — when no such link exists: the caller answers identically either way,
 * so the report endpoint can't be used to discover which codes exist.
 * One statement: INSERT … SELECT from `links`.
 */
export async function createReport(
  db: Db,
  input: {
    shortCode: string;
    reason: ReportReason;
    details: string | null;
    reporterIpHash: string | null;
  },
): Promise<boolean> {
  // Every value is a bound parameter; only identifiers are literal.
  const result = await db.execute(sql`
    insert into link_reports (link_id, reason, details, reporter_ip_hash)
    select id, ${input.reason}::report_reason, ${input.details}, ${input.reporterIpHash}
      from links
     where short_code = ${input.shortCode}
    returning id`);
  // Neon-HTTP and PGlite both expose `rows` on a raw result.
  return ((result as unknown as { rows?: unknown[] }).rows ?? []).length > 0;
}

export type ReportSummary = {
  total: number;
  latestAt: Date | null;
  byReason: { reason: ReportReason; reports: number }[];
};

/** Reports for one link, for operator tooling. */
export async function getReportSummary(db: Db, linkId: string): Promise<ReportSummary> {
  const byReason = await db
    .select({ reason: linkReports.reason, reports: count(), latestAt: max(linkReports.createdAt) })
    .from(linkReports)
    .where(eq(linkReports.linkId, linkId))
    .groupBy(linkReports.reason)
    .orderBy(desc(count()));

  const latest = byReason.reduce<Date | null>(
    (acc, r) => (r.latestAt && (!acc || r.latestAt > acc) ? r.latestAt : acc),
    null,
  );
  return {
    total: byReason.reduce((n, r) => n + r.reports, 0),
    latestAt: latest,
    byReason: byReason.map(({ reason, reports }) => ({ reason, reports })),
  };
}

/** Newest reports across all links, with the link they point at. Operator-only. */
export async function listRecentReports(db: Db, limit = 25) {
  return db
    .select({
      createdAt: linkReports.createdAt,
      reason: linkReports.reason,
      details: linkReports.details,
      shortCode: links.shortCode,
      destination: links.destination,
      status: links.status,
    })
    .from(linkReports)
    .innerJoin(links, eq(links.id, linkReports.linkId))
    .orderBy(desc(linkReports.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
}
