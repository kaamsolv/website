/**
 * POST /api/billing/webhook — Razorpay tells KaamSolv what happened to a payment.
 *
 * This, not the browser, is what confirms a payment (docs/products/billing.md). In order:
 *   1. Read the raw body exactly as sent and check Razorpay's signature on it. Wrong or missing → 400,
 *      nothing is read, parsed or stored.
 *   2. Use `x-razorpay-event-id` as the idempotency key: a repeated delivery changes nothing.
 *   3. Answer 200 once handled (or safely ignored), 503 when the thing it refers to isn't known yet
 *      (Razorpay redelivers), 500 on a database error (Razorpay redelivers).
 * Nothing here logs the body, the signature or any key.
 */

import { parseWebhook, verifyWebhookSignature, webhookSecret } from '@/app/lib/billing/razorpay';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { processBillingEvent } from '@/db/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 100_000;
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret) return reply(503, { ok: false, error: 'billing_unavailable' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply(413, { ok: false, error: 'too_large' });

  if (!(await verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature'), secret))) {
    return reply(400, { ok: false, error: 'bad_signature' });
  }
  const eventId = req.headers.get('x-razorpay-event-id')?.trim();
  if (!eventId || eventId.length > 100) return reply(400, { ok: false, error: 'no_event_id' });
  const event = parseWebhook(raw);
  if (!event) return reply(400, { ok: false, error: 'bad_payload' });

  try {
    const db = await getDb();
    const type = event.kind === 'ignored' ? event.type : event.kind;
    const out = await processBillingEvent(db, eventId, type, event);
    if (out.result === 'retry') return reply(503, { ok: false, error: 'try_again', detail: out.detail });
    return reply(200, { ok: true, result: out.result });
  } catch (e) {
    console.error('[api/billing/webhook]', formatErrorForLog(e));
    return reply(500, { ok: false, error: 'server_error' });
  }
}
