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
     * `accountId` is the owner of a tracked QR code's link (migration 0008): a
     * foreign key to the signed-in user, deleted with the account. Links made
     * from the public shortener stay null (anonymous).
     */
    accountId: uuid('account_id').references(() => authUsers.id, { onDelete: 'cascade' }),
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

/**
 * What a plan costs, per billing period, in paise (billing, M1). Prices live here, never in the browser:
 * the checkout reads the amount from this table. `active` lets a price be retired without deleting history.
 */
export const planPrices = pgTable(
  'plan_prices',
  {
    planKey: text('plan_key')
      .notNull()
      .references(() => plans.planKey),
    period: text('period').notNull(),
    amountPaise: integer('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.planKey, table.period] }),
    check('plan_prices_period', sql`${table.period} in ('month', 'year')`),
    check('plan_prices_amount', sql`${table.amountPaise} > 0`),
  ],
);

/**
 * One row per Razorpay webhook delivery, keyed by Razorpay's own event id so a repeated delivery is a no-op.
 * Holds no customer details: only ids and a short status/reason.
 */
export const billingEvents = pgTable(
  'billing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerEventId: text('provider_event_id').notNull().unique(),
    eventType: text('event_type').notNull(),
    /** received → processed | ignored | failed. `failed` is retried by Razorpay's own redelivery. */
    status: text('status').notNull().default('received'),
    /** Short reason for ignored/failed ("partial_refund", "payment_not_known_yet"). Never personal data. */
    detail: text('detail').notNull().default(''),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [check('billing_events_status', sql`${table.status} in ('received', 'processed', 'ignored', 'failed')`)],
);

/**
 * KaamSolv's own sales: one row per checkout. The Razorpay webhook, never the browser, moves it to `paid`.
 * `userId` is set null (not cascaded) when an account is deleted so the sales record survives; it holds no
 * name, email or card detail.
 */
export const billingPayments = pgTable(
  'billing_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => authUsers.id, { onDelete: 'set null' }),
    planKey: text('plan_key')
      .notNull()
      .references(() => plans.planKey),
    period: text('period').notNull(),
    amountPaise: integer('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    razorpayOrderId: text('razorpay_order_id').unique(),
    razorpayPaymentId: text('razorpay_payment_id').unique(),
    /** The sales invoice KaamSolv issued for this payment (billing M2). Set null if the seller deletes it; `invoicedAt` stops it being made twice. */
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    invoicedAt: timestamp('invoiced_at', { withTimezone: true }),
    /** created → paid | failed; paid → refunded | disputed. */
    status: text('status').notNull().default('created'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Set in the same statement that marks it paid and switches the plan(s) on, so the two can't disagree. */
    grantedAt: timestamp('granted_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    disputedAt: timestamp('disputed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('billing_payments_user_id_idx').on(table.userId),
    check('billing_payments_status', sql`${table.status} in ('created', 'paid', 'failed', 'refunded', 'disputed')`),
    check('billing_payments_period', sql`${table.period} in ('month', 'year')`),
    check('billing_payments_amount', sql`${table.amountPaise} > 0`),
  ],
);

/**
 * A private, revocable link to one invoice (`/i/<token>`). Only a hash of the token is stored; the token itself
 * is derived from the link's id and a server secret (app/lib/links/token.ts), so a retry can rebuild the same URL.
 * Holds no customer details.
 */
export const invoiceLinks = pgTable(
  'invoice_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** `billing` = the link in a KaamSolv sales invoice email; `share` = a link a user made from their own invoice. */
    purpose: text('purpose').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    firstViewedAt: timestamp('first_viewed_at', { withTimezone: true }),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
  },
  (table) => [index('invoice_links_invoice_id_idx').on(table.invoiceId), check('invoice_links_purpose', sql`${table.purpose} in ('billing', 'share')`)],
);

/**
 * Durable background work (billing M2): "make and email the invoice for this payment". A row is written before
 * anything is attempted, `dedupe_key` makes enqueueing twice a no-op, and a failed attempt is retried with a
 * back-off (app/lib/outbox.ts). The payload holds ids only, never an address or an invoice.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    /** pending → sending → sent | failed (retried) | blocked (needs a setting) | dead (gave up). */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** A short code ("email_rejected_422", "seller_not_configured"), never an address or a message body. */
    lastError: text('last_error').notNull().default(''),
    providerRef: text('provider_ref').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('outbox_due_idx').on(table.status, table.nextAttemptAt),
    check('outbox_status', sql`${table.status} in ('pending', 'sending', 'sent', 'failed', 'blocked', 'dead')`),
  ],
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
    // Stage 2B (migration 0005).
    /** Composition scheme: documents are a Bill of Supply, with no tax. */
    composition: boolean('composition').notNull().default(false),
    /** Signature image for the authorised-signatory block (data URL, downscaled in the browser). */
    signature: text('signature'),
    // Stage 2C-1 (migration 0006) — Pro.
    quotePrefix: text('quote_prefix').notNull().default('QT-'),
    quoteNextNumber: integer('quote_next_number').notNull().default(1),
    defaultTemplate: text('default_template').notNull().default('classic'),
    defaultBrandColor: text('default_brand_color').notNull().default('#FE6336'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('business_profiles_logo_len', sql`char_length(${table.logo}) <= ${sql.raw(String(LOGO_MAX_STORED_CHARS))}`),
    check('business_profiles_next_number', sql`${table.nextNumber} >= 1`),
    check('business_profiles_due_days', sql`${table.defaultDueDays} between 0 and 365`),
    check('business_profiles_quote_next_number', sql`${table.quoteNextNumber} >= 1`),
    check('business_profiles_signature_len', sql`char_length(${table.signature}) <= ${sql.raw(String(LOGO_MAX_STORED_CHARS))}`),
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
    /** 'invoice' or 'quote' (Pro quotations, migration 0006). Quotes have no paid status and don't count in totals. */
    kind: text('kind').notNull().default('invoice'),
    /** Pro recurring (migration 0007): repeats weekly/monthly/quarterly/yearly; `recurNext` is the date the reminder is due. */
    recurEvery: text('recur_every'),
    recurNext: date('recur_next'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /**
     * Payments received, kept in step with the ledger by triggers (migration 0010): always the sum of this
     * invoice's non-voided `invoice_payments`. Never written by the app. `status` follows it: 'paid' means
     * `amount_paid >= total`; 'unpaid' with `amount_paid > 0` is partially paid; 'paid' with `amount_paid = 0`
     * is a legacy "marked paid" invoice with no payment records (docs/products/invoice-generator.md).
     */
    amountPaid: numeric('amount_paid', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invoices_user_id_updated_at_idx').on(table.userId, table.updatedAt.desc()),
    index('invoices_user_id_kind_idx').on(table.userId, table.kind),
    check('invoices_kind', sql`${table.kind} in ('invoice', 'quote')`),
    check('invoices_recur_every', sql`${table.recurEvery} is null or ${table.recurEvery} in ('week', 'month', 'quarter', 'year')`),
    index('invoices_user_recur_next_idx').on(table.userId, table.recurNext).where(sql`${table.recurNext} is not null`),
    check('invoices_data_len', sql`length(${table.data}::text) <= ${sql.raw(String(INVOICE_DATA_MAX_CHARS))}`),
    check('invoices_amount_paid', sql`${table.amountPaid} >= 0`),
  ],
);

export type InvoiceRow = typeof invoices.$inferSelect;

export const PAYMENT_METHODS_DB = ['upi', 'bank', 'cash', 'card', 'cheque', 'other'] as const;

/**
 * The payment ledger (migration 0010): one row per payment received against an invoice. Rows are never
 * edited or deleted by the app — a mistake is *voided* (kept, with a reason) and the right payment recorded
 * again. Only `reference` and `note` may change in place. Triggers enforce the rules at the database
 * (owner, currency, never more than the invoice total, immutability) and keep `invoices.amount_paid` and
 * `status` in step. `client_key` is the form's idempotency key: the same key can't record a payment twice.
 */
export const invoicePayments = pgTable(
  'invoice_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    /** Copied from the invoice; the trigger refuses a mismatch. */
    currency: text('currency').notNull(),
    paidOn: date('paid_on').notNull(),
    method: text('method').notNull(),
    reference: text('reference').notNull().default(''),
    note: text('note').notNull().default(''),
    clientKey: uuid('client_key').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invoice_payments_user_client_key_idx').on(table.userId, table.clientKey),
    index('invoice_payments_invoice_idx').on(table.invoiceId, table.paidOn),
    index('invoice_payments_user_paid_on_idx').on(table.userId, table.paidOn).where(sql`${table.voidedAt} is null`),
    check('invoice_payments_amount', sql`${table.amount} > 0`),
    check('invoice_payments_method', sql`${table.method} in ('upi', 'bank', 'cash', 'card', 'cheque', 'other')`),
    check('invoice_payments_reference_len', sql`char_length(${table.reference}) <= 100`),
    check('invoice_payments_note_len', sql`char_length(${table.note}) <= 400`),
    check('invoice_payments_void_reason_len', sql`char_length(${table.voidReason}) <= 200`),
  ],
);

export type InvoicePaymentRow = typeof invoicePayments.$inferSelect;

/**
 * The ledger's audit trail (migration 0010): written by the ledger triggers whenever a payment is recorded,
 * voided or has its reference/note edited — with the old and new values. Append-only; read by support, not
 * by the app. Removed with the invoice or the account.
 */
export const invoicePaymentEvents = pgTable(
  'invoice_payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => invoicePayments.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invoice_payment_events_payment_idx').on(table.paymentId, table.at),
    check('invoice_payment_events_action', sql`${table.action} in ('recorded', 'voided', 'edited')`),
  ],
);

/** Largest saved QR payload + design, in characters (the logo is never saved). */
export const QR_DATA_MAX_CHARS = 64_000;

/**
 * A tracked (dynamic) QR code, migration 0008: the saved studio state plus the
 * `links` row it points through. The QR image encodes `kaamsolv.com/{code}`;
 * scans are the link's clicks (docs/products/qr-tracking.md). Deleting the
 * user deletes the link (account_id FK), which deletes this row and its clicks.
 */
/**
 * A campaign groups tracked QR codes (Pro: `qr_campaigns`, migration 0009) —
 * "Diwali flyers 2026". Deleting one ungroups its codes (SET NULL on
 * `qr_codes.campaign_id`); it never deletes a code, a link or a scan.
 */
export const qrCampaigns = pgTable(
  'qr_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('qr_campaigns_user_name_key').on(table.userId, sql`lower(${table.name})`),
    check('qr_campaigns_name_len', sql`char_length(${table.name}) between 1 and 80`),
    check('qr_campaigns_description_len', sql`char_length(${table.description}) <= 500`),
    check('qr_campaigns_dates', sql`${table.endsOn} is null or ${table.startsOn} is null or ${table.endsOn} >= ${table.startsOn}`),
  ],
);

export type QrCampaignRow = typeof qrCampaigns.$inferSelect;

export const qrCodes = pgTable(
  'qr_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    /** The campaign it belongs to (Pro, migration 0009). Null = not in a campaign. */
    campaignId: uuid('campaign_id').references(() => qrCampaigns.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    /** Only types whose QR is an https link can be tracked: url, whatsapp, social, file. */
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    /** The studio design without the logo (it can be 500 KB). */
    design: jsonb('design').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('qr_codes_link_id_key').on(table.linkId),
    index('qr_codes_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
    index('qr_codes_user_id_campaign_id_idx').on(table.userId, table.campaignId),
    check('qr_codes_kind', sql`${table.kind} in ('url', 'whatsapp', 'social', 'file')`),
    check('qr_codes_name_len', sql`char_length(${table.name}) between 1 and 80`),
    check('qr_codes_data_len', sql`length(${table.payload}::text) + length(${table.design}::text) <= ${sql.raw(String(QR_DATA_MAX_CHARS))}`),
  ],
);

export type QrCodeRow = typeof qrCodes.$inferSelect;
