/**
 * Drizzle schema — KaamKit URL Shortener.
 *
 *   Phase 2a  `links`         — one row per short link (migration 0000)
 *   Phase 2b.1 `click_events` — one row per recorded click (migration 0001)
 *
 * Deliberately framework-free (no `next/*`) so it can move into a shared
 * `packages/link-core` if/when the Cloudflare Worker redirect lands.
 *
 * Deferred, additive-only later migrations (documented in
 * docs/products/url-shortener.md §10): `rate_limits`, `link_reports`,
 * `campaign_id`, `accounts` / `entitlements` / `usage`.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { DEVICE_CLASSES } from '../app/lib/click-meta.ts';

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

/** Coarse device bucket for a click — see app/lib/click-meta.ts. */
export const deviceClass = pgEnum('device_class', DEVICE_CLASSES);

/**
 * One row per recorded click (Phase 2b.1). Written off the redirect path via
 * after(), in the same statement that bumps `links.click_count`.
 *
 * Holds only what docs/products/url-shortener.md §9 designed: when, the
 * referring host, a two-letter country, and a device bucket. No IP, no raw
 * User-Agent, no full referrer URL. The CHECK constraints enforce the shape at
 * the database too, so a bug in the app layer can't widen what gets stored.
 */
export const clickEvents = pgTable(
  'click_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    /** Hostname only, e.g. `web.whatsapp.com`. Null when absent or not http(s). */
    referrerHost: text('referrer_host'),

    /** ISO-3166 alpha-2 from the platform geo header. Null when unknown. */
    country: text('country'),

    deviceClass: deviceClass('device_class').notNull().default('unknown'),
  },
  (table) => [
    // Per-link time series: "clicks for this link, newest first / in a range".
    index('click_events_link_id_occurred_at_idx').on(table.linkId, table.occurredAt),
    check('click_events_country_iso2', sql`${table.country} ~ '^[A-Z]{2}$'`),
    check('click_events_referrer_host_len', sql`char_length(${table.referrerHost}) <= 253`),
  ],
);

export type ClickEventRow = typeof clickEvents.$inferSelect;
