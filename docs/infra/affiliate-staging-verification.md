# Affiliate Manager: verifying the migrations on a staging Neon database

**Status (2026-11-14): run once, clean: 12 of 12 checks passed on a staging Neon database.** The owner created an empty non-production project (Singapore, pooled connection) and ran the steps in their own terminal; the staging project is to be deleted afterwards. **Production has not been touched and still needs its own explicit approval** (see the last section).

## Why

Migrations `0018` to `0021` and the affiliate writes have only ever run on PGlite (Postgres in WASM). Production uses Neon over HTTP. The cases below are the ones only Neon can settle, and they are what the smoke test checks:

- the **unique-violation handling** for "one merchant per owner" and "slug taken" (detected from the error the driver returns);
- the **one-statement writes** (data-modifying CTEs with typed parameters): approve, suspend, apply, save the portal, make a merchant;
- the **append-only trigger** (`pg_trigger_depth()`): update and direct delete refused, cascade from removing an account allowed;
- the **atomic migration** of 0018 to 0021 in one transaction, including the function and trigger in 0019;
- the plan seed, the queued emails (once each), reports, operator suspension, and cross-merchant isolation.

Note on wording elsewhere in the docs: Neon over HTTP can send a *fixed batch* of statements as one transaction (the atomic migration runner does exactly that). What it cannot do is an *interactive* transaction: read a value, decide, then write. The affiliate writes depend on a state check (is it still pending? is it this merchant's?), so each is a single statement with a guarded `WHERE`.

## What you provide

An **empty, non-production** Neon database: a new project or a new empty database. Not a copy or branch of production (the rehearsal tools refuse any database that holds data). Keep its connection string out of chat, files and `.env.local`: set it only in the environment of the command that needs it. Only its **host** is ever printed or typed.

## Steps

Commands are shown for Windows PowerShell. `<host>` is the connection string's host (for example `ep-…-pooler.ap-southeast-1.aws.neon.tech`).

1. **Self-checks that need no database** (already passing on 2026-11-14):
   ```powershell
   npm run affiliate:smoke -- --local --confirm
   npm run db:rehearsal:prepare -- --local --confirm --through 0017
   ```
2. **Build the state production is in today** (migrations up to 0017, written by drizzle's own migrator). Dry run first:
   ```powershell
   $env:DATABASE_URL = '<non-production connection string>'
   npm run db:rehearsal:prepare -- --expect-host <host> --non-production
   npm run db:rehearsal:prepare -- --expect-host <host> --non-production --confirm --through 0017
   ```
3. **Apply the new migrations the way production will** (one atomic transaction, journal rows included). Dry run, then apply:
   ```powershell
   npm run db:migrate:atomic -- --expect-host <host>
   npm run db:migrate:atomic -- --expect-host <host> --confirm --restore-point-taken
   ```
   It should apply `0018_fixed_tyrannus`, `0019_green_lizard`, `0020_spicy_korvac` and `0021_volatile_scrambler`. On a throwaway database the "restore point" is the database itself; pass the flag only because that is true.
4. **Run the smoke test** through the real Neon HTTP driver. Dry run, then run:
   ```powershell
   npm run affiliate:smoke -- --expect-host <host> --non-production
   npm run affiliate:smoke -- --expect-host <host> --non-production --confirm
   ```
   Expect `12 of 12 checks passed`. It refuses any database holding an account that is not a throwaway `@example.test` address, creates only rows tagged `smoke-<id>-…@example.test`, and removes them (and their queued emails) at the end, pass or fail.
5. **Clear the variable and delete the database:**
   ```powershell
   Remove-Item Env:DATABASE_URL
   ```
   Then delete the staging database in Neon.

On Windows PowerShell, `npm` may be blocked by the execution policy (`npm.ps1 cannot be loaded`). Use `npm.cmd` instead, in every command above; no system setting needs changing.
6. **Record the result** in the table below (date, which checks, anything unexpected).

If a check fails, the line names it. The likeliest places on Neon are the unique-violation detection in `db/links.ts` (`isUniqueViolation`), parameter typing in the CTE statements in `db/merchant-scope.ts` / `db/affiliate-scope.ts`, and the `pg_trigger_depth()` rule in the trigger from migration 0019. Fix in code, re-run on a fresh database, and do not go to production until it is clean.

## Results

| Date | Database | Migrations | Smoke test | Notes |
|---|---|---|---|---|
| 2026-11-14 | New empty Neon project, Singapore, pooled | Rehearsal builder applied 0000 to 0017 (18); atomic runner then committed 0018, 0019, 0020, 0021 in one transaction, journal 22 rows (expected 22) | **12 of 12** | Passed first time on the real driver: unique-violation handling (`already_has_merchant`, `slug_taken`), the one-statement writes, the `pg_trigger_depth()` append-only trigger (update and direct delete refused; cascade allowed), queued emails once each, reports, operator suspension, the plan entitlement, isolation, and clean-up. Two things the run exposed, both fixed in code before it: a helper defined after its first use in the smoke command (the Neon path only), and on Windows PowerShell `npm` is blocked by the execution policy, so use `npm.cmd`. |
| 2026-11-14 | `kaamsolv-staging` Neon project, Singapore, pooled (already at 0021) | Atomic runner committed 0022 alone, journal 23 rows (expected 23); a Neon branch `pre-0022-staging` was taken first | **14 of 14**, then **17 of 17** with `--redirect-base-url` against the OpenNext Cloudflare preview (`cf:preview`, same database) | Phase 3A on the real Neon HTTP driver: 0022, link creation, click write and count, previews and paused affiliates recording nothing. The 17-check run proved the real 302 with `?ref=`, `no-store`, `noindex`, 404s, and that **the click written after the response persists on Workers**. A first attempt reported 2 failures only because the smoke pointed at port 8787 while the preview was on 8788 (another process answered with 500); the preview prints its port, so read it. |

## Production comes after, and separately

Not part of the staging go-ahead. When the staging run is clean and the owner approves the release:

1. Take a Neon restore point (the atomic runner requires you to say you did).
2. `npm run db:migrate:atomic -- --expect-host <production host>` (dry run), then with `--confirm --restore-point-taken`, with `DATABASE_URL` set only for that command.
3. **Then** deploy. The new code reads `merchants.status`, so deploying before migrating makes the portal pages error. Migrations are additive, so the old Worker keeps running between the two steps.
4. Grant the first programme its plan by hand: `npm run account:grant -- <email> affiliate_manager --confirm`.
5. Check on production: a portal page, the report page, `/app/affiliate` signed in, and `npm run affiliate:merchant -- list` against production (read-only).

Rollback is `npx wrangler rollback` for the Worker; the schema changes are additive and the previous Worker ignores them. The release gates in `docs/products/affiliate-manager.md` must all be met first.

## Phase 3A (referral links and recorded clicks): staging steps (run 2026-11-14, see Results)

Migration 0022 follows 0021. The atomic runner applies pending migrations **in journal order**, so a staging test of "0018, 0019 and 0022" is really the whole journal, ending in 0022 (0022 can't be applied without 0020 and 0021 in between). Use a **fresh, non-production** Neon database (creating or touching one is the owner's approval) and the same safeguards as above (`DATABASE_URL` in that one command, `--expect-host` typed by the owner, `--non-production`).

1. `npm run db:migrate:atomic -- --expect-host <host> --non-production` (dry run), then with `--confirm`. Expect the journal to read 23 rows.
2. `npm run affiliate:smoke -- --expect-host <host> --non-production --confirm`. Expect 14 of 14 (checks 13 and 14 are the link and click checks, through the real Neon HTTP driver).
3. The post-response write, on Workers: `npm run cf:build`, then run the preview against the same database (`.dev.vars` with that `DATABASE_URL`, or `npx wrangler dev --var`; a Worker has no PGlite, so the preview cannot run database routes without it) and run `npm run affiliate:smoke -- --expect-host <host> --non-production --confirm --redirect-base-url http://localhost:8787`. Three more checks run: the real 302 with `?ref=`, **the click written after the response appearing in the database** (polled for up to 10 s), and previews and paused affiliates recording nothing. Delete `.dev.vars` afterwards.

## Phase 3B (WooCommerce orders): staging steps and gates, not run

Migration 0023 follows 0022 and is additive. **Nothing below has been run.** Each step is its own approval, with the same safeguards as above. Read the branch selector in the Neon console **before** copying any connection string (after creating a branch the console switches to it; that is how the first 3A apply went to the restore-point branch).

1. Neon restore point on the staging project, then `npm run db:migrate:atomic -- --expect-host <host> --non-production` (dry run), then with `--confirm --restore-point-taken`. Expect the journal to read 24 rows (if staging has 0022).
2. `npm run affiliate:smoke -- --expect-host <host> --non-production --confirm`. Expect 15 of 15 (the new check records an order through the real Neon HTTP driver, applies a refund, ignores an older update and an unrelated coupon, and refuses a paused affiliate).
3. The signed order over HTTP, on Workers: `npm run cf:build`, preview against the same staging database with `AFFILIATE_WEBHOOK_MASTER` set **for the preview only** (`.dev.vars`), then `AFFILIATE_WEBHOOK_MASTER=<same value> npm run affiliate:smoke -- --expect-host <host> --non-production --confirm --redirect-base-url <the port the preview printed>`. Read the preview's "Ready on" line for the port. 16 of 16 with the signed-order check. Delete `.dev.vars` afterwards.
4. Production: restore point, migrate, `wrangler secret put AFFILIATE_WEBHOOK_MASTER` (hidden prompt), deploy, then `npm run affiliate:woo-test` against a **test** programme's address (the secret from its Store connection card, in `WOO_TEST_SECRET`). The live Wandernest Tales store is connected only when the owner starts that step.
