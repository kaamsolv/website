/**
 * POST /api/shorten  —  create and persist a short link.
 *
 * Phase 2a: real persistence (Drizzle → Neon in prod, PGlite locally).
 * Phase 2b.1: optional expiry. Additive — no `expiresIn` means "never".
 * Phase 2b.2: shared DB rate limiting, destination policy, Web Risk screening.
 *             Same request/response contract; one new failure code.
 *
 * Request:  { "url": "<destination>", "expiresIn"?: "never" | "1d" | "7d" | "30d" }
 * Success:  200 { ok: true, shortUrl, shortCode, destination, expiresAt: ISO string | null }
 * Failure:  4xx/5xx { ok: false, error, message, retryAfter? }
 *
 * Checks, cheapest first:
 *   rate limit → URL validation → destination policy → expiry → screening → insert
 */

import { after, NextResponse } from 'next/server';
import { checkDestinationPolicy } from '@/app/lib/destination-policy';
import { clientIp, hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { expiresAtFor, parseExpiryOption } from '@/app/lib/link-expiry';
import { formatErrorForLog } from '@/app/lib/log-error';
import { rateLimitChecks, retryAfterSeconds } from '@/app/lib/rate-limit';
import { screenUrl } from '@/app/lib/url-reputation';
import {
  MAX_URL_LENGTH,
  messageForReason,
  validateDestinationUrl,
} from '@/app/lib/url-validation';
import { getDb } from '@/db/client';
import { createShortLink } from '@/db/links';
import { consumeRateLimits, pruneRateLimits } from '@/db/rate-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

/** Namespace for this product's rate-limit keys (see app/lib/rate-limit.ts). */
const SCOPE = 'url-shortener';

type ShortenSuccess = {
  ok: true;
  shortUrl: string;
  shortCode: string;
  destination: string;
  /** ISO timestamp, or null when the link never expires. */
  expiresAt: string | null;
};

type ShortenFailure = {
  ok: false;
  error: 'invalid_url' | 'invalid_expiry' | 'blocked_url' | 'rate_limited' | 'server_error';
  message: string;
  retryAfter?: number;
};

const noStore = { 'Cache-Control': 'no-store' };

// Logged once per instance, not per request.
let warnedNotConfigured = false;

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const ipHash = await hashIp(clientIp(req.headers), resolveIpHashSalt());

    // Shared across instances and deploys (db/rate-limits.ts).
    const limit = await consumeRateLimits(db, rateLimitChecks(SCOPE, 'create', ipHash));
    if (Math.random() < 0.01) after(() => pruneRateLimits(db));
    if (!limit.allowed) {
      return fail(
        { error: 'rate_limited', message: rateLimitedMsg(), retryAfter: retryAfterSeconds(limit.resetAt) },
        429,
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail({ error: 'invalid_url', message: messageForReason('unparseable') }, 400);
    }

    const url = typeof (body as { url?: unknown })?.url === 'string' ? (body as { url: string }).url : '';
    if (url.length > MAX_URL_LENGTH + 100) {
      return fail({ error: 'invalid_url', message: messageForReason('too_long') }, 400);
    }

    const validated = validateDestinationUrl(url);
    if (!validated.ok) {
      return fail({ error: 'invalid_url', message: messageForReason(validated.reason) }, 400);
    }

    // Other shorteners hide the real destination (app/lib/destination-policy.ts).
    const policy = checkDestinationPolicy(validated.hostname);
    if (!policy.ok) {
      return fail(
        {
          error: 'blocked_url',
          message: "That's a link from another shortener. Paste the full destination link instead.",
        },
        400,
      );
    }

    // Only the fixed presets are accepted; the server computes the timestamp.
    const expiry = parseExpiryOption((body as { expiresIn?: unknown })?.expiresIn);
    if (!expiry) {
      return fail({ error: 'invalid_expiry', message: 'Pick how long the link should last.' }, 400);
    }

    // Google Web Risk. Fails OPEN: unavailable/unconfigured → allowed, logged,
    // screened_at left null for a later re-screen.
    const screen = await screenUrl(validated.normalized, { apiKey: process.env.WEB_RISK_API_KEY });
    if (screen.status === 'unsafe') {
      // Destination host only — never the full URL (§7 logging rule).
      console.warn(
        `[api/shorten] blocked by Web Risk: host=${validated.hostname} threats=${screen.threatTypes.join(',')}`,
      );
      return fail(
        { error: 'blocked_url', message: "We can't shorten this link — it's been flagged as potentially harmful." },
        400,
      );
    }
    if (screen.status === 'unavailable') {
      console.warn(`[api/shorten] not screened (${screen.reason}): host=${validated.hostname} — allowed`);
    } else if (screen.status === 'not_configured' && !warnedNotConfigured) {
      warnedNotConfigured = true;
      console.warn('[api/shorten] WEB_RISK_API_KEY not set — links are not being screened');
    }

    const row = await createShortLink(db, {
      destination: validated.normalized,
      createdIpHash: ipHash,
      expiresAt: expiresAtFor(expiry),
      screenedAt: screen.status === 'safe' ? new Date() : null,
    });

    const payload: ShortenSuccess = {
      ok: true,
      shortUrl: `${SITE_URL}/${row.shortCode}`,
      shortCode: row.shortCode,
      destination: row.destination,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    };
    return NextResponse.json(payload, { status: 200, headers: noStore });
  } catch (err) {
    // Log the cause server-side — the client only ever sees the friendly line.
    // Root cause first, so a truncating log viewer still shows what broke.
    console.error('[api/shorten] server_error:', formatErrorForLog(err));
    return fail({ error: 'server_error', message: serverErrorMsg() }, 500);
  }
}

function fail(f: Omit<ShortenFailure, 'ok'>, status: number) {
  const headers: Record<string, string> = { ...noStore };
  if (f.retryAfter) headers['Retry-After'] = String(f.retryAfter);
  return NextResponse.json({ ok: false, ...f } satisfies ShortenFailure, { status, headers });
}

const rateLimitedMsg = () => "You've made quite a few requests. Try again in a little while.";
const serverErrorMsg = () => "We couldn't shorten that link. Please try again.";

export type { ShortenSuccess, ShortenFailure };
