/**
 * POST /api/affiliate/report — report a merchant's portal. Open to anyone, signed in or not.
 *
 * Request:  { slug, reason, details?, website2?: "" }   ← website2 is a hidden field, must stay empty
 * Success:  202 { ok: true }
 * Failure:  400 { ok: false, error: 'invalid_report', field, message }
 *           429 { ok: false, error: 'rate_limited', message }
 *           500 { ok: false, error: 'server_error', message }
 *
 * Deliberately uninformative on success, like the short-link report: a well-formed report gets the same 202 whether or
 * not the portal exists (so it can't be used to find which addresses exist) and whether or not the hidden field
 * tripped. A report changes nothing by itself: an operator reads it (npm run affiliate:reports).
 */

import { NextResponse } from 'next/server';
import { parsePortalReport } from '@/app/lib/affiliate/report';
import { clientIp, hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { formatErrorForLog } from '@/app/lib/log-error';
import { rateLimitChecks, retryAfterSeconds } from '@/app/lib/rate-limit';
import { getDb } from '@/db/client';
import { createPortalReport } from '@/db/portal-reports';
import { consumeRateLimits } from '@/db/rate-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const accepted = () => NextResponse.json({ ok: true }, { status: 202, headers: noStore });

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const ipHash = await hashIp(clientIp(req.headers), resolveIpHashSalt());

    const limit = await consumeRateLimits(db, rateLimitChecks('affiliate', 'affiliatePortalReport', ipHash));
    if (!limit.allowed) {
      const retryAfter = retryAfterSeconds(limit.resetAt);
      return NextResponse.json(
        { ok: false, error: 'rate_limited', message: 'You’ve sent quite a few reports. Try again in a little while.' },
        { status: 429, headers: { ...noStore, 'Retry-After': String(retryAfter) } },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const trap = (body as { website2?: unknown } | null)?.website2;
    if (typeof trap === 'string' && trap.trim() !== '') return accepted();

    const parsed = parsePortalReport(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_report', field: parsed.field, message: parsed.message }, { status: 400, headers: noStore });
    }

    // Stored only for a live portal; for any other address nothing is stored and the answer is the same.
    await createPortalReport(db, { slug: parsed.slug, reason: parsed.reason, details: parsed.details, reporterIpHash: ipHash });
    return accepted();
  } catch (e) {
    console.error('[api/affiliate/report]', formatErrorForLog(e));
    return NextResponse.json({ ok: false, error: 'server_error', message: 'We couldn’t send that. Try again in a moment.' }, { status: 500, headers: noStore });
  }
}
