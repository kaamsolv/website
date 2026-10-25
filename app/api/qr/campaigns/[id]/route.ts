/**
 * PUT    /api/qr/campaigns/:id — edit a campaign. Body: { name, description?, startsOn?, endsOn? }.
 * DELETE /api/qr/campaigns/:id — delete it. Its codes are ungrouped; no code, link or scan is deleted.
 *
 * QR Pro (`qr_campaigns`). Always scoped to the signed-in user: someone else's id is a plain 404.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { cleanCampaign } from '@/app/lib/qr/campaigns';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { deleteCampaign, updateCampaign } from '@/db/qr-campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => fail(404, 'not_found', 'That campaign isn’t here — it may have been deleted.');

async function gate(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('qr_campaigns')) return fail(403, 'not_allowed', 'Campaigns are part of QR Pro.');
  return { user, db };
}

export async function PUT(req: Request, { params }: Ctx) {
  const g = await gate(req);
  if (g instanceof Response) return g;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  let body: unknown;
  try {
    body = await readJson(req, 5_000);
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const cleaned = cleanCampaign(body);
  if (!cleaned.ok) return json({ ok: false, error: 'invalid', field: cleaned.field, message: cleaned.message }, 400);
  const r = await updateCampaign(g.db, g.user.id, id, cleaned.value);
  if (r.ok) return json({ ok: true });
  return r.reason === 'duplicate_name'
    ? json({ ok: false, error: 'duplicate_name', field: 'name', message: 'You already have a campaign with that name.' }, 409)
    : notFound();
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await gate(req);
  if (g instanceof Response) return g;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  return (await deleteCampaign(g.db, g.user.id, id)) ? json({ ok: true }) : notFound();
}
