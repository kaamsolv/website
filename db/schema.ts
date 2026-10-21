/**
 * Drizzle schema — KaamSolv URL Shortener.
 *
 *   Phase 2a   `links`         — one row per short link          (migration 0000)
 *   Phase 2b.1 `click_events`  — one row per recorded click      (migration 0001)
 *   Phase 2b.2 `rate_limits`   — shared fixed-window counters    (migration 0002)
 *              `link_reports`  — abuse reports
 *              `links.screened_at`
 *
 * Deliberately framework-free (no `next/*`) so it can move into a shared
 * `packages/link-core` if/when the Cloudflare Worker redirect lands.
 *
 * Deferred, additive-only later migrations (documented in
 * docs/products/url-shortener.md §10): `campaign_id`, `accounts` /
 * `entitlements` / `usage`. No QR tables here — dynamic QR will reference
 * `links.id` from its own table when it lands.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { DEVICE_CLASSES } from '../app/lib/click-meta.ts';
import { MAX_REPORT_DETAILS, REPORT_REASONS } from '../app/lib/report.ts';

/** Redirect behaviour for a link. `expired` is derived from `expiresAt`, not stored. */
export const linkStatus = pgEnum('link_status', ['active', 'disabled']);

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The public code in `kaamsolv.com/{shortCode}`. Base62, unique. */
    shortCode: text('short_code').notNull(),

    /** Normalised destination URL (output of validateDestinationUrl). */
    destination: text('destination').notNull(),

    status: linkStatus('status').notNull().default('active'),

    /** True once user-chosen slugs land (Phase 3). Always false for V1. */
    isCustom: boolean('is_custom').notNull().default(false),

    /**
     * Reserved nullable columns for the future shared KaamSolv account system
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

    /**
     * When Google Web Risk cleared the destination (2b.2). Null = not screened:
     * screening was unavailable or unconfigured (fail-open), or the link predates
     * screening. Null rows are the input to any future re-screen job.
     */
    screenedAt: timestamp('screened_at', { withTimezone: true }),

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

/**
 * Fixed-window rate-limit counters (2b.2), shared by every instance so limits
 * survive redeploys and scale-out. Keys look like
 * `url-shortener:create:1m:<salted ip hash>` — never a raw IP. One atomic
 * upsert per check (db/rate-limits.ts); expired rows are pruned opportunistically.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('rate_limits_reset_at_idx').on(table.resetAt)],
);

export const reportReason = pgEnum('report_reason', REPORT_REASONS);

/**
 * Abuse reports (2b.2). Stored only for links that exist; a report for an
 * unknown code is accepted and discarded so the endpoint can't be used to
 * probe which codes exist. Reports never disable a link by themselves — an
 * operator reviews them (npm run link:reports) and decides.
 */
export const linkReports = pgTable(
  'link_reports',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    reason: reportReason('reason').notNull(),
    /** Optional free text — sanitised and capped in app/lib/report.ts, capped here too. */
    details: text('details'),
    reporterIpHash: text('reporter_ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('link_reports_link_id_created_at_idx').on(table.linkId, table.createdAt),
    index('link_reports_created_at_idx').on(table.createdAt),
    check(
      'link_reports_details_len',
      sql`char_length(${table.details}) <= ${sql.raw(String(MAX_REPORT_DETAILS))}`,
    ),
  ],
);

export type LinkReportRow = typeof linkReports.$inferSelect;
