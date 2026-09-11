/**
 * POST /api/report  —  report a short link for abuse (2b.2).
 *
 * Request:  { "link": "<short URL or code>", "reason": ReportReason,
 *             "details"?: string, "website"?: "" }        ← honeypot, must stay empty
 * Success:  202 { ok: true }
 * Failure:  400 { ok: false, error: 'invalid_report', field, message }
 *           429 { ok: false, error: 'rate_limited', message, retryAfter }
 *           500 { ok: false, error: 'server_error', message }
 *
 * Deliberately uninformative on success: a well-formed report gets the same
 * 202 whether or not the code exists (no enumeration), and whether or not the
 * honeypot tripped (don't teach bots what gave them away). A report never
 * disables a link — an operator reviews it (npm run link:reports).
 */

import { after, NextResponse } from 'next/server';
import { clientIp, hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { formatErrorForLog } from '@/app/lib/log-error';
import { rateLimitChecks, retryAfterSeconds } from '@/app/lib/rate-limit';
import { parseReportInput } from '@/app/lib/report';
import { getDb } from '@/db/client';
import { consumeRateLimits, pruneRateLimits } from '@/db/rate-limits';
import { createReport } from '@/db/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamkit.com';
const SCOPE = 'url-shortener';
const noStore = { 'Cache-Control': 'no-store' };

/** Hosts whose links count as KaamKit short links: production, plus wherever
 *  this deployment is being served (a Preview URL, or localhost). */
function allowedHosts(req: Request): string[] {
  const hosts = new Set(['kaamkit.com', 'www.kaamkit.com', new URL(req.url).host]);
  try {
    hosts.add(new URL(SITE_URL).host);
  } catch {
    // Ignore a malformed override.
  }
  return [...hosts];
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const ipHash = await hashIp(clientIp(req.headers), resolveIpHashSalt());

    const limit = await consumeRateLimits(db, rateLimitChecks(SCOPE, 'report', ipHash));
    if (Math.random() < 0.01) after(() => pruneRateLimits(db));
    if (!limit.allowed) {
      const retryAfter = retryAfterSeconds(limit.resetAt);
      return NextResponse.json(
        {
          ok: false,
          error: 'rate_limited',
          message: "You've sent quite a few reports. Try again in a little while.",
          retryAfter,
        },
        { status: 429, headers: { ...noStore, 'Retry-After': String(retryAfter) } },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    // Honeypot: a hidden field real people never see or fill.
    const honeypot = (body as { website?: unknown } | null)?.website;
    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
      return accepted();
    }

    const parsed = parseReportInput(body, allowedHosts(req));
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: 'invalid_report', field: parsed.field, message: parsed.message },
        { status: 400, headers: noStore },
      );
    }

    await createReport(db, {
      shortCode: parsed.shortCode,
      reason: parsed.reason,
      details: parsed.details,
      reporterIpHash: ipHash,
    });
    return accepted();
  } catch (err) {
    console.error('[api/report] server_error:', formatErrorForLog(err));
    return NextResponse.json(
      { ok: false, error: 'server_error', message: "We couldn't send your report. Please try again." },
      { status: 500, headers: noStore },
    );
  }
}

const accepted = () => NextResponse.json({ ok: true }, { status: 202, headers: noStore });
