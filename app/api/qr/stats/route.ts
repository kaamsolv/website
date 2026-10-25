/**
 * GET /api/qr/stats?range=7|30|90&tz=Asia/Kolkata[&campaign=<id>][&qr=<id>]
 *
 * The numbers behind the QR dashboard and Scan analytics: code counts, scans
 * (all time / this month / in the range), a daily series and per-code scans.
 * Scans are people who scanned — bots and previews excluded, the same rule as
 * each code's total. Scans, not unique visitors.
 *
 * Plan checks happen here, on the server, with the existing keys:
 *   - `qr_breakdowns`: country / device / referrer, and the 90-day range;
 *   - `qr_campaigns`: the campaign filter, campaign names and the campaign count.
 * Anything not allowed is left out of the answer (or refused), never merely hidden.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { parseRange } from '@/app/lib/qr/campaigns';
import { validTimeZone } from '@/app/lib/qr/tracking';
import { fail, isUuid, json, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { countCampaigns } from '@/db/qr-campaigns';
import { getQrStats } from '@/db/qr-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const q = new URL(req.url).searchParams;
  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  const canCampaigns = ent.can('qr_campaigns');
  const canBreakdowns = ent.can('qr_breakdowns');

  const days = q.get('range') === null ? 30 : parseRange(q.get('range'));
  if (!days) return fail(400, 'invalid', 'Choose 7, 30 or 90 days.');
  if (days === 90 && !canBreakdowns) return fail(403, 'not_allowed', 'The 90-day view is part of QR Pro.');
  const campaign = q.get('campaign');
  const qrId = q.get('qr');
  if (campaign && !canCampaigns) return fail(403, 'not_allowed', 'Campaigns are part of QR Pro.');
  if ((campaign && !isUuid(campaign)) || (qrId && !isUuid(qrId))) return fail(400, 'invalid', 'That filter isn’t valid.');

  const stats = await getQrStats(db, user.id, {
    days,
    timeZone: validTimeZone(q.get('tz')),
    breakdowns: canBreakdowns,
    scope: { campaignId: campaign || null, qrId: qrId || null },
  });
  return json({
    ok: true,
    ...stats,
    // Without the key, campaign fields are removed from every code.
    codes: canCampaigns ? stats.codes : stats.codes.map((c) => ({ ...c, campaignId: null, campaignName: null })),
    campaignCount: canCampaigns ? await countCampaigns(db, user.id) : null,
    limit: ent.limit('qr_dynamic'),
    can: { campaigns: canCampaigns, breakdowns: canBreakdowns, export: ent.can('qr_export') },
  });
}
