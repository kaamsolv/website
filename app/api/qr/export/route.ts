/**
 * GET /api/qr/export?type=codes|scans&from=YYYY-MM-DD&to=YYYY-MM-DD&tz=…[&campaign=<id>][&qr=<id>]
 * CSV of the signed-in user's QR codes, or of their scans (QR Pro: `qr_export`).
 *
 *   codes — one row per code: name, short link, destination, type, campaign,
 *           status, all-time scans, scans in the range, last scan, created.
 *   scans — one row per scan (people only, bots left out): time, code, campaign,
 *           country, device type, referring site. No IP, no identifier.
 *
 * Only the user's own rows can ever appear. Cells that start with = + - @ are
 * defused (spreadsheet formula injection), and a scan export past 50,000 rows is
 * refused with a hint to pick a shorter range rather than cut off.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { toCsv } from '@/app/lib/invoice/csv';
import { isIsoDate } from '@/app/lib/invoice/recurring';
import { EXPORT_MAX_SCANS } from '@/app/lib/qr/campaigns';
import { validTimeZone } from '@/app/lib/qr/tracking';
import { fail, isUuid, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { exportCodes, exportScans } from '@/db/qr-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';
const iso = (d: Date | null) => (d ? d.toISOString() : '');

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  if (!ent.can('qr_export')) return fail(403, 'not_allowed', 'CSV export is part of QR Pro.');

  const q = new URL(req.url).searchParams;
  const type = q.get('type') === 'scans' ? 'scans' : 'codes';
  const from = q.get('from') || undefined;
  const to = q.get('to') || undefined;
  const campaign = q.get('campaign') || null;
  const qrId = q.get('qr') || null;
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return fail(400, 'invalid', 'Use dates like 2026-10-01.');
  if (from && to && to < from) return fail(400, 'invalid', 'The end date can’t be before the start.');
  if ((campaign && !isUuid(campaign)) || (qrId && !isUuid(qrId))) return fail(400, 'invalid', 'That filter isn’t valid.');
  if (campaign && !ent.can('qr_campaigns')) return fail(403, 'not_allowed', 'Campaigns are part of QR Pro.');

  const range = { from, to, timeZone: validTimeZone(q.get('tz')) };
  const scope = { campaignId: campaign, qrId };
  const stamp = `${from ? `-from-${from}` : ''}${to ? `-to-${to}` : ''}`;
  const headers = (name: string) => ({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'private, no-store',
  });

  if (type === 'codes') {
    const rows = await exportCodes(db, user.id, range, scope);
    const body = toCsv([
      ['Name', 'Short link', 'Destination', 'Type', 'Campaign', 'Status', 'Scans (all time)', 'Scans (in date range)', 'Last scan (UTC)', 'Created (UTC)'],
      ...rows.map((r) => [r.name, `${SITE_URL}/${r.shortCode}`, r.destination, r.kind, r.campaign, r.status === 'active' ? 'Active' : 'Paused', r.allTime, r.inRange, iso(r.lastScanAt), iso(r.createdAt)]),
    ]);
    return new Response(body, { headers: headers(`kaamsolv-qr-codes${stamp}.csv`) });
  }

  const rows = await exportScans(db, user.id, range, EXPORT_MAX_SCANS, scope);
  if (rows.length > EXPORT_MAX_SCANS) {
    return fail(413, 'too_many', `That’s more than ${EXPORT_MAX_SCANS.toLocaleString('en-IN')} scans. Pick a shorter date range.`);
  }
  const body = toCsv([
    ['Scanned at (UTC)', 'QR code', 'Short link', 'Campaign', 'Country', 'Device', 'Referring site'],
    ...rows.map((r) => [iso(r.at), r.name, `${SITE_URL}/${r.shortCode}`, r.campaign, r.country, r.device, r.referrer]),
  ]);
  return new Response(body, { headers: headers(`kaamsolv-qr-scans${stamp}.csv`) });
}
