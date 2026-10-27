/**
 * POST /api/billing/drain — runs the outbox: retries invoice emails that failed or were waiting on a setting.
 * Called by the Cloudflare scheduled trigger (worker/index.ts) with the shared CRON_SECRET; nobody else.
 * Returns counts only.
 */

import { DRAIN_SCHEDULED, drainOutbox } from '@/app/lib/billing/jobs';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { enqueueDueSummaries } from '@/db/notifications';


/** Constant-time string compare (no early exit on the first different character). */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handlePOST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: 'not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!same(req.headers.get('x-cron-secret') ?? '', secret)) return Response.json({ ok: false, error: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  try {
    // Queue the summaries due this period (a no-op outside the delivery windows), then run what is waiting.
    const queued = await enqueueDueSummaries(await getDb());
    const ran = await drainOutbox(DRAIN_SCHEDULED);
    return Response.json({ ok: true, queuedSummaries: queued, ...ran }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[api/billing/drain]', formatErrorForLog(e));
    return Response.json({ ok: false, error: 'server_error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
