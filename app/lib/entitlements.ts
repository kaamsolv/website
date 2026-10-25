/**
 * Entitlements — the single way any tool asks "may this user do X?" (§25).
 *
 * Keys match the Pro features' keys in `plan_features` (db/entitlements.ts
 * resolves them on the server). Tools call `can(key)` for each paid action —
 * never "if paid, allow everything" — and `limit(key)` for countable ones.
 *
 * In the browser, `useEntitlements()` (app/lib/me-client.ts) reads GET /api/me.
 * Anonymous visitors get the empty set. Server-side actions always re-check on
 * the server; the browser copy only decides what to show. This module stays
 * framework-free so db/ and tests can import it.
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
  /** Saved items (free account: unlimited). */
  'invoice_item_catalogue',
  /** Dashboard + paid/unpaid tracking (Pro). */
  'invoice_dashboard',
  /** Currency reference rates on invoices (Pro, Stage 2C). */
  'invoice_fx_rates',
  // PDF tools (docs/products/pdf-tools.md). Nobody holds these yet: the Pro
  // features behind them ship in PDF Stage 2. Limits live in app/lib/pdf/limits.ts.
  /** Compress several PDFs at once, plus the "strong" level. */
  'pdf_batch_compress',
  /** Merge more than 3 PDFs, with page order across files. */
  'pdf_unlimited_merge',
  /** Split by ranges / every N pages, export as ZIP. */
  'pdf_advanced_split',
  /** PDF → Word / Excel (separate decision; not built). */
  'pdf_convert_office',
  /** Text recognition for scanned PDFs (separate decision; not built). */
  'pdf_ocr',
  /** 50 MB per file instead of 10 MB. */
  'pdf_large_files',
  /** More than 5 images into one PDF; batch PDF → JPG. */
  'pdf_batch_convert',
] as const;

/** Hidden anti-abuse ceiling on saved customers/items, for every plan. Not a paywall. */
export const DIRECTORY_HARD_CAP = 1000;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

/** Wire format (GET /api/me) — `limits[key]` null means unlimited. */
export type ResolvedEntitlements = {
  keys: EntitlementKey[];
  limits: Partial<Record<EntitlementKey, number | null>>;
};

export type Entitlements = {
  /** True while /api/me is loading. */
  loading: boolean;
  can: (key: EntitlementKey) => boolean;
  /** Cap for a countable feature: a number, null = unlimited, 0 = not granted. */
  limit: (key: EntitlementKey) => number | null;
};

export function entitlementsFrom(resolved: ResolvedEntitlements | Iterable<string>, loading = false): Entitlements {
  const limits: Partial<Record<string, number | null>> =
    Symbol.iterator in Object(resolved) ? Object.fromEntries([...(resolved as Iterable<string>)].map((k) => [k, null])) : (resolved as ResolvedEntitlements).limits;
  return {
    loading,
    can: (key) => key in limits,
    limit: (key) => (key in limits ? (limits[key] ?? null) : 0),
  };
}

/** Anonymous visitors, and the server's answer for no user. */
export const NO_ENTITLEMENTS: ResolvedEntitlements = { keys: [], limits: {} };
