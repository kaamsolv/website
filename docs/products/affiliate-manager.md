# Affiliate Manager

**Status (2026-11-13):** Phase 1 (merchant foundation and branded portal) is built on branch `feat/affiliate-phase1` (worktree `.claude/worktrees/affiliate-phase1`), **not committed, not deployed, migration 0018 not applied to Neon**. Phases 2 to 8 are not started. Decision record: [`../DECISIONS.md`](../DECISIONS.md).

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

## Not in Phase 1 (on purpose)

Affiliate registration and `/affiliate/{slug}/register`, applications, programmes as rows, referral links, click attribution, coupons mapping, WooCommerce connector, commissions, ledger, payouts, subscriptions and entitlement keys, notifications, marketplace, custom domains, a platform super-admin.

## Tests

- `test/affiliate-merchant.test.mts` (rules) and `test/affiliate-isolation.test.mts` (real Postgres via PGlite): one merchant per owner, unique slugs, owner reaches only their own merchant, a scope reads and writes only its merchant, a scope for a non-merchant id changes nothing, the public view has no owner details, account deletion cascades, and the guard that only `db/merchant-scope.ts` uses the tables.
- `tests/e2e/affiliate.spec.ts` (9): create, public page, edit, second owner blocked (read, slug clash, reserved word, cross-site, signed out), 404, and 375 / 360 / 320 px in light and dark with no sideways scroll.
- Full unit suite 1035 / 1035; `tsc --noEmit` clean; `npm run build` and `npm run cf:build` pass. `npm run lint` does not run (`next lint` was removed in Next 16; same on `main`).

## Before this ships

Owner review at `http://localhost:3000/app/affiliate` (and `/affiliate/{slug}`); then commit, then apply migration 0018 to Neon with `npm run db:migrate` (additive, two new tables) and deploy. Not done yet.
