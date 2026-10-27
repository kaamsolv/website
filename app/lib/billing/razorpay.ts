/**
 * Razorpay, as little of it as KaamSolv needs: create an order, check a webhook's signature, and read the
 * few webhook events that matter. Plain `fetch` and Web Crypto, no SDK (CLAUDE.md §32). Server only.
 *
 * Keys are Worker secrets (docs/products/billing.md). Nothing here prints a key, a signature or a body.
 * The webhook, not the browser, is what confirms a payment.
 */

export type RazorpayKeys = { keyId: string; keySecret: string };

/** The API keys, or null when payments aren't switched on (the page then says so). */
export function razorpayKeys(): RazorpayKeys | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export const webhookSecret = (): string | null => process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;

const HEX = /^[0-9a-f]+$/i;

/**
 * Razorpay signs the exact bytes it sends: HMAC-SHA256 of the raw body with the webhook secret, hex, in
 * `X-Razorpay-Signature`. `crypto.subtle.verify` compares in constant time. Pass the body as received —
 * parsing and re-serialising it first would break the match.
 */
export async function verifyWebhookSignature(rawBody: string, signatureHex: string | null, secret: string): Promise<boolean> {
  if (!signatureHex || signatureHex.length !== 64 || !HEX.test(signatureHex)) return false;
  const signature = new Uint8Array(32);
  for (let i = 0; i < 32; i++) signature[i] = parseInt(signatureHex.slice(i * 2, i * 2 + 2), 16);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature, enc.encode(rawBody));
}

export type RazorpayOrder = { id: string };

/** Creates an order. Throws an Error carrying only the HTTP status — never the keys or the response body. */
export async function createRazorpayOrder(
  keys: RazorpayKeys,
  order: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> },
): Promise<RazorpayOrder> {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${keys.keyId}:${keys.keySecret}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: order.amountPaise, currency: order.currency, receipt: order.receipt, notes: order.notes }),
  });
  if (!res.ok) throw new Error(`razorpay_order_failed_${res.status}`);
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== 'string' || !body.id) throw new Error('razorpay_order_malformed');
  return { id: body.id };
}

/** The webhook events KaamSolv acts on, reduced to what the database step needs. */
export type BillingEvent =
  | { kind: 'captured'; paymentId: string; orderId: string; amountPaise: number; currency: string }
  | { kind: 'failed'; paymentId: string; orderId: string }
  | { kind: 'refund'; paymentId: string; amountPaise: number }
  | { kind: 'dispute'; paymentId: string; outcome: 'created' | 'won' | 'lost' | 'closed' }
  | { kind: 'ignored'; type: string };

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Reads a verified webhook body. Returns null when it isn't the JSON shape Razorpay documents (the caller
 * answers 400); an event type KaamSolv doesn't use comes back as `ignored`. Paths follow
 * razorpay.com/docs/webhooks/payloads: payment, refund and dispute entities.
 */
export function parseWebhook(rawBody: string): BillingEvent | null {
  let root: Record<string, unknown> | null;
  try {
    root = obj(JSON.parse(rawBody));
  } catch {
    return null;
  }
  const type = str(root?.event);
  const payload = obj(root?.payload);
  if (!type || !payload) return null;
  const entity = (name: string) => obj(obj(payload[name])?.entity);

  if (type === 'payment.captured' || type === 'payment.failed') {
    const p = entity('payment');
    const paymentId = str(p?.id);
    const orderId = str(p?.order_id);
    if (!paymentId || !orderId) return null;
    if (type === 'payment.failed') return { kind: 'failed', paymentId, orderId };
    const amountPaise = int(p?.amount);
    const currency = str(p?.currency);
    if (amountPaise === null || !currency) return null;
    return { kind: 'captured', paymentId, orderId, amountPaise, currency };
  }
  if (type === 'refund.processed') {
    const r = entity('refund');
    const paymentId = str(r?.payment_id);
    const amountPaise = int(r?.amount);
    if (!paymentId || amountPaise === null) return null;
    return { kind: 'refund', paymentId, amountPaise };
  }
  if (type.startsWith('payment.dispute.')) {
    const outcome = type.slice('payment.dispute.'.length);
    if (outcome === 'created' || outcome === 'won' || outcome === 'lost' || outcome === 'closed') {
      const paymentId = str(entity('dispute')?.payment_id);
      if (!paymentId) return null;
      return { kind: 'dispute', paymentId, outcome };
    }
  }
  return { kind: 'ignored', type };
}
