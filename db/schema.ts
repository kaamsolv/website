/**
 * Drizzle schema — KaamKit URL Shortener (Phase 2a).
 *
 * This is the minimum production schema for URL shortening: one `links` table.
 * It is deliberately framework-free (no `next/*`) so it can move into a shared
 * `packages/link-core` if/when the Cloudflare Worker redirect lands.
 *
 * Deferred, additive-only later migrations (documented in
 * docs/products/url-shortener.md §10): `rate_limits`, `link_reports`,
 * `campaign_id`, `click_events`, `accounts` / `entitlements` / `usage`.
 */

import {
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Redirect behaviour for a link. `expired` is derived from `expiresAt`, not stored. */
export const linkStatus = pgEnum('link_status', ['active', 'disabled']);

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The public code in `kaamkit.com/{shortCode}`. Base62, unique. */
    shortCode: text('short_code').notNull(),

    /** Normalised destination URL (output of validateDestinationUrl). */
    destination: text('destination').notNull(),

    status: linkStatus('status').notNull().default('active'),

    /** True once user-chosen slugs land (Phase 3). Always false for V1. */
    isCustom: boolean('is_custom').notNull().default(false),

    /**
     * Reserved nullable columns for the future shared KaamKit account system
     * (docs/products/url-shortener.md §8). Nothing writes them in Phase 2a.
     * `accountId` has no FK yet — there is no `accounts` table.
     */
    accountId: uuid('account_id'),
    anonSessionId: text('anon_session_id'),

    /** Best-effort analytics, incremented off the redirect hot path via after(). */
    clickCount: bigint('click_count', { mode: 'number' }).notNull().default(0),
    lastClickedAt: timestamp('last_clicked_at', { withTimezone: true }),

    /** Optional expiry. A link past this resolves to /link-unavailable?reason=expired. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    /** SHA-256(ip + KK_IP_HASH_SALT) — abuse forensics only, never the raw IP. */
    createdIpHash: text('created_ip_hash'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The redirect lookup is `WHERE short_code = $1`; unique doubles as its index.
    uniqueIndex('links_short_code_key').on(table.shortCode),
    index('links_account_id_idx').on(table.accountId),
    index('links_anon_session_id_idx').on(table.anonSessionId),
  ],
);

export type LinkRow = typeof links.$inferSelect;
export type NewLinkRow = typeof links.$inferInsert;
