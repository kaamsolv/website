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
 *   Accounts   `auth_*`, `plans`, `plan_features`, `subscriptions`,
 *              `business_profiles`, `invoices`                    (migration 0003)
 *              — see docs/products/accounts.md.
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
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
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

// ─── Accounts (migration 0003) ───────────────────────────────────────────────
//
// The `auth_*` tables belong to better-auth (app/lib/auth.ts). Object keys are
// better-auth's field names — its Drizzle adapter looks columns up by them — and
// the SQL names are snake_case. Prefixed `auth_` so "account" stays free for
// our own meaning later. Ids are UUIDs (`advanced.database.generateId: 'uuid'`).

export const authUsers = pgTable('auth_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
  },
  (table) => [index('auth_sessions_user_id_idx').on(table.userId)],
);

/** Sign-in methods linked to a user (Google, and the email sign-in link). */
export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** OAuth tokens — always null: app/lib/auth.ts strips them before insert/update (we never call Google's APIs). */
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_accounts_user_id_idx').on(table.userId)],
);

/**
 * Short-lived tokens: sign-in links (stored hashed) and OAuth state. Keyed by
 * token, not user, so there is no user FK — account deletion removes this
 * user's rows by the email inside `value` (db/accounts.ts).
 */
export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_verifications_identifier_idx').on(table.identifier)],
);

/** A plan is a named bundle of features. Seeded in migration 0003. */
export const plans = pgTable('plans', {
  planKey: text('plan_key').primaryKey(),
  name: text('name').notNull(),
});

/**
 * What each plan grants. `limitValue` null = unlimited; a number caps a
 * countable feature (e.g. `invoice_save: 20` on `free_account`).
 */
export const planFeatures = pgTable(
  'plan_features',
  {
    planKey: text('plan_key')
      .notNull()
      .references(() => plans.planKey, { onDelete: 'cascade' }),
    featureKey: text('feature_key').notNull(),
    limitValue: integer('limit_value'),
  },
  (table) => [primaryKey({ columns: [table.planKey, table.featureKey] })],
);

export const subscriptionProvider = pgEnum('subscription_provider', ['razorpay', 'manual']);

/**
 * Paid access. `manual` rows are hand grants (testing, support); `razorpay`
 * rows arrive with payments (Stage 3). Entitlements are computed from these on
 * each request (db/entitlements.ts) — never copied elsewhere.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    provider: subscriptionProvider('provider').notNull(),
    /** Provider subscription id; for `manual`, a note such as `manual:<date>:<reason>`. */
    providerRef: text('provider_ref').notNull().unique(),
    planKey: text('plan_key')
      .notNull()
      .references(() => plans.planKey),
    /** Provider status; only `active` grants features. */
    status: text('status').notNull(),
    /** Access ends after this. Null = no end (manual grants). */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('subscriptions_user_id_idx').on(table.userId)],
);

/** Max stored logo: a data URL, already downscaled in the browser (≈ 200 KB of image). */
export const LOGO_MAX_STORED_CHARS = 280_000;

/** The seller details a signed-in user's new invoices start with. */
export const businessProfiles = pgTable(
  'business_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    address: text('address').notNull().default(''),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull().default(''),
    logo: text('logo'),
    /** Next sequential number, printed with `invoicePrefix` (INV-0001). */
    nextNumber: integer('next_number').notNull().default(1),
    // Settings (migration 0004) — all optional; empty string = not set.
    stateCode: text('state_code').notNull().default(''),
    gstin: text('gstin').notNull().default(''),
    bankAccountName: text('bank_account_name').notNull().default(''),
    bankAccountNumber: text('bank_account_number').notNull().default(''),
    bankIfsc: text('bank_ifsc').notNull().default(''),
    bankName: text('bank_name').notNull().default(''),
    upiId: text('upi_id').notNull().default(''),
    showUpiQr: boolean('show_upi_qr').notNull().default(false),
    invoicePrefix: text('invoice_prefix').notNull().default('INV-'),
    defaultCurrency: text('default_currency').notNull().default('INR'),
    defaultTaxLabel: text('default_tax_label').notNull().default('GST'),
    defaultTaxRate: text('default_tax_rate').notNull().default(''),
    defaultDueDays: integer('default_due_days').notNull().default(14),
    defaultNotes: text('default_notes').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('business_profiles_logo_len', sql`char_length(${table.logo}) <= ${sql.raw(String(LOGO_MAX_STORED_CHARS))}`),
    check('business_profiles_next_number', sql`${table.nextNumber} >= 1`),
    check('business_profiles_due_days', sql`${table.defaultDueDays} between 0 and 365`),
  ],
);

/** Saved customers ("Bill to"). Free account: 3; Pro: unlimited (plan_features). */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contactName: text('contact_name').notNull().default(''),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull().default(''),
    address: text('address').notNull().default(''),
    stateCode: text('state_code').notNull().default(''),
    gstin: text('gstin').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('customers_user_id_name_idx').on(table.userId, table.name)],
);

/** Saved products and services. */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    hsnSac: text('hsn_sac').notNull().default(''),
    unit: text('unit').notNull().default(''),
    /** As typed, like the invoice's own rate field. */
    rate: text('rate').notNull().default(''),
    gstRate: text('gst_rate').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('items_user_id_name_idx').on(table.userId, table.name)],
);

export const invoiceStatus = pgEnum('invoice_status', ['unpaid', 'paid']);

/** Max size of a stored invoice document (without logo). */
export const INVOICE_DATA_MAX_CHARS = 64_000;

/**
 * A saved invoice. `data` is the whole editor document minus the logo (the
 * logo lives once, on the business profile). The summary columns copy parts of
 * `data` for the list view, so lists never read `data`.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    clientName: text('client_name').notNull().default(''),
    currency: text('currency').notNull(),
    total: numeric('total', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    issueDate: date('issue_date'),
    /** Copied from the document so overdue can be queried (migration 0004). */
    dueDate: date('due_date'),
    /** The saved customer it was billed to, if any. The document keeps its own copy. */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    status: invoiceStatus('status').notNull().default('unpaid'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invoices_user_id_updated_at_idx').on(table.userId, table.updatedAt.desc()),
    check('invoices_data_len', sql`length(${table.data}::text) <= ${sql.raw(String(INVOICE_DATA_MAX_CHARS))}`),
  ],
);

export type InvoiceRow = typeof invoices.$inferSelect;
