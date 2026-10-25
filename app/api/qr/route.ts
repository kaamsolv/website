/**
 * GET  /api/qr  — the signed-in user's tracked QR codes, newest first, with
 *                 scan counts and how many they may keep.
 * POST /api/qr  — save a tracked QR code. Body: { name, payload, design }.
 *                 The destination is worked out here from the payload (never
 *                 trusted from the request), checked like any short link
 *                 (validation, other-shortener refusal, Web Risk), and the
 *                 plan's limit is enforced in the same SQL statement as the insert.
 *
 * A tracked QR encodes `kaamsolv.com/{code}`: the redirect and click
 * recording are the URL Shortener's, unchanged (docs/products/qr-tracking.md).
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { checkDestinationPolicy } from '@/app/lib/destination-policy';
import { hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { rateLimitChecks, retryAfterSeconds } from '@/app/lib/rate-limit';
import { canonicalPayload } from '@/app/lib/qr/encode';
import { cleanQrName, cleanTrackablePayload, designForSaving } from '@/app/lib/qr/tracking';
import { screenUrl } from '@/app/lib/url-reputation';
import { messageForReason, validateDestinationUrl } from '@/app/lib/url-validation';
import { formatErrorForLog } from '@/app/lib/log-error';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { consumeRateLimits } from '@/db/rate-limits';
import { createTrackedQr, listQr } from '@/db/qr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  const codes = await listQr(db, user.id);
  return json({
    ok: true,
    limit: ent.limit('qr_dynamic'),
    qr: codes.map((c) => ({ ...c, shortUrl: `${SITE_URL}/${c.shortCode}` })),
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  try {
    const db = await getDb();
    const ent = entitlementsFrom(await getEntitlements(db, user.id));
    const limit = ent.limit('qr_dynamic');
    if (limit === 0) return fail(403, 'not_allowed', 'Tracking scans isn’t part of your plan.');

    const rate = await consumeRateLimits(db, rateLimitChecks('qr', 'qrCreate', await hashIp(user.id, resolveIpHashSalt())));
    if (!rate.allowed) {
      return Response.json(
        { ok: false, error: 'rate_limited', message: 'That’s a lot of codes at once. Try again in a little while.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rate.resetAt)) } },
      );
    }

    let body: { name?: unknown; payload?: unknown; design?: unknown };
    try {
      body = (await readJson(req, 200_000)) as typeof body;
    } catch {
      return fail(400, 'bad_request', 'That QR code couldn’t be read.');
    }
    const name = cleanQrName(body?.name);
    if (!name) return fail(400, 'invalid_name', 'Give it a name (up to 80 characters) so you can find it later.');
    const payload = cleanTrackablePayload(body?.payload);
    if (!payload) return fail(400, 'not_trackable', 'Only website, WhatsApp, social and file-link QR codes can count scans.');

    // The link the QR leads to is worked out here, from the payload.
    const canonical = canonicalPayload(payload);
    if (!canonical.ok) return fail(400, 'invalid_url', canonical.message);
    const validated = validateDestinationUrl(canonical.text);
    if (!validated.ok) return fail(400, 'invalid_url', messageForReason(validated.reason));
    if (!checkDestinationPolicy(validated.hostname).ok) {
      return fail(400, 'blocked_url', 'That’s a link from another shortener. Use the full destination link instead.');
    }
    const screen = await screenUrl(validated.normalized, { apiKey: process.env.WEB_RISK_API_KEY });
    if (screen.status === 'unsafe') {
      console.warn(`[api/qr] blocked by Web Risk: host=${validated.hostname} threats=${screen.threatTypes.join(',')}`);
      return fail(400, 'blocked_url', 'We can’t track this link — it’s been flagged as potentially harmful.');
    }
    if (screen.status === 'unavailable') console.warn(`[api/qr] not screened (${screen.reason}): host=${validated.hostname} — allowed`);

    const created = await createTrackedQr(
      db,
      user.id,
      {
        name,
        kind: payload.kind,
        payload,
        design: designForSaving(body?.design),
        destination: validated.normalized,
        createdIpHash: null,
        screenedAt: screen.status === 'safe' ? new Date() : null,
      },
      limit,
    );
    if (!created.ok) {
      return fail(
        403,
        'limit',
        `You’re tracking ${limit} QR codes — the free limit. Delete one to track another. Your codes keep working either way.`,
      );
    }
    return json({ ok: true, id: created.id, shortCode: created.shortCode, shortUrl: `${SITE_URL}/${created.shortCode}` }, 201);
  } catch (err) {
    console.error('[api/qr] server_error:', formatErrorForLog(err));
    return fail(500, 'server_error', 'We couldn’t save that QR code. Please try again.');
  }
}
