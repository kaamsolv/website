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
| Latest deploy | **2026-11-14** - version `6722de5b-9001-4f6f-b2e0-a205e077f196` (`feat/affiliate-phase2` at `a2c4bcf`: **Affiliate Manager Phase 3A**, referral links `kaamsolv.com/{business}/{code}` and recorded clicks, privacy and terms wording). **Migration 0022 applied to production** with the atomic runner (journal 23 of 23) after Neon restore-point branch `pre-affiliate-3a-b`. **Release lesson:** the first apply went to the wrong database. After a new Neon branch is created the console switches to it, so the string copied next belonged to the restore-point branch, not production; production was untouched, the live referral route answered 500 (relation missing) and was fixed within minutes by migrating the right database. Before copying a string, read which branch the console selector shows, and check the host against the Worker's database. Checked on production: unknown code and unknown business 404, `no-store` on the route, privacy and terms 200, portal 200, home 200; staging earlier passed 14/14 and 17/17 (Cloudflare preview). Razorpay is still in **TEST** mode. |
| Previous deploy | **2026-11-14** - version `8a6bde62-83c3-4999-92da-fdf6c2511962` (`main` at `be1171b`: **Affiliate Manager**, Phases 1 and 2: merchant portals at `/affiliate/{slug}`, applications and approvals, launch safeguards, privacy and terms sections). **Migrations 0018 to 0021 applied to production first**, in one transaction with the atomic runner (journal 22 of 22), after a Neon restore-point branch (`pre-affiliate-2026-11-14`). Deployed straight after. **Checked on production:** privacy 200 with the new section; an unknown portal and its report page 404; `/app/affiliate` signed out redirects to sign-in; sitemap and robots 200 and unchanged; then one real application end to end (apply, approve, three emails) by the owner. The first merchant (Wandernest Tales) was granted plan `affiliate_manager` with `account:grant`. **The production database password was rotated the same day** and the Worker secret `DATABASE_URL` replaced (the old one had been shown in a screenshot); a first attempt left a wrong value in the secret, which the Worker log named plainly, and the site recovered on the second. Razorpay is still in **TEST** mode. |
| Earlier deploy | **2026-11-14** - version `92c417af-bf4e-4a36-8cec-de5e60b8ed5f` (`main` at `e6986a4`: **recent and most-used tools**: a slim bar under the header on the home page and `/tools`, kept on the visitor's device, plus "Recent" first in the search box). **No migration, no dependency, wrangler or env change.** Deploy guard and analytics check passed (GA ID in the build, and found in a live client chunk afterwards); Worker 3,097.88 KiB gzip, startup 25 ms. Razorpay is still in **TEST** mode. **Checked before deploy:** typecheck, 1,035 unit tests, the full browser suite on port 3000 (533 passed, 13 skipped, 0 failed) and the Cloudflare build. **Checked on production:** `/`, `/tools`, `/coupon-code-generator`, QR, invoice, merge, `/pdf-tools`, GST, privacy, sitemap, robots and login return 200; `/app` redirects to sign-in; billing status signed out 401; webhook bad signature 400; `www` 308 to the apex; all six security headers; the bar's reserved space and its script are in the home and `/tools` HTML and the space is absent from a tool page; the old home row is gone; the privacy page has the new line; and in a real browser (storage seeded, then removed again) the bar sat directly under the header with 12 chips on one scrolling line (44px, no sideways scroll), the switch panel opened with Recent and Most used, and the close button hid it. **Not checked on production:** a real phone or phone width on the live site, a screen reader, Google indexing. Rollback: `npx wrangler rollback` (no schema change to undo). Before it, **2026-11-13 (later)** - version `18bc1ced-e3e6-41ff-91ff-ba32ec70389f` (`main` at `3c1bc67`: **Coupon Code Generator** `/coupon-code-generator`, Phase 1 of the Coupons plan: free, in the browser, no account; Business catalogue entry and the search phrase "Make coupon codes"). **No migration, no dependency, wrangler or env change.** Deploy guard and analytics check passed (GA ID in the build, and found in a live client chunk afterwards); Worker 3,095.34 KiB gzip, startup 22 ms. Razorpay is still in **TEST** mode. **Checked before deploy:** typecheck, 1,016 unit tests, the full browser suite (508 passed, 13 skipped, 0 failed) and 20 coupon browser tests including 375 / 360 / 320 px in light and dark. **Checked on production:** `/coupon-code-generator` 200 with the right title, canonical, FAQPage and Breadcrumb JSON-LD and all six security headers; it is in the sitemap and on `/tools`; `www` 308 to the apex; `/`, `/pdf-tools`, QR, invoice, merge, GST, login and robots return 200; `/app` redirects to sign-in; billing status signed out 401; webhook bad signature 400; and in a real browser the page showed 100 codes and a typed prefix was applied to them. **Not checked on production:** a CSV or TXT download (not clicked on the live site), copy to the clipboard, a real phone, Google indexing. Rollback: `npx wrangler rollback` (no schema change to undo). Before it, **2026-11-13** - version `64af742a-4f58-4064-b8c3-5ec3dd9c26e8` (`main` at `fe96979`, PR #2 fast-forwarded with all 19 commits kept: the PDF suite (14 tools) and the `/pdf-tools` redesign, UI 2.0 homepage, Products menu, workspace shell and menu, QR Pro page, share rows, the polish pass, search by task, homepage products ordered QR / Invoice / PDF, and the QR square-module fix). **No migration, no dependency, wrangler or env change.** Deploy guard and analytics check passed (GA ID found in 31 client files); Worker 3,078.01 KiB gzip, startup 27 ms. Razorpay is still in **TEST** mode. **Checked on production:** `/`, `/pdf-tools`, `/qr-code-generator`, `/invoice-generator`, `/tools`, `/merge-pdf`, `/pdf-to-jpg`, `/heic-to-jpg`, `/gst-calculator`, `/sitemap.xml`, `/robots.txt`, `/login`, `/terms` and `/refund-policy` return 200; `/app` and `/app/products/qr` redirect to sign-in; billing status signed out 401; webhook bad signature 400; `www` 308 to the apex; all six security headers; the homepage placeholder and the hero order (QR, Invoice, PDF) are live; and in a real browser the search "i want to make an invoice" lists "Make an invoice" first. **Not checked on production:** signed-in flows, a payment, phone browsers, a real phone QR scan, Google indexing. Rollback: `npx wrangler rollback` (instant, no schema change to undo). Before it, **2026-11-04 (evening)** - version `534fd95b-62fb-4dcf-9c7a-930ce4f2f5b0` (`main` at `ce57fcc`: **EMI Calculator upgrade**: sliders, prepayment with both outcomes, how much can I borrow, share link, "i" help). Guard and analytics check passed; no migration. **Checked on production:** EMI, HRA, SIP and Salary pages return 200; a shared link (`?a=5000000&r=9&y=20&x=10000`) opens the EMI page filled in showing EMI 44,986.30, 12 years 10 months and interest saved 23,65,745.99; canonical unchanged; no sideways scroll at desktop width. **Not checked:** phone browsers, Google indexing. Before it, **2026-11-04 (later)** - version `82e6ba8a-1128-413b-9db8-8e819e0bc408` (`main` at `9847a89`: **HRA Calculator** `/hra-calculator`, 320px slider-label fix, CLAUDE.md sections 47-50). Guard and analytics check passed; no migration. **Checked on production:** the page, Salary, Rent Receipt, SIP and EMI pages return 200, the page is in the sitemap, security header present, and in a browser the default answer is 17,000 a month, Bengaluru is in the city list at the 50% cap (25,000), 8 info buttons, no sideways scroll at 1024px. **Not checked:** other rules details beyond Rule 279 (Gazette PDF not opened in full), phone browsers, Google indexing. Note: this deploy was cherry-picked onto `main` because the working copy was on branch `skills/ux-review-v1`, which holds the two research skills and is not merged or pushed. Before it, **2026-11-04** - version `ab0491bc-7952-4ee5-9d26-c81df2f6d316` (`main` at `ddb5464`: SIP, FD, RD, simple and compound interest calculators, SIP vs FD vs RD page, value-adds, sliders/chart UI, share card, richer SEO). Guard and analytics check passed; no migration. **Checked on production:** the five calculators and the compare page return 200, a shared link (`?a=7500&y=12`) returns 200, the compare page is in the sitemap, security headers present. **Not checked:** the filled-in link in a real browser on production, WhatsApp share on a phone, Google indexing. Before it, **2026-11-01** — version `97af30f1-c4e9-40af-8f19-c090103c2f72` (`main` at `646efbc`: billing M1–M3, Terms paid-plans section, `/refund-policy`, GST-inclusive prices, Plans & billing menu link). Migrations 0011–0013 were applied first (same day). Worker 2,981 KiB gzip (Cloudflare's new 64 MiB limit; the old 3 MB gzip limit no longer applies), startup 21 ms, cron `*/15 * * * *` registered. Razorpay is in **TEST** mode (test keys, test webhook). **Checked on production:** Terms, refund page, tools, login, `/app/billing` (redirects to sign-in), webhook bad signature 400, drain without secret 403, billing status signed out 401, junk invoice link 404; and in test mode a netbanking payment captured, the plan switched on, invoice INV-0001 was emailed and opened, and a signed `refund.processed` message ended the plan. **Not checked:** a card payment (Razorpay test cards must be domestic), a refund made from Razorpay itself (its test refund failed with "invalid request sent"), live-mode payments, the scheduled retry firing, the receivables summary email. Before it, **2026-10-27** — version `fc088214-e77a-45d5-8632-bafa9f00d2f1` (`main` at `a24e38a`: **Rent Receipt Generator**, `/rent-receipt-generator`). Guard and analytics check passed; no migration; Worker 2,614.90 KiB gzip. **Checked on production:** the page (200, all six security headers, in the sitemap and on the tools page); PDF to Word, Number to Words, the invoice generator and other tools still 200; and a real run in a browser on the live site (form filled, preview and both notes shown, a valid 4-page PDF of 12 receipts produced, only the font files were fetched, nothing uploaded). The owner reviewed a sample PDF and said it looks good. **Not checked:** that an employer's payroll accepts the format; the PAN and stamp rules against the statute (secondary sources only); how it prints on paper. Before it, 2026-10-27: version `d7501e88-13de-47f1-a370-4e7be6610740` (`main` at `0c93fce`: **PDF to Word**, text first, in the browser). Guard and analytics check passed; no migration; Worker 2,602.81 KiB gzip. **Checked on production:** the page (200, all six security headers, in the sitemap and on the tools page, the old `/documents/pdf-to-word` address 404s), every other PDF tool, Number to Words and the invoice generator still 200, and a real conversion in a browser (the sample letter became a 2,403-byte `.docx`, valid zip, and the page made no network request during it). The owner opened a sample `.docx` in Word and reported it looks good. **Not checked:** other PDFs on production (tables, columns, Indian-language text), Google Docs and Pages. Before it, 2026-10-27: `0671a0b4-2f3a-4011-80c2-4056a79ad496` (`247efdd`: Indian Number to Words; 2,597.01 KiB). The owner reports the Invoice Generator smoke test passed on the live site (which tests were run is not recorded). Before them, 2026-10-27: version `fb1f96c8-8781-42b2-9793-fa29b993bc6a` (`main` at `1abe440`: the invoice payments / collections / reports work merged from `claude/invoice-generator-0b6142`, plus security headers, `robots.txt` with the Sitemap line and the deploy guard). First deploy through the guard (it passed) and the analytics check; no migration (0010 was already applied). Worker 2,594.11 KiB gzip. **Checked on production:** all six security headers on pages, `/privacy`, `/login`, `/api/me` and a 404 (the home page showed none on its very first request after the deploy, then all six on every later one — a transient edge-cache state); `robots.txt` has the rules and the Sitemap line; `/app` redirects to sign-in; `/api/qr`, `/api/invoices`, `/api/customers` and the invoice report and collection routes answer 401 signed out; the privacy page shows the payment-records text and the analytics wording. **Not checked on production:** signed-in invoice payments and reports (needs an account and a smoke test), Google sign-in, GA accept path, headers on `/_next/static/*` files (not sent by design). Before it: `1c1625d7-0bbc-4477-8ad0-16acdfd3deba` (2026-10-27, deployed from the invoice branch, which contained `main` at that point) and `9da2d0aa-0201-45a1-877b-e98e5cd0dadf` (2026-10-26, `d3b054f`: GA4 safeguard; 2,481 KiB). Before them, 2026-10-26: version `4a080ab6-4944-4a82-86c1-bc5dd6dd9635` (`main` at `8121ceb`: the QR "Save tracked QR" panel fix — always shown for Website, WhatsApp, Social and PDF links, disabled with a reason until the link is valid; no migration). `cf:deploy` build and analytics check passed (GA ID found in 56 client files); Worker 2,481.01 KiB gzip. **Checked on production:** panel and disabled/hint states for the four link types, no Save action for the other nine types, `/sitemap.xml` (40 URLs), `/design-system` noindex, a temporary tracked code redirected (302) to its destination and was then deleted (0 codes left), and analytics stays off before any choice and after "No thanks". **Not checked on production:** the free-limit state (needs 3 temporary codes), the signed-out sign-in prompt, and accepting analytics (it would send a real hit to GA4). Those are covered by the e2e suite only. Before it, 2026-10-26: version `866f7459-afc7-4594-af9c-f5209c8cc213` (`main` at `cd4f88b`: everything below plus GA4 consent-first analytics, `/sitemap.xml`, `/design-system` noindex; `cf:deploy` ran the analytics check). Worker 2,480.90 KiB gzip. Before it, 2026-10-26: `3f801e52-1151-4f29-9895-517cefc42c3b` (`main` at `464ec84`: QR workspace — dashboard, campaigns, analytics, exports; 2,504.84 KiB). **Both QR deploys were built from `main` before it contained the GA4 work, so each removed analytics, the sitemap and the noindex from the live site until the branch was merged; deploy only from a branch that contains `.env.production` and the analytics check.** Before it, 2026-10-25: `8866be1c-a15f-4f51-a9c5-6286ac319e96` (branch `claude/exciting-spence-025d65`: GA4, `/sitemap.xml`, `/design-system` noindex, the analytics deploy check; 2,471 KiB), and `fa2b3997-b5b5-482d-be0f-314492897c19` (`3b26220`: tracked QR codes, first slice; 2,493 KiB). Earlier the same day: `e7856b16-d2e3-40d3-8289-7c862e3bc548` (`9c89387`: invoice Stage 2C-2; 2,373 KiB), `c0931bfc-f60c-46a3-8212-7c6c3d58d4ea` (`133be4f`: Salary Calculator; 2,334 KiB), and `70d615cf-4b0b-4392-b0a4-027aa0b77002` (`ad3bc9a`: PDF tools Stage 1, image converter format-switch fix, invoice Stage 2C-1; 2,329 KiB). |
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
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | **not set** (billing, M1) | Razorpay API keys and the webhook secret (docs/products/billing.md). Unset → the billing page says payments aren't switched on and checkout answers 503. Test-mode keys first; live keys only after the release gate. |
| `BILLING_SELLER_EMAIL` / `BILLING_TAX_TREATMENT` / `BILLING_TAX_RATE` / `BILLING_SAC` | **not set** (billing M2) | Who issues KaamSolv's own sales invoices and how tax is treated (docs/products/billing.md). Not secrets, but set them like the others (`npx wrangler secret put NAME`) so they stay out of the repo. Unset → paid subscriptions are NOT invoiced; their jobs wait as `blocked`. `BILLING_TAX_TREATMENT` is `none` or `inclusive` (+ `BILLING_TAX_RATE`); `exclusive` is not supported. |
| `CRON_SECRET` | **not set** (billing M2) | Shared secret the scheduled trigger sends to `/api/billing/drain` to retry invoice emails every 15 minutes. Unset → the route answers 503 and only the first attempt after each payment happens. |
| `AFFILIATE_WEBHOOK_MASTER` | **not set** (affiliate 3B) | The one secret every business's WooCommerce webhook secret is derived from (`HMAC-SHA256(master, connectionId:version)`; nothing secret is stored). Set it with a hidden prompt (`npx wrangler secret put AFFILIATE_WEBHOOK_MASTER`), never in chat or a file, **before** the 3B deploy; use a long random value. Unset in production → connecting a store is refused and deliveries answer 503. Rotating it changes every business's secret at once. Locally a fixed development value is used. |
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
| `0011_billing.sql` | `plan_prices` (+ seed: Invoice Pro 150/1,490, QR Pro 99/990, bundle 199/1,990), plan `invoice_qr_bundle`, `billing_events`, `billing_payments` | **applied 2026-11-01** (atomic runner, with 0012 and 0013; Neon safety branch `pre-billing-2026-11-01`) |
| `0012_billing_invoices.sql` | `outbox`, `invoice_links`, `billing_payments.invoice_id` / `invoiced_at` | **applied 2026-11-01** (same run as 0011) |
| `0013_notification_prefs.sql` | `notification_prefs` (an account's opt-in to the receivables summary email) | **applied 2026-11-01** (same run as 0011) |

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

**Why not `npm run db:migrate`.** Production uses Neon's HTTP driver, which can send a fixed batch as one transaction but cannot hold an interactive one, and drizzle's `neon-http`
migrator sends **every statement as its own request and writes the journal row only after all of them have run**. Migration 0010 is 23
statements (tables, five plpgsql functions, four triggers, a seed). If one fails, or the connection drops, the earlier statements stay
committed, there is no journal row, and a re-run stops at the first `CREATE TABLE … already exists` — leaving a half-applied ledger to clean up
by hand. (`test/atomic-migration.test.mts` reproduces exactly this.)

**`npm run db:migrate:atomic`** (`db/migrate-atomic.mts`; logic and tests in `db/atomic-migration.ts` / `test/atomic-migration.test.mts`) sends the
pending migrations' statements **and their journal rows as one Neon HTTP transaction**. If the database reports an error, the whole transaction rolls back; if the
connection is lost before an answer arrives, whether it committed is **unknown** and the tool says so. That atomicity is Postgres's and
Neon's batch behaviour: it is demonstrated on PGlite (below) and was **confirmed against a staging Neon database on 2026-11-14**, when migrations 0018 to 0021 were committed in one transaction and the journal read 22 of 22 (docs/infra/affiliate-staging-verification.md). It has not yet been run against production. It reads the same
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
