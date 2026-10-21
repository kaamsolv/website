/**
 * Entitlements — the single way any tool asks "may this user do X?" (§25).
 *
 * Keys match the Pro features' lookup keys in the payment provider (Stripe
 * Entitlements features, or our `plan_features` table for Razorpay). Tools
 * call `can(key)` for each paid action — never "if paid, allow everything".
 *
 * Phase 1: there are no accounts yet, so everyone has the free set (none).
 * Phase 2 swaps `useEntitlements()`'s data source to GET /api/me/entitlements;
 * no tool code changes. Server-side actions re-check on the server.
 */

export const ENTITLEMENT_KEYS = [
  'invoice_watermark_remove',
  'invoice_unlimited_items',
  'invoice_save',
  'invoice_client_directory',
  'invoice_templates',
  'invoice_brand_color',
  'invoice_quote_mode',
  'invoice_recurring',
  'invoice_csv_export',
  'invoice_batch_csv',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export type Entitlements = {
  /** True while the list is loading (always false in Phase 1). */
  loading: boolean;
  can: (key: EntitlementKey) => boolean;
};

export function entitlementsFrom(keys: Iterable<string>): Entitlements {
  const set = new Set(keys);
  return { loading: false, can: (key) => set.has(key) };
}

const FREE = entitlementsFrom([]);

/** Phase 1: the free tier for everyone. */
export function useEntitlements(): Entitlements {
  return FREE;
}
