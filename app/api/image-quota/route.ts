/**
 * Free daily image conversions (Image Kit). Counts files, never holds them.
 *
 *   GET   → { ok, limit, used, remaining, signedIn }  (reads the count only)
 *   POST  { op: "use" }        → 200 { ok, limit, used, remaining }
 *                               → 429 { ok: false, error: "daily_limit", needsSignIn, limit, remaining: 0 }
 *   POST  { op: "give-back" }  → 200 { ok: true }     (a counted file failed to convert)
 *
 * Visitors: 25 a day, counted by a salted hash of the IP. Signed in: a higher
 * count by a salted hash of the user id. Both restart at midnight IST. Behind a
 * shared IP (mobile networks often share one) visitors can share a count; the
 * limit is a fair-use standard, not a security control.
 */

import { after, NextResponse } from 'next/server';
import { clientIp, hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { formatErrorForLog } from '@/app/lib/log-error';
import { rateLimitChecks } from '@/app/lib/rate-limit';
import { getCurrentUser } from '@/app/lib/session';
import {
  FREE_DAILY_IMAGE_LIMIT,
  IMAGE_QUOTA_SCOPE,
  indiaDayKey,
  SIGNED_IN_DAILY_IMAGE_LIMIT,
} from '@/app/lib/image/quota-policy';
import { getDb } from '@/db/client';
import { consumeRateLimits, giveBackRateLimit, pruneRateLimits, readRateLimitCount } from '@/db/rate-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * The one counter for this caller today. Signed-in people are counted by a
 * salted hash of their user id; visitors by a salted hash of their IP. Both
 * include the India day.
 */
async function dailyChecks(req: Request) {
  const salt = resolveIpHashSalt();
  const user = await getCurrentUser(req.headers);
  const day = indiaDayKey();
  if (user) {
    const userHash = await hashIp(user.id, salt);
    return {
      signedIn: true,
      checks: rateLimitChecks(IMAGE_QUOTA_SCOPE, 'imageConvertDaySignedIn', `${day}.user.${userHash}`),
      limit: SIGNED_IN_DAILY_IMAGE_LIMIT,
    };
  }
  const ipHash = await hashIp(clientIp(req.headers), salt);
  return {
    signedIn: false,
    checks: rateLimitChecks(IMAGE_QUOTA_SCOPE, 'imageConvertDay', `${day}.ip.${ipHash}`),
    limit: FREE_DAILY_IMAGE_LIMIT,
  };
}

function summary(used: number, limit: number, signedIn: boolean) {
  const capped = Math.min(used, limit);
  return { limit, used: capped, remaining: limit - capped, signedIn };
}

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { checks, limit, signedIn } = await dailyChecks(req);
    const used = await readRateLimitCount(db, checks[0].key);
    return NextResponse.json({ ok: true, ...summary(used, limit, signedIn) }, { headers: noStore });
  } catch (err) {
    console.error('[api/image-quota] GET server_error:', formatErrorForLog(err));
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500, headers: noStore });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const op = (body as { op?: unknown } | null)?.op;
  if (op !== 'use' && op !== 'give-back') {
    return NextResponse.json({ ok: false, error: 'invalid_op' }, { status: 400, headers: noStore });
  }

  try {
    const db = await getDb();
    const { checks, limit, signedIn } = await dailyChecks(req);
    const key = checks[0].key;

    if (op === 'give-back') {
      await giveBackRateLimit(db, key);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    const decision = await consumeRateLimits(db, checks);
    if (Math.random() < 0.01) after(() => pruneRateLimits(db));

    if (!decision.allowed) {
      // The attempt was refused, so it must not count: undo the increment.
      await giveBackRateLimit(db, key);
    }
    const used = await readRateLimitCount(db, key);
    if (!decision.allowed) {
      // A visitor who hits the cap is asked to sign in; a signed-in person waits for tomorrow.
      return NextResponse.json(
        {
          ok: false,
          error: 'daily_limit',
          needsSignIn: !signedIn,
          ...summary(limit, limit, signedIn),
          remaining: 0,
        },
        { status: 429, headers: noStore },
      );
    }
    return NextResponse.json({ ok: true, ...summary(used, limit, signedIn) }, { headers: noStore });
  } catch (err) {
    console.error('[api/image-quota] POST server_error:', formatErrorForLog(err));
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500, headers: noStore });
  }
}
