/**
 * POST /api/shorten  —  PHASE 1: MOCK IMPLEMENTATION
 *
 * This validates the URL and generates a real short code, but DOES NOT
 * persist anything and DOES NOT create a working redirect. It exists so the
 * full tool UX (every state) can be built and QA'd before the database and
 * the Cloudflare edge redirect land.
 *
 * Phase 2a replaces the body of `handleShorten` with:
 *   - DB persistence (Drizzle → Neon), collision-retry on the unique index
 *   - `screenUrl()` reputation check
 *   - the shared IP rate-limit boundary backed by the DB
 *   - the signed `kk_sid` anonymous-session cookie
 *
 * The request/response contract below is intended to be stable across that
 * change so the client component does not need to be rewritten.
 */

import { NextResponse } from 'next/server';
import {
  MAX_URL_LENGTH,
  messageForReason,
  validateDestinationUrl,
} from '@/app/lib/url-validation';
import { generateShortCode } from '@/app/lib/short-code';
import { isReservedCode } from '@/app/lib/reserved-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamkit.com';

// ---- Mock rate limiter (in-memory; resets on redeploy, not shared across
//      instances). Phase 2a swaps in the real DB-backed limiter. ----
const RATE_LIMIT = { max: 12, windowMs: 60_000 };
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return { ok: true };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT.max) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true };
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

type ShortenSuccess = {
  ok: true;
  shortUrl: string;
  shortCode: string;
  destination: string;
  /** PHASE 1 only — tells the UI the link is not yet persistent. */
  mock: true;
};

type ShortenFailure = {
  ok: false;
  error: 'invalid_url' | 'rate_limited' | 'server_error';
  message: string;
  retryAfter?: number;
};

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  try {
    // Deterministic states for QA — Phase 1 only, removed in Phase 2a.
    const simulate = new URL(req.url).searchParams.get('simulate');
    if (simulate === 'rate-limit') {
      return fail({ error: 'rate_limited', message: rateLimitedMsg(), retryAfter: 30 }, 429);
    }
    if (simulate === 'error') {
      return fail({ error: 'server_error', message: serverErrorMsg() }, 500);
    }

    const rl = rateLimit(clientIp(req));
    if (!rl.ok) {
      return fail({ error: 'rate_limited', message: rateLimitedMsg(), retryAfter: rl.retryAfter }, 429);
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

    // Generate a code that isn't a reserved word. (Phase 2a: also retry on a
    // DB unique-constraint conflict.)
    let shortCode = generateShortCode();
    for (let i = 0; i < 5 && isReservedCode(shortCode); i += 1) {
      shortCode = generateShortCode();
    }

    if (simulate === 'slow') await sleep(1500);

    const payload: ShortenSuccess = {
      ok: true,
      shortUrl: `${SITE_URL}/${shortCode}`,
      shortCode,
      destination: validated.normalized,
      mock: true,
    };
    return NextResponse.json(payload, { status: 200, headers: noStore });
  } catch {
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type { ShortenSuccess, ShortenFailure };
