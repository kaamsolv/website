/**
 * GET  /api/qr/campaigns — the signed-in user's campaigns, with code counts and
 *                          all-time scans (QR Pro: `qr_campaigns`).
 * POST /api/qr/campaigns — create one. Body: { name, description?, startsOn?, endsOn? }.
 *
 * A campaign only groups codes: nothing here touches a code's link, destination,
 * status or scans.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { CAMPAIGN_CAP, cleanCampaign } from '@/app/lib/qr/campaigns';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { createCampaign, listCampaigns } from '@/db/qr-campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_ALLOWED = 'Campaigns are part of QR Pro.';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('qr_campaigns')) return fail(403, 'not_allowed', NOT_ALLOWED);
  return json({ ok: true, campaigns: await listCampaigns(db, user.id) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('qr_campaigns')) return fail(403, 'not_allowed', NOT_ALLOWED);

  let body: unknown;
  try {
    body = await readJson(req, 5_000);
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const cleaned = cleanCampaign(body);
  if (!cleaned.ok) return json({ ok: false, error: 'invalid', field: cleaned.field, message: cleaned.message }, 400);
  const made = await createCampaign(db, user.id, cleaned.value);
  if (!made.ok) {
    return made.reason === 'duplicate_name'
      ? json({ ok: false, error: 'duplicate_name', field: 'name', message: 'You already have a campaign with that name.' }, 409)
      : fail(403, 'limit', `You can have up to ${CAMPAIGN_CAP} campaigns. Delete one to add another.`);
  }
  return json({ ok: true, id: made.id }, 201);
}
