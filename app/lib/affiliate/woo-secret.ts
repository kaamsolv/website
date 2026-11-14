/**
 * The one secret the WooCommerce connection hangs off: `AFFILIATE_WEBHOOK_MASTER`, a Worker secret. Every business's
 * webhook secret is derived from it (app/lib/affiliate/orders.ts, `deriveWebhookSecret`), so nothing secret is stored.
 *
 * Production without it is "not switched on": connecting a store is refused and deliveries answer 503. Anywhere else a
 * fixed development value stands in so local work and tests run. It is not a real secret and is never used in production.
 */

export const DEV_WEBHOOK_MASTER = 'kaamsolv-dev-only-affiliate-webhook-master';

export function webhookMaster(env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.AFFILIATE_WEBHOOK_MASTER?.trim();
  if (configured) return configured;
  return env.NODE_ENV === 'production' ? null : DEV_WEBHOOK_MASTER;
}

/** The address a business pastes into WooCommerce as Delivery URL. */
export const webhookPath = (connectionId: string): string => `/api/affiliate/woo/${connectionId}`;
