/**
 * Synthetic WooCommerce order payloads for tests. Shaped like the REST API's order (what a webhook delivers): money as
 * strings, `_gmt` dates to the second, refunds as negative strings. Nothing here is real customer data; the billing
 * block exists so tests can prove it is never stored.
 */

import { createHmac } from 'node:crypto';

export type WooOrder = Record<string, unknown>;

export function wooOrder(over: Partial<{
  id: number;
  number: string;
  status: string;
  currency: string;
  created: string;
  modified: string | null;
  lines: string[];
  coupons: string[];
  shipping: string;
  tax: string;
  total: string;
  refunds: string[];
}> = {}): WooOrder {
  const lines = over.lines ?? ['1000.00', '500.00'];
  const itemsPaise = lines.reduce((s, t) => s + Math.round(Number(t) * 100), 0);
  const shipping = over.shipping ?? '50.00';
  const tax = over.tax ?? '0.00';
  const total = over.total ?? ((itemsPaise + Math.round(Number(shipping) * 100) + Math.round(Number(tax) * 100)) / 100).toFixed(2);
  const created = over.created ?? '2026-11-14T09:30:00';
  return {
    id: over.id ?? 7001,
    number: over.number ?? String(over.id ?? 7001),
    status: over.status ?? 'processing',
    currency: over.currency ?? 'INR',
    date_created_gmt: created,
    date_modified_gmt: over.modified === undefined ? created : over.modified,
    discount_total: '0.00',
    shipping_total: shipping,
    shipping_tax: '0.00',
    total_tax: tax,
    total,
    prices_include_tax: false,
    billing: { first_name: 'Test', last_name: 'Buyer', email: 'buyer@example.test', phone: '9000000000', address_1: '1 Test Street', city: 'Delhi' },
    line_items: lines.map((t, i) => ({ id: i + 1, name: `Item ${i + 1}`, quantity: 1, subtotal: t, total: t, total_tax: '0.00' })),
    coupon_lines: (over.coupons ?? ['ASHA10']).map((code, i) => ({ id: 100 + i, code: code.toLowerCase(), discount: '100.00', discount_tax: '0.00' })),
    refunds: (over.refunds ?? []).map((t, i) => ({ id: 900 + i, reason: '', total: t.startsWith('-') ? t : `-${t}` })),
  };
}

/** The independent way: Node's own HMAC, base64, as WooCommerce's PHP does it (`base64_encode(hash_hmac('sha256', …, true))`). */
export const wooSign = (secret: string, rawBody: string | Uint8Array): string => createHmac('sha256', secret).update(rawBody).digest('base64');

/** A delivery as WooCommerce would make it: the raw JSON text and its headers. */
export function wooDelivery(secret: string, order: WooOrder, topic = 'order.updated', deliveryId = '1') {
  const body = JSON.stringify(order);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-wc-webhook-topic': topic,
      'x-wc-webhook-resource': 'order',
      'x-wc-webhook-event': topic.split('.')[1],
      'x-wc-webhook-delivery-id': deliveryId,
      'x-wc-webhook-signature': wooSign(secret, body),
    } as Record<string, string>,
  };
}
