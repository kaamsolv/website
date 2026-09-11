/**
 * POST /api/shorten  —  create and persist a short link.
 *
 * Phase 2a: real persistence (Drizzle → Neon in prod, PGlite locally).
 * Phase 2b.1: optional expiry. Additive — a request without `expiresIn` behaves
 * exactly as before (the link never expires).
 *
 * Request:  { "url": "<destination>", "expiresIn"?: "never" | "1d" | "7d" | "30d" }
 * Success:  200 { ok: true, shortUrl, shortCode, destination, expiresAt: ISO string | null }
 * Failure:  4xx/5xx { ok: false, error, message, retryAfter? }
 */

import { NextResponse } from 'next/server';
import {
  MAX_URL_LENGTH,
  messageForReason,
  validateDestinationUrl,
} from '@/app/lib/url-validation';
import { expiresAtFor, parseExpiryOption } from '@/app/lib/link-expiry';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { createShortLink } from '@/db/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamkit.com';

// ---- IP rate limiter (in-memory fixed window). Unchanged from Phase 1: the
//      existing security boundary. It resets on redeploy and is not shared
//      across instances — documented as swappable (docs/products/url-shortener.md
//      §7). Moving it to a shared store is a later step, not Phase 2a. ----
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

/** SHA-256(ip + salt). Null when no salt is configured — never store a raw IP. */
async function hashIp(ip: string): Promise<string | null> {
  const salt = process.env.KK_IP_HASH_SALT;
  if (!salt || ip === 'local') return null;
  const data = new TextEncoder().encode(`${ip}${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
  error: 'invalid_url' | 'invalid_expiry' | 'rate_limited' | 'server_error';
  message: string;
  retryAfter?: number;
};

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  try {
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

    // Only the fixed presets are accepted; the server computes the timestamp.
    const expiry = parseExpiryOption((body as { expiresIn?: unknown })?.expiresIn);
    if (!expiry) {
      return fail({ error: 'invalid_expiry', message: 'Pick how long the link should last.' }, 400);
    }

    const db = await getDb();
    const row = await createShortLink(db, {
      destination: validated.normalized,
      createdIpHash: await hashIp(clientIp(req)),
      expiresAt: expiresAtFor(expiry),
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
