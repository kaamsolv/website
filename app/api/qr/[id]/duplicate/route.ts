/**
 * POST /api/qr/:id/duplicate — a new tracked code made from an existing one:
 * same type, payload, design and campaign, named "… (copy)".
 *
 * It is a brand-new code, so it gets exactly what Save gets: the same per-user
 * rate limit, the same `qr_dynamic` limit and hard cap, and the destination is
 * worked out again from the saved payload and screened again (a link flagged
 * since the original was made is refused). The original — its link,
 * destination, status and scans — is never touched.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { rateLimitChecks, retryAfterSeconds } from '@/app/lib/rate-limit';
import { checkTrackedDestination } from '@/app/lib/qr/destination';
import { QR_NAME_MAX, cleanTrackablePayload, designForSaving } from '@/app/lib/qr/tracking';
import { formatErrorForLog } from '@/app/lib/log-error';
import { fail, isUuid, json, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { consumeRateLimits } from '@/db/rate-limits';
import { createTrackedQr, getQr } from '@/db/qr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const notFound = () => fail(404, 'not_found', 'That QR code isn’t here — it may have been deleted.');
  if (!isUuid(id)) return notFound();

  try {
    const db = await getDb();
    const ent = entitlementsFrom(await getEntitlements(db, user.id));
    const limit = ent.limit('qr_dynamic');
    if (limit === 0) return fail(403, 'not_allowed', 'Tracking scans isn’t part of your plan.');

    const original = await getQr(db, user.id, id);
    if (!original) return notFound();

    const rate = await consumeRateLimits(db, rateLimitChecks('qr', 'qrCreate', await hashIp(user.id, resolveIpHashSalt())));
    if (!rate.allowed) {
      return Response.json(
        { ok: false, error: 'rate_limited', message: 'That’s a lot of codes at once. Try again in a little while.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rate.resetAt)) } },
      );
    }

    // Worked out and screened afresh from the saved payload — not copied from the original's link.
    const payload = cleanTrackablePayload(original.payload);
    if (!payload) return fail(400, 'not_trackable', 'That code can’t be copied.');
    const checked = await checkTrackedDestination(payload, 'api/qr/duplicate');
    if (!checked.ok) return fail(400, checked.error, checked.message);

    const suffix = ' (copy)';
    const name = `${original.name.slice(0, QR_NAME_MAX - suffix.length)}${suffix}`;
    // The campaign is only carried over while the account still has campaigns (QR Pro).
    const created = await createTrackedQr(
      db,
      user.id,
      {
        name,
        kind: payload.kind,
        payload,
        design: designForSaving(original.design),
        destination: checked.destination,
        screenedAt: checked.screenedAt,
        campaignId: ent.can('qr_campaigns') ? original.campaignId : null,
      },
      limit,
    );
    if (!created.ok) {
      return fail(403, 'limit', `You’re tracking ${limit} QR codes — the free limit. Delete one to make a copy. Your codes keep working either way.`);
    }
    return json({ ok: true, id: created.id, shortCode: created.shortCode, shortUrl: `${SITE_URL}/${created.shortCode}` }, 201);
  } catch (err) {
    console.error('[api/qr/duplicate] server_error:', formatErrorForLog(err));
    return fail(500, 'server_error', 'We couldn’t make a copy. Please try again.');
  }
}
