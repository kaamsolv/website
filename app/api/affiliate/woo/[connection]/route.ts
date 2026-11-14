/**
 * POST /api/affiliate/woo/{connection} — a business's WooCommerce store tells KaamSolv about an order.
 *
 * The whole job is in app/lib/affiliate/woo-webhook.ts (which the tests call directly). In short: the signature is
 * checked against the raw body before anything is parsed; only orders that used exactly one affiliate coupon are kept;
 * nothing about the customer is stored; and the body, the signature and the secret are never logged.
 * Answers are tiny JSON with no-store, and never echo anything from the request.
 */

import { handleWooDelivery } from '@/app/lib/affiliate/woo-webhook';
import { webhookMaster } from '@/app/lib/affiliate/woo-secret';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ connection: string }> }) {
  const { connection } = await ctx.params;
  let result;
  try {
    result = await handleWooDelivery(await getDb(), connection, req, webhookMaster());
  } catch {
    result = { status: 500, code: 'server_error' } as const;
  }
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if ('retryAfter' in result && result.retryAfter) headers['Retry-After'] = String(result.retryAfter);
  return Response.json({ ok: result.status < 300, code: result.code }, { status: result.status, headers });
}

// Anything else is not a delivery.
export const GET = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
