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
| `npm run cf:deploy` | Build and deploy the `kaamsolv` Worker (needs `wrangler login`) |

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

Either run `npm run cf:deploy` from a clean `main`, or connect the repo once in
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
  set, else to local PGlite (`.pglite/`).
- **Production migrations are a manual, deliberate step**, never part of the
  build. For the first setup `db/setup-production.mjs` did migrations + secrets in
  one go (it asks for the connection string with hidden input). For later
  migrations, run `npm run db:migrate` with `DATABASE_URL` set only for that
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

Operator tools (need `DATABASE_URL` for production): `npm run link:status -- <code>`
(status, clicks, reports; `disable --confirm` takes a link down) and
`npm run link:reports`.
