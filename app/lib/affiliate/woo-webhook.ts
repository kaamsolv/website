/**
 * One WooCommerce delivery, start to finish (Affiliate Manager, Phase 3B). Framework-free: it takes a plain `Request`,
 * a `db` and the master secret, and answers with a status and a short code. The route is a thin wrapper, so the real
 * handler is what the tests call.
 *
 * Order of work, and why:
 *   1. Look the connection up from the address. Unknown → 404 (nothing about it is revealed).
 *   2. No master secret configured → 503 (retryable); the connection can't be verified, so it isn't pretended.
 *   3. Read the body, bounded. Too big → 413, never read in full.
 *   4. Check the signature against the RAW bytes. Wrong or missing → 401. Nothing is parsed before this.
 *   5. Only signed traffic spends the rate limit, so an unsigned flood can't use up a business's allowance.
 *   6. WooCommerce's setup ping and topics we don't use → 200 (a failed delivery counts toward WooCommerce switching
 *      the webhook off after 5 in a row, so anything we deliberately ignore must still be a success).
 *   7. Read and check the order (malformed → 422, permanent), then record it in one statement.
 *   8. A database failure → 500 so WooCommerce delivers again; nothing else is retryable.
 *
 * Never logs the body, the signature, the secret or any order field. A failure logs only a scrubbed error line.
 */

import { consumeRateLimits } from '../../../db/rate-limits.ts';
import { connectionForDelivery, recordOrder } from '../../../db/affiliate-orders.ts';
import type { Db } from '../../../db/links.ts';
import { formatErrorForLog } from '../log-error.ts';
import { rateLimitChecks, retryAfterSeconds } from '../rate-limit.ts';
import { deriveWebhookSecret, parseOrder, readBoundedBody, verifySignature, type OrderStatus } from './orders.ts';

export type WooResult = { status: number; code: string; retryAfter?: number };

const HANDLED_TOPICS = new Set(['order.created', 'order.updated', 'order.deleted']);

const done = (status: number, code: string): WooResult => ({ status, code });

export async function handleWooDelivery(db: Db, connectionId: string, req: Request, master: string | null): Promise<WooResult> {
  try {
    const connection = await connectionForDelivery(db, connectionId);
    if (!connection) return done(404, 'not_found');
    if (!master) return done(503, 'not_configured');

    const body = await readBoundedBody(req);
    if (!body) return done(413, 'too_large');

    const secret = await deriveWebhookSecret(master, connection.id, connection.secretVersion);
    if (!(await verifySignature(secret, body, req.headers.get('x-wc-webhook-signature')))) return done(401, 'bad_signature');

    const limit = await consumeRateLimits(db, rateLimitChecks('woo', 'affiliateWebhook', connection.id));
    if (!limit.allowed) return { status: 429, code: 'rate_limited', retryAfter: retryAfterSeconds(limit.resetAt) };

    const text = new TextDecoder().decode(body);
    // WooCommerce pings a new webhook with a form body, not JSON. A signed ping is a success; it carries no order.
    if (/^webhook_id=\d+/.test(text)) return done(200, 'ping');

    const topic = (req.headers.get('x-wc-webhook-topic') ?? '').trim().toLowerCase();
    if (!HANDLED_TOPICS.has(topic)) return done(200, 'ignored');

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return done(400, 'bad_json');
    }
    const forced: OrderStatus | undefined = topic === 'order.deleted' ? 'cancelled' : undefined;
    const parsed = await parseOrder(payload, forced);
    if (!parsed.ok) return done(422, `bad_order_${parsed.reason}`);

    const outcome = await recordOrder(db, connection.id, parsed.order);
    if (outcome === 'no_connection') return done(404, 'not_found'); // removed between the lookup and the write
    return done(200, outcome);
  } catch (err) {
    console.error('[woo webhook]', formatErrorForLog(err));
    return done(500, 'server_error');
  }
}
