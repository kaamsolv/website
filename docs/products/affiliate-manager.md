# Affiliate Manager

**Released to production 2026-11-14** (migrations 0018 to 0021, deploy version `8a6bde62`; first merchant granted by hand; one real application tested end to end). The status paragraph below was written before the release.

**Status (2026-11-13):** Phase 1 (merchant foundation and branded portal) is committed on `feat/affiliate-phase1` (`7588d9d`). Phase 2 (affiliate registration, applications, merchant review, membership status) is on `feat/affiliate-phase2` (worktree `.claude/worktrees/affiliate-phase1`). Phase 2 was committed as `d6f22ef`. The launch safeguards (below) are built on top (`e582dab`). **Nothing is pushed or deployed. Migrations 0018 to 0021 were applied to a staging Neon database and verified (12 of 12) on 2026-11-14, and have not been applied to production.** Phases 3 to 8 are not started. Decision record: [`../DECISIONS.md`](../DECISIONS.md).

## What it is

Two connected products: an affiliate management tool for businesses (merchants), and later a place where affiliates discover programmes. First merchant: Wandernest Tales (WordPress + WooCommerce on separate hosting; KaamSolv tracks and reports without moving the site). Proposed WT settings (not hard-coded): 15% commission, 10% customer discount, 30-day last click, coupon attribution, monthly manual payouts.

## Decisions taken for Phase 1 (from the read-only audit)

- **Address:** `kaamsolv.com/affiliate/{slug}`. Paths, not subdomains (DECISIONS 2026-10-22); no `app.` subdomain, no DNS or `wrangler.jsonc` change. Custom domains stay Phase 8.
- **One merchant per owner** (`merchants.owner_user_id` is unique). Subscriptions stay per user for now.
- **Slug is fixed at creation** so addresses people have shared keep working.
- **Merchant-scoped data layer.** Only `db/merchant-scope.ts` touches the merchant tables; a test fails if any other file does. A request never names a merchant id: the owner's merchant comes from the session (`merchantForOwner`), every other read/write goes through `merchantScope(merchantId)`, and the public page gets a view with no owner id or email.
- **Portal is not indexed** (`noindex`, not in the sitemap) until registration opens in Phase 2.
- **No paywall yet.** Creating a portal is free in Phase 1; Phase 6 adds the plan and entitlement.

## What is built

| Piece | Where |
|---|---|
| Rules (slug, reserved words, brand colour, contrast, input checks) | `app/lib/affiliate/merchant.ts` |
| Tables `merchants`, `merchant_brand_settings` (additive; migration `0018_fixed_tyrannus`) | `db/schema.ts`, `db/migrations/` |
| Scoped data layer (create in one statement, scope, public view) | `db/merchant-scope.ts` |
| API (GET / PUT, signed-in, same-origin, own merchant only) | `app/api/affiliate/merchant/route.ts` |
| Public portal | `app/affiliate/[merchant]/page.tsx`, `app/_components/affiliate/portal-view.tsx` |
| Owner editor with live preview | `app/app/affiliate/page.tsx`, `app/_components/affiliate/merchant-form.tsx` |
| `affiliate` reserved as a first path segment | `app/lib/reserved-routes.ts` |

The portal shows the logo, a band in the merchant's colour (text switches between white and Deep Navy for contrast), programme name and description, the merchant's own terms, and "Registration opens soon". The editor is at `/app/affiliate`; there is no menu link yet (navigation was left untouched).

## Phase 2: registration, applications, review, membership status

Decisions: sign-in with a verified email is required to apply; **manual approval only** (no auto-approval); bot protection is the existing rate limiter plus a honeypot and a minimum fill time, **no Turnstile** and no change to the sign-in flow (revisit only if real abuse shows up); merchant-side reads and writes stay behind `db/merchant-scope.ts`; an affiliate's data is reachable only by that affiliate through `db/affiliate-scope.ts`, in the style of the accountant `grantFor` check.

| Piece | Where |
|---|---|
| Rules: application checks, website cleaning, reapply cooldown (7 days), bot check, block messages | `app/lib/affiliate/application.ts` |
| Tables `affiliate_profiles`, `programmes`, `programme_applications`, `programme_memberships`, `affiliate_events` (migration `0019_green_lizard`, additive) | `db/schema.ts`, `db/migrations/` |
| Merchant side: open/close registration, list applicants, approve / reject | `db/merchant-scope.ts` |
| Affiliate side: profile, apply, own list, withdraw, register-page state | `db/affiliate-scope.ts` |
| Rate limits: `affiliateApplyUser`, `affiliateApplyIp`, `affiliateApplyMerchant`, `affiliateMerchantEdit` (also on the Phase 1 portal editor), `affiliateDecide` | `app/lib/rate-limit.ts`, `app/lib/affiliate/server.ts` |
| API | `app/api/affiliate/{apply,me,me/applications/[id],programme,applications,applications/[id]}` |
| Pages | `/affiliate/{slug}/register`, `/app/affiliate/applications` (owner), `/app/affiliate/programmes` (affiliate); the portal's "Apply to join" (see "Where things live" below for the full map) |

How it behaves:
- Registration is **closed** until the owner opens it. The portal says so and the register page shows no form.
- One application at a time per affiliate and programme (a partial unique index); a rejected affiliate waits 7 days; the owner can't apply to their own programme; an approved affiliate can't apply again.
- Approve and reject are **one SQL statement** each (status change, membership on approval, event), and only for a pending application of the caller's own merchant; any other id changes nothing and answers 404. Neon over HTTP can't hold an interactive transaction (read, decide, then write), so every write that must go together is a single guarded statement.
- Applying shares the applicant's name, website, message and sign-in email with the merchant; the form says so.
- **Events** (`affiliate_events`) are append-only: a trigger refuses UPDATE and any direct DELETE; only the cascade from removing a merchant or an account may delete. `actor_user_id` has no foreign key so it survives the actor's account. Rows hold ids and a short action code, never personal data.
- The bot checks (hidden field, minimum 3 seconds, a timestamp the browser supplies) can be forged by a determined script, so they stop blind posting only; the rate limits (per person, per device, per merchant) do the real work. A tripped check looks like success and stores nothing.
- Public portals are **noindex** and not linked from the public site. Inside the signed-in account they are reachable from the Affiliate menu, the hub card and the Affiliate page.

Tests: `test/affiliate-application.test.mts` (rules, bot check, limits), `test/affiliate-registration.test.mts` (real Postgres: lifecycle, refusals, cooldown, withdraw, final decisions, **cross-merchant and cross-affiliate isolation**, append-only events and cascades), the widened guard in `test/affiliate-isolation.test.mts` (only the two scope files may use any affiliate table), `tests/e2e/affiliate-registration.spec.ts` (10: the full flow, bot checks and the 429, refusals, isolation over HTTP, 375 / 360 / 320 px in light and dark). Unit suite 1051 / 1051; e2e 19 / 19 (both affiliate specs); `tsc` clean; `build` and `cf:build` pass.

**Not verified:** the SQL has run only on PGlite. The statements use data-modifying CTEs, typed parameters and `pg_trigger_depth()`; they should behave the same on Neon but this has **not** been run through the Neon HTTP driver (no staging database exists yet).

### Where things live (after the menu and landing page work)

| Address | What it is |
|---|---|
| `/app/affiliate` | **The Affiliate page**: how a programme works, then the two roles side by side (**Joined**: you promote other businesses, with a paste-a-programme-link box and your Applied / Approved / Not approved numbers; **Created**: your own programme, its address, registration state and applicant numbers, or "Create my programme"). Says only what exists; referral links and earnings are marked "Next, not built yet". |
| `/app/affiliate/programmes?status=` | Joined: your applications, filter chips with counts (All, Applied, Approved, Not approved) |
| `/app/affiliate/applications?status=` | Created: review applicants, open or close registration, filter chips with counts |
| `/app/affiliate/portal` | Created: portal settings (logo, colour, terms, programme name, preview). Moved here from `/app/affiliate` |
| `/affiliate/{slug}`, `/affiliate/{slug}/register` | The public portal and the application form |
| `GET /api/affiliate/nav` | One request for the menu and the Affiliate page: my application counts by status, and my own programme (registration state, applicant counts) or null |

**Sidebar:** an **Affiliate** row with its own icon (purple tile) sits under Products. It opens the Affiliate page and holds two dropdowns: **Joined** (All, Applied, Approved, Not approved, each with its count) and **Created** (To review, Approved, Not approved, Portal settings; a yellow badge on the row shows what waits for review). Until you have made a programme, "Created" is a plain link to set one up. It is a role, not a product you subscribe to, so it does not live in the products registry (`app/lib/products.ts`) and has no plan or price yet; Phase 6 adds the paid plan for running a programme. Because "Created" is now offered to every signed-in account, **the launch safeguards below are still required before any deploy**: anyone could make a public (noindex, unlisted) portal.

## PRD alignment (2026-11-14)

The PRD ("KaamSolv Affiliate Manager", v1.1, 13 November 2026) is the product intent. Where it differs from a settled decision, the decision stands and the difference is recorded here.

### What this change set added

| PRD | What was built |
|---|---|
| §8.1 branded registration page | The application page opens with the merchant's colour band, logo and programme name (`PortalHeader`, shared with the portal). One h1, "Powered by KaamSolv" as the footer line. |
| §7.1 suspend affiliates | Merchants can suspend and reinstate an approved affiliate, with an optional reason. The application stays "approved"; the membership status (`active` / `suspended`) is what pauses access. A suspended person sees "Paused by the merchant" and the reason, cannot apply again, and the portal says their access is paused. |
| §8.1 registration fields | Optional category (the PRD's list), where they will share it (channel) and country, stored on the application and shown in the merchant's inbox. Name stays the only required field. Phone and social handles are not collected yet. |
| §7.1 notes | An optional reason on Approve and Don't approve, shown to the affiliate in their list and in the email. |
| §21 "share a registration link" | Copy buttons for the programme page and the application link, on the Applications page and the Affiliate page. |
| §15 audit logs | `affiliate_events` now also records `portal_created`, `portal_edited`, `suspended` and `reinstated` (still append-only). |
| §8.4 notifications | Three plain KaamSolv emails: application received (to the merchant, with a link to the inbox), approved and not approved (to the applicant, with the merchant's reason, and for a rejection the 7-day wait). |

**Emails.** Each is an outbox job (`affiliate_received`, `affiliate_decision`) holding only an application id. The job row is written in the same SQL statement as the application or the decision, so it cannot be lost or doubled; the address and names are looked up when it runs (`db/affiliate-mail.ts`). It is sent right after the response and retried on the schedule with back-off if the provider fails (the same outbox, drain route and cron as billing). Sender `KaamSolv Affiliates <affiliates@send.kaamsolv.com>`. Locally nothing is sent: the message goes to the dev mail outbox (`test-results/mail-outbox.jsonl`). Merchant-branded email templates are a later, paid option (PRD §5.2, §5.7).

Schema: migration `0020` (additive: three application columns, `status_note` and `updated_at` on memberships, the new membership status and event actions). `0018` to `0020` are unapplied everywhere but local test databases.

### URL mapping: PRD to what exists

| PRD address | Built as | Why |
|---|---|---|
| `app.kaamsolv.com/affiliate/{slug}` | `kaamsolv.com/affiliate/{slug}` | Paths, not subdomains (DECISIONS 2026-10-22): one cookie and one origin for sign-in, plans and billing. No DNS or `wrangler.jsonc` change. |
| `.../{slug}/register` | `/affiliate/{slug}/register` | Same. Branded. |
| `.../{slug}/login` | The global `/login`, returning to the register page | One KaamSolv identity (PRD §5.6). A separate branded login would not add a second identity. |
| `app.kaamsolv.com/affiliate/dashboard` | `/app/affiliate` (overview) and `/app/affiliate/programmes` (my programmes) | The signed-in area is `/app`. `dashboard` is a reserved merchant slug, so the PRD address can never collide with a merchant. |
| `app.kaamsolv.com/workspace` | `/app/affiliate/applications`, `/app/affiliate/portal` | Same reason. |
| `app.kaamsolv.com/discover` | not built | Marketplace, later phase. `discover` is reserved. |
| `partners.merchantdomain.com` | not built | Optional custom domains, last phase. |

### Phase mapping: PRD to ours

| PRD phase | Ours |
|---|---|
| 0 Audit | 0 (done) |
| 1 Multi-tenant foundation, portal, registration and approval | 1 and 2 (done, this branch) |
| 2 Tracking and commerce integration | 3 |
| 3 Financial operations (ledger, refunds, payouts) | 4 |
| 4 Dashboards and launch | 5 |
| 5 SaaS launch (self-registration, billing, entitlements) | 6 |
| 6 Discovery network | 7 |
| 7 Custom domains, more integrations, fraud scoring | 8 |

### Why access is scoped the way it is (and not workspaces plus row-level security)

- **Merchant side:** one merchant per owner, and every merchant-owned row carries `merchant_id`. All reads and writes go through `db/merchant-scope.ts`, which names that id in every statement; the owner's merchant is resolved from the session, never from the request. The affiliate side is the same idea keyed by the account (`db/affiliate-scope.ts`). `db/affiliate-mail.ts` is the third reader, for outbox jobs that run with no signed-in user, read-only and keyed by one application id. A test fails if any other file touches an affiliate table, and the isolation tests try the cross-merchant and cross-affiliate cases over the database and over HTTP.
- **Why not row-level security or workspaces and roles yet:** the app talks to Neon over HTTP, which is stateless: it cannot set a per-request tenant variable or keep a session between statements, so Postgres RLS cannot know which tenant a request is. The application-level scope plus the guard test is the working equivalent. Teams and roles are out of v1 (settled); because `merchant_id` is already on every table, adding members later is additive. The PRD's "tenant ID" is `merchant_id` here.

### Why writes are single statements (and not interactive transactions)

The PRD says to use PostgreSQL transactions for state changes. Neon over HTTP can send a *fixed batch* of statements as one transaction (the atomic migration runner does exactly that), but it cannot hold an *interactive* one: read a value, decide, then write. Every affiliate change depends on a state check (is the application still pending? does it belong to this merchant?), so each is **one SQL statement** with a guarded `WHERE` (data-modifying CTEs): approving (status, membership, event, queued email), suspending (membership, event), applying (application, event, queued email), saving the portal (name, brand, event), and making a merchant (merchant, brand, event). A statement either happens whole or not at all, and a repeated call changes nothing (guarded `WHERE`, unique keys, the outbox dedupe key). The same intent as the PRD's transactions, built for the driver in use. The append-only history is enforced by a trigger (`affiliate_events`: no UPDATE, no direct DELETE; only the cascade from removing a merchant or an account may delete). Money later uses the same pattern with triggers, as the invoice payment ledger already does.

## Launch safeguards (built and verified 2026-11-14) and what still blocks release

| Gate | What exists |
|---|---|
| **Report a portal** | A "Report this page" link on every portal and application page, leading to `/affiliate/{slug}/report` (branded, noindex). `POST /api/affiliate/report` is open to anyone, 5 an hour and 20 a day per caller (a salted hash, never an address), with a hidden-field trap. A report is stored only for a live portal; for any other address the answer is the same 202 and nothing is stored, so the form can't be used to find which addresses exist. The merchant is never told who reported. Operators read them with `npm run affiliate:reports` and mark them with `-- handle <id> reviewed\|dismissed --confirm`. A report changes nothing by itself. |
| **Suspend a merchant** | `merchants.status` (`active` / `suspended`). Operator-only: `npm run affiliate:merchant -- suspend <slug> "reason" --confirm` and `reinstate`; no web route can do it. A suspended portal, its application page and its report page answer 404; applicants are told it doesn't exist; registration is shut; the owner sees the reason on the Affiliate page, the inbox and the portal settings, and can't edit, reopen registration or approve (they can still reject, suspend affiliates and read). The portal's open reports are marked reviewed with the suspension. History: `merchant_suspended` / `merchant_reinstated` in `affiliate_events`. |
| **Slug abuse** | Names that pass for KaamSolv, a payment provider or an official body are refused (brand names anywhere in the address; plain words such as bank, official, verified, upi, govt only as a whole word, so `riverbank-travel` is fine). Plus the reserved list, one merchant per owner, a rate limit on edits, and signed-in only. **Policy for unused addresses:** a portal with no applications that is more than 90 days old may be freed once the owner has been contacted: `npm run affiliate:merchant -- stale` lists them and `-- release <slug> --confirm` deletes one (it refuses a portal that ever had an application, or one newer than the cutoff). Look-alikes that get through are suspended by an operator. |
| **Plan entitlement** | The `affiliate_programme` entitlement, held by the `affiliate_manager` plan (migration 0021, one programme per account). Making a portal and opening registration need it; being an affiliate, applying and reading your own list do not. Portals made before the gate keep working. Give a business its plan by hand: `npm run account:grant -- <email> affiliate_manager --confirm`. It has no price and no checkout yet (Phase 6); free accounts see a plain "isn't open to every account yet, contact us" instead of a dead button. |

**Privacy and terms: updated 2026-11-14.** The Privacy page has an "Affiliate programmes" section (what an applicant's form and sign-in email share with the business they apply to, what is kept, the emails sent, programme-page reports, and the retention and deletion lines), and the Terms page has one too (the business is responsible for its page and promises; KaamSolv isn't a party and, for now, tracks no sales and holds or pays no money; what a programme page must not do; suspension; the paid plan). It describes only what the code does today and **needs the owner's read before release**, because it is policy wording. Update both pages in the same change whenever tracking, payouts or new stored fields arrive.

**Staging verification: done 2026-11-14.** Migrations 0018 to 0021 were applied to an empty non-production Neon database with the atomic runner, and `npm run affiliate:smoke` passed 12 of 12 through the real Neon HTTP driver (runbook and results: [`../infra/affiliate-staging-verification.md`](../infra/affiliate-staging-verification.md)). **Still true:** nothing has been applied to production, and doing so is a separate approval (take a restore point, migrate first with `db:migrate:atomic`, then deploy). The smoke test does not cover sending real email through Resend, the routes running on the deployed Worker, or the pages on a real phone; those are checked after the production deploy. Portals stay `noindex` and unlinked from the public site until the owner decides to launch.

## Phase 3A: referral links and recorded clicks (built 2026-11-14, on `feat/affiliate-phase2`, not deployed)

Migration **0022** (additive): `programmes.destination_url`, `affiliate_links`, `affiliate_clicks`, and two event actions (`link_created`, `destination_saved`). Apply it after 0021, never alone, with the atomic runner.

| Piece | What it does |
|---|---|
| **Link shape** | `kaamsolv.com/{business-slug}/{code}`. The route is `app/[shortCode]/[code]/route.ts` (Next.js allows one dynamic name per level, so `shortCode` is the business address there). The code is 8 random base62 characters, case-sensitive, unique within a business. One link per approved membership, made the first time the affiliate opens Joined (`ensureLinks`: idempotent, one statement, so existing members need no backfill). |
| **Destination** | Stored per programme (`programmes.destination_url`), set by the business under Portal settings ("Where affiliate links lead", with an "i" and an "Open it to check it works" link; no server fetch). https only; no passwords, private or local hosts, KaamSolv addresses or open URL shorteners (`cleanDestination`, reusing `validateDestinationUrl` and `checkDestinationPolicy`). Saving it never opens registration (it makes the programme row, closed, if none exists). A link can't be pointed anywhere else. |
| **Redirect** | Unknown business, suspended business or unknown code: 404 (the same for all). Membership paused: 302 to the destination **without `?ref=`**, nothing recorded. No destination yet: 302 to the programme page (a relative `Location`). Otherwise 302 to `destination?ref=CODE` (existing query and `#fragment` kept, an existing `ref` replaced) and, after the response, one recorded click. Always `no-store` and `noindex`. HEAD, prefetch and link previews (device class `bot`) record nothing. |
| **Recorded clicks** | `affiliate_clicks` holds only: when, referrer **host**, a two-letter country and a device bucket. No IP, no User-Agent, no full referrer, no cookie, no visitor id. The UI says **"Recorded clicks"** (7 days, 30 days, all time) with an "i" that says it is not a count of people or of different visitors. The business sees recorded clicks per approved affiliate (30 days and all time) in Applications. |
| **Business addresses** | A business address must not be a real top-level path, or its links would be shadowed. `checkSlug` now also refuses everything in `app/lib/reserved-routes.ts` plus the root files (`robots`, `sitemap`, `icon`, `manifest`, `favicon`). `test/affiliate-link-routes.test.mts` reads the real `app/` folders (route groups included) and fails if any routable top-level path could be taken as an address, so a new page added later can't silently collide. Addresses made before this change aren't re-checked: look at existing portals when deploying. |
| **Isolation** | Only `db/affiliate-links.ts`, the scope files and the operator/smoke modules touch the new tables (`test/affiliate-isolation.test.mts` guard). A code resolves only under its own business. |
| **Privacy and terms** | Updated in the same change: what a click records, who sees the counts, retention, and that the store behind the link and the click numbers are not KaamSolv's responsibility. **Needs the owner's read before release.** |

**Tests:** `test/affiliate-link.test.mts` (rules), `test/affiliate-link-routes.test.mts` (route collisions), `test/affiliate-links.test.mts` (real Postgres: links, resolving, clicks, paused and suspended, isolation, cascade), the extended smoke test (`test/affiliate-smoke.test.mts`, including the redirect checks against a stub app) and `tests/e2e/affiliate-links.spec.ts` (9: destination validation, link appears only after approval, 302 with `?ref=`, the post-response click is counted, previews and unknown codes, paused and reinstated, no destination, 360 and 320 px in light and dark, keyboard).

**Still to do before release (each its own approval, nothing has been run against any external database):**
1. **Staging (Neon HTTP driver):** use a fresh non-production database and apply the whole journal in order (`db:migrate:atomic`, ending with 0022; 0022 can't skip 0020 and 0021, the runner applies pending migrations in journal order). Then `npm run affiliate:smoke -- --expect-host <host> --non-production --confirm`.
2. **OpenNext preview with the redirect check:** `npm run cf:build`, `npm run cf:preview` pointed at that same staging database (a Worker has no PGlite, so the preview can't run DB routes without a Neon `DATABASE_URL`), then `… affiliate:smoke … --confirm --redirect-base-url http://localhost:8787`. This requests a real link and polls the database until the click written after the response appears, so it proves the `after()` write persists on Workers.
3. Production: restore point, migrate with the atomic runner, deploy, check a real link. Not the live Wandernest Tales store until the owner says so.

## Not in Phase 1, 2 or 3A (on purpose)

Sales and order tracking, attribution cookies, coupons mapping, the WooCommerce connector, commissions, ledger, payouts, subscriptions and entitlement keys, notifications, marketplace, custom domains, a platform super-admin. (Referral links and recorded clicks are Phase 3A, above; sales tracking is 3B.) No custom link names, no unique-visitor or fraud scoring, no click export yet.

## Tests

- `test/affiliate-merchant.test.mts` (rules) and `test/affiliate-isolation.test.mts` (real Postgres via PGlite): one merchant per owner, unique slugs, owner reaches only their own merchant, a scope reads and writes only its merchant, a scope for a non-merchant id changes nothing, the public view has no owner details, account deletion cascades, and the guard that only `db/merchant-scope.ts` uses the tables.
- `tests/e2e/affiliate.spec.ts` (9): create, public page, edit, second owner blocked (read, slug clash, reserved word, cross-site, signed out), 404, and 375 / 360 / 320 px in light and dark with no sideways scroll.
- Full unit suite 1035 / 1035; `tsc --noEmit` clean; `npm run build` and `npm run cf:build` pass. `npm run lint` does not run (`next lint` was removed in Next 16; same on `main`).

## Before this ships

Commit Phase 2; then, only with the owner's explicit approval, apply migrations 0018 to 0020 to an isolated or staging Neon database first and smoke-test duplicate owner, taken slug, apply, approve and the append-only events through the Neon HTTP driver; only then production. Deploy after the migration, and not while the launch safeguards above are missing.
