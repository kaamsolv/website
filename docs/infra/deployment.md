# KaamSolv — Deployment & Infrastructure

**Updated:** 2026-10-21 · Source of truth for how KaamSolv is hosted, deployed
and wired to its domain. Decision history: [`../DECISIONS.md`](../DECISIONS.md).

> Supersedes the older Vercel-based version that lived on the `url-shortener`
> branch; its Neon, secrets and migration sections are carried over in §7–§9.

---

## 1. Current state at a glance

| Concern | Setup |
|---|---|
| Source repo | **`github.com/kaamsolv/website`** (`origin`). Old repo kept as remote `kaamkit-old`. |
| Production branch | `main` |
| Hosting | **Cloudflare Workers**, worker **`kaamsolv`**, Next.js via **OpenNext** (`@opennextjs/cloudflare`) |
| Primary domain | **`kaamsolv.com`** (apex, canonical) — Worker Custom Domain |
| Secondary | **`www.kaamsolv.com`** — Worker Custom Domain, 308 → apex (`next.config.mjs` `redirects`) |
| DNS | Cloudflare zone `kaamsolv.com` (nameservers `bailey` / `cris.ns.cloudflare.com`) |
| TLS | Cloudflare (certificates issued automatically for Custom Domains) |
| Fallback URL | `https://kaamsolv.kaamsolv.workers.dev` (`workers_dev: true`; pages carry the kaamsolv.com canonical) |
| Cloudflare account | `prabhatbhatnagar@gmail.com`'s Account (`wrangler whoami`) |
| Live since | **2026-10-21** — first deploy, version `12640492-b39a-4067-ac04-c1044dfb9bda` |
| Latest deploy | **2026-10-26** — version `4a080ab6-4944-4a82-86c1-bc5dd6dd9635` (`main` at `8121ceb`: the QR "Save tracked QR" panel fix — always shown for Website, WhatsApp, Social and PDF links, disabled with a reason until the link is valid; no migration). `cf:deploy` build and analytics check passed (GA ID found in 56 client files); Worker 2,481.01 KiB gzip. **Checked on production:** panel and disabled/hint states for the four link types, no Save action for the other nine types, `/sitemap.xml` (40 URLs), `/design-system` noindex, a temporary tracked code redirected (302) to its destination and was then deleted (0 codes left), and analytics stays off before any choice and after "No thanks". **Not checked on production:** the free-limit state (needs 3 temporary codes), the signed-out sign-in prompt, and accepting analytics (it would send a real hit to GA4). Those are covered by the e2e suite only. Before it, 2026-10-26: version `866f7459-afc7-4594-af9c-f5209c8cc213` (`main` at `cd4f88b`: everything below plus GA4 consent-first analytics, `/sitemap.xml`, `/design-system` noindex; `cf:deploy` ran the analytics check). Worker 2,480.90 KiB gzip. Before it, 2026-10-26: `3f801e52-1151-4f29-9895-517cefc42c3b` (`main` at `464ec84`: QR workspace — dashboard, campaigns, analytics, exports; 2,504.84 KiB). **Both QR deploys were built from `main` before it contained the GA4 work, so each removed analytics, the sitemap and the noindex from the live site until the branch was merged; deploy only from a branch that contains `.env.production` and the analytics check.** Before it, 2026-10-25: `8866be1c-a15f-4f51-a9c5-6286ac319e96` (branch `claude/exciting-spence-025d65`: GA4, `/sitemap.xml`, `/design-system` noindex, the analytics deploy check; 2,471 KiB), and `fa2b3997-b5b5-482d-be0f-314492897c19` (`3b26220`: tracked QR codes, first slice; 2,493 KiB). Earlier the same day: `e7856b16-d2e3-40d3-8289-7c862e3bc548` (`9c89387`: invoice Stage 2C-2; 2,373 KiB), `c0931bfc-f60c-46a3-8212-7c6c3d58d4ea` (`133be4f`: Salary Calculator; 2,334 KiB), and `70d615cf-4b0b-4392-b0a4-027aa0b77002` (`ad3bc9a`: PDF tools Stage 1, image converter format-switch fix, invoice Stage 2C-1; 2,329 KiB). |
| Cache | Pre-rendered pages served from Worker static assets (`open-next.config.ts`) — no R2/KV/D1 |
| Database | **Neon Postgres**, project `kaamsolv` (`spring-wave-63290734`), **AWS ap-southeast-1 (Singapore)**, branch `production`, pooled endpoint. Neon account: the kaamsolv Gmail. Migrations `0000`–`0002` applied 2026-10-21. Used only by the URL Shortener (not yet on `main`). |
| Worker secrets | `DATABASE_URL`, `KK_IP_HASH_SALT` — set 2026-10-21 with `db/setup-production.mjs` (`cf-workers-poc` branch). `WEB_RISK_API_KEY` not set: link screening is skipped (fail-open). List names with `npx wrangler secret list`. |

Config files: [`wrangler.jsonc`](../../wrangler.jsonc),
[`open-next.config.ts`](../../open-next.config.ts).

---

## 2. Commands

| Command | Does |
|---|---|
| `npm run dev` | Normal Next.js dev server (localhost:3000) |
| `npm run cf:build` | `next build` + OpenNext bundle → `.open-next/` |
| `npm run cf:preview` | Build, then run the Worker locally in `workerd` (localhost:8787) — closest to production |
| `npm run cf:deploy` | Deploy guard, build, analytics check, then deploy the `kaamsolv` Worker (needs `wrangler login`) |

Local preview note: with Custom Domains in `wrangler.jsonc`, `wrangler dev`
rewrites every request's host to `kaamsolv.com`, so the www redirect can't be
seen at :8787. To test it: `npx wrangler dev --port 8788 --local-upstream www.kaamsolv.com`
after `cf:build`.

---

## 3. First deploy (one-off — done 2026-10-21, steps kept for a rebuild)

1. `npx wrangler login` — sign in with the Cloudflare account that owns the
   `kaamsolv.com` zone. In Windows PowerShell use `npx.cmd wrangler login`:
   the default script policy blocks `npx.ps1`. If the opened browser isn't
   signed in to Cloudflare, paste the printed link into one that is.
2. In the Cloudflare dashboard → `kaamsolv.com` → DNS, make sure there is **no**
   existing `A`/`AAAA`/`CNAME` record for `kaamsolv.com` or `www` (parking
   records block Custom Domains). Delete only placeholder records.
3. `npm run cf:deploy`. Wrangler creates the Worker, both Custom Domains, their
   DNS records and certificates.
4. Check: `https://kaamsolv.com`, `https://kaamsolv.com/qr-code-generator`,
   `https://www.kaamsolv.com/x` → 308 to the apex.
5. Cloudflare → SSL/TLS → Edge Certificates: turn on **Always Use HTTPS**.
   **Pending** — until then `http://kaamsolv.com` serves the page instead of
   redirecting.

Verified live on 2026-10-21: `/`, `/qr-code-generator`, `/icon.svg` → 200;
unknown path → 404; `www.kaamsolv.com/*` → 308 to the apex with path and query.
A local router that cached the apex before its records existed may hand out
only IPv6 answers for a while; check with
`curl --doh-url https://1.1.1.1/dns-query https://kaamsolv.com/`.

## 4. Ongoing deploys

Either run `npm run cf:deploy` from a clean `main` (the deploy guard below enforces the "clean" and "main" part), or connect the repo once in
**Workers & Pages → kaamsolv → Settings → Builds** (Workers Builds):

- Git repository: `kaamsolv/website`, production branch `main`
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

`NEXT_PUBLIC_GA_ID` is inlined **while the build runs**. It lives in the committed
`.env.production` (a public ID, not a secret), which `next build` reads, so every
build picks it up: `npm run cf:deploy` from any checkout, and Workers Builds. A shell
variable (or, for Workers Builds, a build variable under Settings → Builds → **Build
variables and secrets**, not the runtime "Variables and secrets") overrides it. After
the build, `npm run cf:deploy` runs `scripts/check-analytics-build.mts`, which stops
the deploy unless the resolved ID is actually in the built client files. Workers Builds
runs `npx opennextjs-cloudflare build/deploy` directly and so skips that check; rely on
`.env.production` there and run the post-deploy check in `docs/ANALYTICS.md`.

### Deploy guard

`npm run cf:deploy` first runs `scripts/check-deploy-branch.mts` (before the slow build). A deploy ships whatever is in the checkout, and twice a deploy quietly removed live features because the checkout lacked work that was already on `main`. The guard refuses unless:

1. the checkout **contains everything on `origin/main`** (it fetches `origin/main` first; if it can't, it stops),
2. the commit is **on GitHub** (pushed to any branch), so production never runs code that exists only on one machine,
3. **nothing that gets built differs from that commit**: no edited, staged or untracked files outside `CLAUDE.md`, `AGENTS.md`, `.claude/`, `docs/`, `tests/`, `README.md`.

It passes on a feature branch that already contains `main` and is pushed — it can't tell whether that branch has been merged *to* main, so merge (or open the PR) before or right after such a deploy, or `main` and production drift apart. For a deliberate exception (e.g. rolling back to an older commit): `KK_DEPLOY_OVERRIDE="reason"` — the reason is printed and nothing else is checked. **Workers Builds (git-connected) and a bare `opennextjs-cloudflare deploy` do not run the guard.** Tests: `test/deploy-guard.test.mts` (real throwaway git repos).

### Security headers

`next.config.mjs` (`securityHeaders`) sends, on every route the Worker handles (pages, API, 404s, `robots.txt`, `sitemap.xml`): `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`/`preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: frame-ancestors 'self'; base-uri 'self'; object-src 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that switches off camera, microphone, geolocation, USB and Bluetooth (no tool uses them).

- Checked against a local Worker build (`wrangler dev --local`): every route above returned all six. Not checked on production until deployed.
- **Not covered:** static asset files under `/_next/static/*` are served straight from Cloudflare's asset store, not the Worker, so they don't carry these headers (their `Content-Type` is correct).
- **Deliberately not done:** a `script-src` Content-Security-Policy. It needs a nonce per request, which would end static pre-rendering, and must allow Google Analytics and (later) Razorpay. Revisit as its own decision; `form-action`, `COOP` and `includeSubDomains` also need their own testing (Google sign-in, Razorpay popups, subdomains such as `send.`).
- `robots.txt` comes from `app/robots.ts`: everything crawlable except `/app/` and `/api/`, plus the `Sitemap:` line. Cloudflare may prepend its own managed content-signal comments at the edge.

Rollback: Workers & Pages → kaamsolv → Deployments → roll back to a previous
version (instant), or `npx wrangler rollback`.

Before merging to `main`: `npm run typecheck && npm test && npm run cf:build`.

---

## 5. Old domain

`kaamkit.com` was served by Vercel (Cloudflare DNS-only). Not changed by this
setup. Decide separately whether it should 301 to `kaamsolv.com`.

## 6. Not set up yet

- CI (GitHub Actions: typecheck, tests, `cf:build` on PRs).
- Cloudflare WAF / rate-limiting rules (now possible — traffic is proxied).
- Analytics (GA4, Search Console for `kaamsolv.com`).

---

## 7. URL Shortener — how a short link is served

`kaamsolv.com/{shortCode}` is a Next.js Route Handler (`app/[shortCode]/route.ts`)
running inside the same `kaamsolv` Worker.

- Static routes win over the dynamic `[shortCode]` segment, so every real page
  (`/qr-code-generator`, `/png-to-jpg`, …) is safe. The image converters are
  static folders for exactly this reason.
- `app/lib/reserved-routes.ts` is the second guard: reserved words can never
  become short codes.
- The handler looks the code up in Neon (`db/links.ts`) and returns `302` for an
  active link, `404` for an unknown or reserved code, or redirects to
  `/link-unavailable?reason=disabled|expired`. Clicks are recorded best-effort via
  `after()`, so analytics never slow the redirect.
- On Workers the click country comes from `cf-ipcountry` and the client IP from
  `cf-connecting-ip` (`app/lib/runtime-platform.ts` detects the host).

## 8. Secrets & environment variables

Worker secrets (`npx wrangler secret put NAME`, list with `npx wrangler secret list`).
Local dev needs none of them — see [`.env.example`](../../.env.example).

| Variable | Status | Purpose |
|---|---|---|
| `DATABASE_URL` | **set** (2026-10-21) | Neon pooled connection string. On a production server a missing value fails loudly; locally its absence selects PGlite. |
| `KK_IP_HASH_SALT` | **set** (2026-10-21) | Salt for every caller hash (`SHA-256(ip + salt)`): rate limits, `links.created_ip_hash`, `link_reports.reporter_ip_hash`. Changing it resets rate-limit windows. |
| `WEB_RISK_API_KEY` | not set | Optional Google Web Risk key for destination screening. Unset → screening skipped (fail-open, logged once). Needs a Google Cloud project with billing; free to 100k lookups/month. |
| `NEXT_PUBLIC_SITE_URL` | not set | Optional canonical base; defaults to `https://kaamsolv.com`. |
| `BETTER_AUTH_SECRET` | **to set** (accounts) | Signs session cookies and encrypts auth data. Required in production — a missing value fails loudly. Long random string (`openssl rand -base64 48`). Changing it signs everyone out. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **to set** (accounts) | Google OAuth web client. The "Continue with Google" button appears only when both are set. Redirect URI: `https://kaamsolv.com/api/auth/callback/google`. |
| `RESEND_API_KEY` | **to set** (accounts) | Sends sign-in links from `login@send.kaamsolv.com`. Missing in production → logged, email not sent. |
| `NEXT_PUBLIC_GA_ID` | **to set** (analytics) | GA4 Measurement ID (`G-…`, not a secret). **Build-time**, and **set** in the committed `.env.production` (2026-10-25), so no Worker secret or deploy-time variable is needed. A shell variable overrides it for one build. Unset → no analytics code runs. `cf:deploy` verifies it reached the build. See [`../ANALYTICS.md`](../ANALYTICS.md). |
| `BETTER_AUTH_URL` | not set | Optional; defaults to `https://kaamsolv.com` in production, `http://localhost:3000` in dev. |

**Never** set `KK_E2E` or `KK_E2E_SECRET` as Worker secrets — they unlock the
test-only sign-in route (`app/lib/e2e-gate.ts`). Check with
`npx wrangler secret list` before each deploy that adds secrets.

A secret takes effect immediately: `wrangler secret put` rolls out a new Worker
version with the same code.

## 9. Database migrations

- Schema: Drizzle ORM ([`db/schema.ts`](../../db/schema.ts)); migrations in
  `db/migrations/` (SQL + `meta/`), committed.
- `npm run db:generate` — write a new migration from `db/schema.ts` (no DB needed).
- `npm run db:migrate` — apply pending migrations: to Neon when `DATABASE_URL` is
  set, else to local PGlite (`.pglite/`). **On Neon this runs statement by statement and is not atomic** —
  fine for a tiny migration on a throwaway branch, not for production (see "Applying a migration to production").
  **It also reads `.env.local` and `.env` when `DATABASE_URL` isn't already set, and has no `--expect-host` check** — so never run it
  anywhere a production connection string is in scope. (`db:migrate:atomic` and `db:rehearsal:prepare` read no `.env` file and refuse
  to contact anything until the host you typed matches.)
- `npm run db:migrate:atomic` — Neon only: applies pending migrations and their journal rows as **one transaction**;
  dry run unless `--confirm`. Use this for production.
- **Production migrations are a manual, deliberate step**, never part of the
  build. For the first setup `db/setup-production.mjs` did migrations + secrets in
  one go (it asks for the connection string with hidden input). For later
  migrations, run `npm run db:migrate:atomic` with `DATABASE_URL` set only for that
  command — don't leave the production string in `.env.local`.

| Migration | Creates | Neon production |
|---|---|---|
| `0000_powerful_masque.sql` | `link_status` enum, `links` | applied 2026-10-21 |
| `0001_aberrant_medusa.sql` | `device_class` enum, `click_events` | applied 2026-10-21 |
| `0002_yellow_arachne.sql` | `report_reason` enum, `rate_limits`, `link_reports`, `links.screened_at` | applied 2026-10-21 |
| `0003_accounts.sql` | `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`, `plans`, `plan_features` (+ seed), `subscription_provider` enum, `subscriptions`, `business_profiles`, `invoices` | applied 2026-10-21 |
| `0004_workspace.sql` | `customers`, `items`, `invoice_status` enum; Settings columns on `business_profiles`; `invoices.status/paid_at/due_date/customer_id`; plan seed (customers 3 free, items free, dashboard/fx Pro); due-date backfill | applied 2026-10-22 |
| `0005_gst_invoice.sql` | `business_profiles.composition`, `business_profiles.signature` (size-capped) | applied 2026-10-22 |
| `0006_pro_design_quotes.sql` | `invoices.kind` (+ index, check); `business_profiles.quote_prefix`, `quote_next_number`, `default_template`, `default_brand_color` | applied 2026-10-25 (before the Stage 2C-1 deploy) |

| `0007_recurring.sql` | `invoices.recur_every`, `invoices.recur_next` (+ check, partial index `invoices_user_recur_next_idx`) | applied 2026-10-25 (before the Stage 2C-2 deploy) |

**Rolling back 0007** (Drizzle has no down migrations; run against Neon only if the deploy is reverted). Safe — the columns are additive and old code ignores them:

```sql
DROP INDEX invoices_user_recur_next_idx;
ALTER TABLE invoices DROP CONSTRAINT invoices_recur_every;
ALTER TABLE invoices DROP COLUMN recur_next, DROP COLUMN recur_every;
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
```

| `0008_qr_tracking.sql` | `qr_codes`; `links.account_id` FK → `auth_users` (cascade); seed `free_account` → `qr_dynamic` 3, plan `qr_pro` | applied 2026-10-25 (before the tracked-QR deploy) |

**Rolling back 0008** (only if the deploy is reverted; the schema is additive and old code ignores it):

```sql
DROP TABLE qr_codes;
ALTER TABLE links DROP CONSTRAINT links_account_id_auth_users_id_fk;
DELETE FROM plan_features WHERE feature_key = 'qr_dynamic';
DELETE FROM plans WHERE plan_key = 'qr_pro';
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
```

Dropping `qr_codes` first leaves any tracked links in `links` as ordinary links that keep redirecting; delete them too if you want them gone (`DELETE FROM links WHERE account_id IS NOT NULL;`, which also removes their clicks).

| `0009_qr_campaigns.sql` | `qr_campaigns`; `qr_codes.campaign_id` (FK, ON DELETE SET NULL); the `qr_codes_enforce_limit` trigger (per-user lock, so the QR limit holds under simultaneous saves); seed `qr_pro` → `qr_campaigns`, `qr_breakdowns`, `qr_export` | applied 2026-10-26 (before the QR-workspace deploy) |

**Rolling back 0009** (only if the deploy is reverted; additive, old code ignores it):

```sql
DROP TRIGGER qr_codes_enforce_limit ON qr_codes;
DROP FUNCTION qr_codes_enforce_limit();
ALTER TABLE qr_codes DROP COLUMN campaign_id;
DROP TABLE qr_campaigns;
DELETE FROM plan_features WHERE feature_key IN ('qr_campaigns', 'qr_breakdowns', 'qr_export');
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
```

Dropping the column ungroups every code; no code, link or scan is touched. Dropping the trigger removes the database-level QR limit, so the app's own check (which still runs) is the only guard until 0009 is re-applied.

| `0010_invoice_payments.sql` | `invoice_payments` (the payment ledger), `invoice_payment_events` (its audit trail), `invoices.amount_paid` (+ check); the ledger triggers (`invoice_payments_sync`, `_after_insert`, `_guard`, `_after_update`, `invoices_ledger_guard`); seed `invoice_payments` on `free_account` and `invoice_pro` | **not applied** — apply with `npm run db:migrate:atomic` (not `db:migrate`) a few minutes before the deploy that uses it (the new code reads `invoices.amount_paid`); see "Applying a migration to production" below |

Applying 0010 changes no existing row: every invoice keeps its `status`; invoices already `paid` keep it with `amount_paid = 0` (shown as "Marked paid" — no payments on record; nothing is backfilled). The schema is additive and the Worker that is live today does not read the new column or tables — **with one exception**: its Pro **Mark paid** button (`PUT /api/invoices/:id/status`) sets `status = 'paid'` directly, and once 0010 exists the ledger trigger `invoices_ledger_guard` refuses that for any invoice that has no payments (`invoice_unsettled`). The old code doesn't handle that error, so **Mark paid fails with a server error between applying 0010 and deploying the new Worker** — and again after a Worker-only rollback. Nothing is written when it fails. The new Worker replaces the button with recording a payment. Only Pro (`invoice_dashboard`) accounts see the button, and Pro is granted by hand today, so the exposure is small, but keep the gap between migrating and deploying to minutes. The old Worker's save also fails with a server error (rather than a friendly message) if an edit would take an invoice's total below what was received.

**Rolling back 0010.** Two different things:

1. **Roll back the Worker version only** (`npx wrangler rollback`). The schema stays, **every recorded payment and its history is kept**, and the old Worker simply doesn't show them. Side effects while the old Worker is live: the Pro Mark paid button fails (above); invoices show the `status` the ledger last gave them, so a partly paid invoice reads "unpaid" and the old dashboard counts its full total as owed (it doesn't know about `amount_paid`); new payments can't be recorded. This is the normal rollback.
2. **Roll back the database** (the SQL below). This **permanently destroys the payment ledger and its audit history — every payment, void and note recorded since 0010 was applied — and `invoices.amount_paid`.** Invoices keep the `status` the ledger last gave them, but the amounts received are gone, and there is no undo except a Neon restore point, which also discards everything else every user saved since that point. Run it only if the tables must go, only after exporting `invoice_payments` and `invoice_payment_events` (`COPY … TO …` or the Neon console), and only with the owner's explicit approval. If no payment has been recorded yet it loses nothing.

```sql
DROP TRIGGER invoices_ledger_guard ON invoices;
DROP FUNCTION invoices_ledger_guard();
DROP TABLE invoice_payment_events;
DROP TABLE invoice_payments;
DROP FUNCTION invoice_payments_after_update();
DROP FUNCTION invoice_payments_after_insert();
DROP FUNCTION invoice_payments_guard();
DROP FUNCTION invoice_payments_sync(uuid);
ALTER TABLE invoices DROP CONSTRAINT invoices_amount_paid;
ALTER TABLE invoices DROP COLUMN amount_paid;
DELETE FROM plan_features WHERE feature_key = 'invoice_payments';
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
```

After the SQL above, invoices keep the `status` the ledger last gave them (a fully paid one stays `paid`; a partly paid one reads `unpaid`), but the amounts received are gone with the tables.

### Applying a migration to production (atomic runner)

**Why not `npm run db:migrate`.** Production uses Neon's HTTP driver, which has no multi-statement transactions, and drizzle's `neon-http`
migrator sends **every statement as its own request and writes the journal row only after all of them have run**. Migration 0010 is 23
statements (tables, five plpgsql functions, four triggers, a seed). If one fails, or the connection drops, the earlier statements stay
committed, there is no journal row, and a re-run stops at the first `CREATE TABLE … already exists` — leaving a half-applied ledger to clean up
by hand. (`test/atomic-migration.test.mts` reproduces exactly this.)

**`npm run db:migrate:atomic`** (`db/migrate-atomic.mts`; logic and tests in `db/atomic-migration.ts` / `test/atomic-migration.test.mts`) sends the
pending migrations' statements **and their journal rows as one Neon HTTP transaction**. If the database reports an error, the whole transaction rolls back; if the
connection is lost before an answer arrives, whether it committed is **unknown** and the tool says so. That atomicity is Postgres's and
Neon's batch behaviour: it is demonstrated on PGlite (below) and **has not yet been confirmed against Neon** — step 4 is where it is. It reads the same
files, splits them the same way, writes the same journal row (`hash`, `created_at`) as drizzle, so `db:migrate` afterwards sees an up-to-date database
(proved on PGlite for 0010 and for a from-scratch build). It refuses to run on a database whose journal doesn't match the checkout (a different journal time, or different content). A row whose hash matches this file with LF or with CRLF line endings counts as the same migration, with a note — git on Windows changes line endings between checkouts, and drizzle itself ignores the hash — but any other difference stops it. Without `--confirm`
it is a **read-only dry run**; applying also needs `--confirm --restore-point-taken`. **It never chooses a target for you:** `DATABASE_URL` must be set in the environment of
that one command (no `.env` file is read, so a production string left in `.env.local` is never picked up), and `--expect-host <host>` — typed by you, every time, dry run included —
must equal that URL's host or nothing is contacted. It prints the host only, and every error it prints is one line — name, code, message — scrubbed of the connection string and
password; an error that escapes is caught and printed the same way, never as Node's dump of the error object (which for an invalid URL contains the whole string).

**Timeouts, and a second operator.** The transaction starts with `SET LOCAL lock_timeout` (default **5 s**) and `SET LOCAL statement_timeout` (default **60 s**) — before anything that changes the schema, and
undone when the transaction ends — so an `ALTER TABLE` that cannot get its lock (a long query on `invoices`, say) fails and rolls back instead of queueing and stalling the app behind it. Change them
deliberately with `--lock-timeout-ms` (500–120000) and `--statement-timeout-ms` (5000–1800000); anything else is refused (0 would mean "wait forever" to Postgres). They are conservative choices, **not
measurements, and not validated on Neon**; a larger table may need more. A timeout the database reports (SQLSTATE 55P03 or 57014) is a confirmed rollback; one the client or a gateway gives up on carries
no such code and stays "outcome unknown". PGlite enforces neither timeout and has one session, so the tests prove only that the two settings come first, are local to the transaction, are bounded, and that a timeout-shaped
failure part-way leaves nothing behind — not that a timeout fires. Next the transaction takes an advisory lock and, before changing anything, checks that the journal still has exactly the number of rows the plan was made from, so a
second operator's stale plan fails with `migration_state_changed` (a confirmed rollback) instead of applying a migration twice — without that check, a migration with no DDL in it *would* be applied twice (a test shows it).
**Even so, run it from one terminal at a time.**
**Exit codes:** 0 = done, dry run, or nothing to apply · 1 = refused, or the apply failed (the message says whether it was rolled back or the outcome is unknown) · 3 = the migration was applied and committed but
reading the journal back afterwards failed — it was **not** rolled back; run the dry run before doing anything else. A refusal never says what the host is: that answer has to come from you.

**Procedure — none of this has been run against production; each step waits for the owner's go-ahead.**

1. **Branch**: deploy only from a branch that contains the latest `main` and `.env.production` (earlier deploys from older branches removed analytics).
   `npm run typecheck && npm test && npm run cf:build`; `npx playwright test`.
2. **Restore point**: create a Neon restore point (or branch) of `production` and note the time. Confirm the restore window your Neon plan allows.
3. **Read-only check**: `DATABASE_URL=<production> npm run db:migrate:atomic -- --expect-host <production host>` (dry run). Expect "Applied 10 of 11. Pending: 1 (0010_invoice_payments)". Anything else — stop.
4. **Rehearse on a brand-new, empty, non-production Neon database** — a new Neon project, never a branch of production or any data copy. Nothing here has been run yet; it needs the
   owner's go-ahead and the database. In a fresh PowerShell, from the repo root (the connection string lives only in that session — do not paste it anywhere; delete the project's rehearsal role afterwards):

   ```powershell
   $env:DATABASE_URL = '<the rehearsal database URL>'
   $h = (npm run --silent db:host)               # the host only — from the same parser the tools use. "unset" or "unreadable": stop and fix DATABASE_URL.
   if ($h -in 'unset','unreadable') { throw 'fix DATABASE_URL first' }
   # a. Build production's state before 0010, the way production got it (drizzle, statement by statement). Dry run first.
   npm run db:rehearsal:prepare -- --expect-host $h --non-production
   npm run db:rehearsal:prepare -- --expect-host $h --non-production --confirm      # expect: 10 migrations applied and recorded
   # b. The atomic runner: dry run (expect "Applied 10 of 11. Pending: 1"), then apply.
   npm run db:migrate:atomic -- --expect-host $h
   npm run db:migrate:atomic -- --expect-host $h --confirm --restore-point-taken      # expect: Committed: 0010_invoice_payments
   # c. Again: a no-op ("Applied 11 of 11", nothing pending).
   npm run db:migrate:atomic -- --expect-host $h
   # d. Concurrent payments, duplicate submissions, racing edits; then the reconciliation and audit sweeps.
   npx tsx scripts/rehearse-payments.mts --expect-host $h --non-production --rounds 20
   Remove-Item Env:DATABASE_URL
   ```

   A password with special characters must be **percent-encoded** in the URL (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `?` → `%3F`) — Neon's own connection strings are. A raw `#`, `/` or `?` ends the host part early;
   `db:host` then prints `unreadable` rather than a piece of the password, and the tools refuse. `--through` (default `0009`) takes a four-digit number or a full migration name — nothing looser.
   What protects against a wrong target: `DATABASE_URL` must be in that command's environment (no `.env` file is read); `--expect-host` must match its host and `--non-production` must be given, every time, before anything is
   contacted (a host given as a bare argument, or a flag with no value, does not count); `prepare` refuses any database that already has a table or a recorded migration (production has both); the payments rehearsal refuses any
   database in which **any application table** (users, sessions, customers, items, invoices, payments, QR codes, **short links, click events, reports, rate-limit counters**) has a row — only the seeded `plans` / `plan_features` may — and
   needs migration 0010 applied. The table list comes from the system catalogs (`pg_class`), not `information_schema`, because the latter shows only tables the connecting role has privileges on and would make a populated database look empty;
   a table the role cannot read, or one with row-level security, is treated as *not proved empty* and refused. Every non-system schema is checked, not only `public`; only the seeded `public.plans` / `public.plan_features` and drizzle's own journal may hold rows. A platform schema on a brand-new Neon project that holds rows
   would be refused and named in the message — whether that happens is unverified until a rehearsal database exists. Errors print as one scrubbed line (see above).
   `--non-production` is the operator's statement; the emptiness checks are the backstop for a mistake, not a substitute for creating the database fresh.
   If a rehearsal run is killed part-way its synthetic user stays; the next run then refuses — delete it **on the rehearsal database only**:
   `DELETE FROM auth_users WHERE email LIKE 'rehearsal-%@example.test';` (cascades to its invoices and payments).
   **Rehearsed 2026-10-27** on a throwaway Neon project (PostgreSQL 18.6, us-east-2, pooled endpoint; a throwaway database, not production) — see DECISIONS.md. **Proven on real Neon:** a statement timeout and a lock timeout both fire inside the HTTP
   transaction, with SQLSTATE 57014 and 55P03 on the error (so `classifyFailure` calls them confirmed rollbacks); `SET LOCAL` does not outlive the transaction; the atomic runner accepts the journal rows drizzle wrote; a real failed apply (a
   planted trigger makes 0010 fail at its second-to-last statement, with a `42710` error) rolls back COMPLETELY — no tables, column, functions, plan rows or journal row; the real apply, with the advisory lock, the journal guard and the timeouts, commits
   0010 and its journal row in one transaction (3.8 s on an empty database); repeat runs are no-ops, and so is drizzle's own migrator; and 20 rounds of the payment harness (720 requests released together) pass with no unexpected error.
   **Still unproven:** lock times on a production-sized `invoices` table; the stale-plan guard firing on Neon (proved on PGlite only); production's own Postgres version and settings; the legacy Worker (pre-0010 code) against the migrated schema;
   the app's pages on a migrated database. **A first run of the harness found a real defect** — Neon aborted payments with deadlocks (40P01) when many hit one invoice at once, which PGlite can never show — fixed in `insertPaymentStatement`
   (db/payments.ts; see "Concurrent payments" in invoice-generator.md). A clean 20-round pass after a fix for a problem that appeared in 2 of 20 rounds is good evidence, not a guarantee; run more rounds (`--rounds 60`) for more.
   The harness repeats every scenario
   (`--rounds`, default 10), releases each scenario's requests together at a start barrier, and reports how many requests it made and in how many rounds every request was in flight at the same moment — measured in the client process. That is
   necessary for a race and is **not proof of one**: it cannot see inside the database, so no run is reported as "a race occurred". Any deadlock, serialization failure, timeout, payment refused for a reason other than "more than is owed",
   or unrecognised error fails the run even when every total reconciles (proved locally with `--inject-fault`, which exists only for `--local` and is refused against a real database). It does not run any Worker; the legacy-Worker check is a separate local drill (pre-0010 code against the migrated rehearsal database).
5. **Apply**: `npm run db:migrate:atomic -- --confirm --expect-host <production host> --restore-point-taken`, **immediately before step 6** (see the Mark paid note above).
6. **Deploy** the Worker: `npm run cf:deploy`.
7. **Validate** (read-only SQL):

```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;                       -- 11
SELECT to_regclass('public.invoice_payments'), to_regclass('public.invoice_payment_events');   -- both non-null
SELECT count(*) FROM invoice_payments;                                   -- 0 straight after migrating
SELECT count(*) FROM invoices WHERE amount_paid <> 0;                    -- 0
SELECT count(*) FROM pg_trigger WHERE tgname IN ('invoice_payments_guard','invoice_payments_ai','invoice_payments_au','invoices_ledger_guard');  -- 4
SELECT count(*) FROM plan_features WHERE feature_key = 'invoice_payments';  -- 2
SELECT count(*) FROM invoices WHERE status = 'paid' AND amount_paid = 0;    -- every invoice that was already paid: "Marked paid"
```

   Then in the app: record a payment on a test invoice, void it, open Payments & collections, download one report, check `/api/dashboard`.
8. **If the command fails, read what it says.** An error the database itself reports (it has a Postgres error code) means the transaction was rolled back as a whole and nothing changed. Anything else — a dropped
   connection, a gateway timeout, an unreadable answer — means the outcome is **unknown**: do **not** re-run with `--confirm`; run the dry run again. The journal is written in the same transaction as the schema,
   so "Applied 11 of 11" means it committed and "Applied 10 of 11" means it did not.

| Situation | Do | Consequence for data |
|---|---|---|
| The new Worker misbehaves | `npx wrangler rollback` (instant) | None — schema and payments stay. Old "Mark paid" fails until the new Worker is back. |
| It misbehaves after users have recorded payments | Worker rollback only; leave the schema | Payments and history are **kept**, invisible to the old Worker; partly paid invoices read "unpaid". |
| The tables must go | The SQL block under "Rolling back 0010", after exporting both tables, with the owner's approval | **Every payment and its history recorded since is destroyed.** |
| Restore from the Neon restore point | Last resort | Discards **all** users' writes since the restore point, not just payments. |

Operator tools (need `DATABASE_URL` for production): `npm run link:status -- <code>`
(status, clicks, reports; `disable --confirm` takes a link down) and
`npm run link:reports`.
