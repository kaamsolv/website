/**
 * GET    /api/qr/:id — one tracked QR code with its scans per day.
 *                      `?tz=Asia/Kolkata` sets the time zone the days are cut in.
 * PUT    /api/qr/:id — rename, pause / resume, or (QR Pro) move into a campaign.
 *                      Body: { name?, status?: 'active'|'disabled', campaignId?: uuid|null }.
 *                      None of these touch where a code points — changing the destination isn't part of this release.
 * DELETE /api/qr/:id — delete the code and its link. A printed copy then shows "not found".
 *
 * Always scoped to the signed-in user: someone else's id is a plain 404.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { cleanQrName, validTimeZone } from '@/app/lib/qr/tracking';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { dailyScans, deleteQr, getQr, renameQr, setQrStatus } from '@/db/qr';
import { setQrCampaign } from '@/db/qr-campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';
const notFound = () => fail(404, 'not_found', 'That QR code isn’t here — it may have been deleted.');

export async function GET(req: Request, { params }: Ctx) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const db = await getDb();
  const qr = await getQr(db, user.id, id);
  if (!qr) return notFound();
  const tz = validTimeZone(new URL(req.url).searchParams.get('tz'));
  const campaigns = entitlementsFrom(await getEntitlements(db, user.id)).can('qr_campaigns');
  return json({
    ok: true,
    qr: { ...qr, campaignId: campaigns ? qr.campaignId : null, campaignName: campaigns ? qr.campaignName : null, shortUrl: `${SITE_URL}/${qr.shortCode}` },
    days: (await dailyScans(db, user.id, id, tz)) ?? [],
    timeZone: tz,
    canCampaigns: campaigns,
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  let body: { name?: unknown; status?: unknown; campaignId?: unknown };
  try {
    body = (await readJson(req, 2_000)) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const db = await getDb();
  if (body?.name === undefined && body?.status === undefined && body?.campaignId === undefined) return fail(400, 'invalid', 'Nothing to change.');
  if (body.campaignId !== undefined) {
    if (!entitlementsFrom(await getEntitlements(db, user.id)).can('qr_campaigns')) return fail(403, 'not_allowed', 'Campaigns are part of QR Pro.');
    if (body.campaignId !== null && (typeof body.campaignId !== 'string' || !isUuid(body.campaignId))) return fail(400, 'invalid', 'Choose a campaign.');
  }
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'disabled') return fail(400, 'invalid', 'Choose pause or resume.');
  let name: string | null = null;
  if (body.name !== undefined) {
    name = cleanQrName(body.name);
    if (!name) return fail(400, 'invalid_name', 'Give it a name (up to 80 characters).');
  }
  // The campaign step is the one that can be refused for a reason other than "not found" (a campaign that isn't yours),
  // so it goes first: a refused request then changes nothing at all.
  if (body.campaignId !== undefined && !(await setQrCampaign(db, user.id, id, body.campaignId as string | null))) {
    return fail(404, 'not_found', 'That QR code or campaign isn’t here.');
  }
  if (name && !(await renameQr(db, user.id, id, name))) return notFound();
  if (body.status && !(await setQrStatus(db, user.id, id, body.status))) return notFound();
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  return (await deleteQr(await getDb(), user.id, id)) ? json({ ok: true }) : notFound();
}
