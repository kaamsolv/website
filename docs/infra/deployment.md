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
| Latest deploy | **2026-10-25** — version `c0931bfc-f60c-46a3-8212-7c6c3d58d4ea` (`main` at `133be4f`: Salary Calculator). Worker 2,334 KiB gzip. Earlier the same day: `70d615cf-4b0b-4392-b0a4-027aa0b77002` (`ad3bc9a`: PDF tools Stage 1, image converter format-switch fix, invoice Stage 2C-1; 2,329 KiB). |
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

| `0007_recurring.sql` | `invoices.recur_every`, `invoices.recur_next` (+ check, partial index `invoices_user_recur_next_idx`) | **not yet** — apply with the Stage 2C-2 deploy |

**Rolling back 0007** (Drizzle has no down migrations; run against Neon only if the deploy is reverted). Safe — the columns are additive and old code ignores them:

```sql
DROP INDEX invoices_user_recur_next_idx;
ALTER TABLE invoices DROP CONSTRAINT invoices_recur_every;
ALTER TABLE invoices DROP COLUMN recur_next, DROP COLUMN recur_every;
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
```

Operator tools (need `DATABASE_URL` for production): `npm run link:status -- <code>`
(status, clicks, reports; `disable --confirm` takes a link down) and
`npm run link:reports`.
