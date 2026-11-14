# Affiliate Manager: verifying the migrations on a staging Neon database

**Status (2026-11-14): prepared, not run.** No staging database exists and none has been created or contacted. Everything below that touches Neon needs the owner's explicit go-ahead first, and a database the owner creates.

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
6. **Record the result** in the table below (date, which checks, anything unexpected).

If a check fails, the line names it. The likeliest places on Neon are the unique-violation detection in `db/links.ts` (`isUniqueViolation`), parameter typing in the CTE statements in `db/merchant-scope.ts` / `db/affiliate-scope.ts`, and the `pg_trigger_depth()` rule in the trigger from migration 0019. Fix in code, re-run on a fresh database, and do not go to production until it is clean.

## Results

| Date | Database | Migrations | Smoke test | Notes |
|---|---|---|---|---|
| _not run yet_ | | | | |

## Production comes after, and separately

Not part of this document's go-ahead. When the staging run is clean and the owner approves the release:

1. Take a Neon restore point (the atomic runner requires you to say you did).
2. `npm run db:migrate:atomic -- --expect-host <production host>` (dry run), then with `--confirm --restore-point-taken`, with `DATABASE_URL` set only for that command.
3. **Then** deploy. The new code reads `merchants.status`, so deploying before migrating makes the portal pages error. Migrations are additive, so the old Worker keeps running between the two steps.
4. Grant the first programme its plan by hand: `npm run account:grant -- <email> affiliate_manager --confirm`.
5. Check on production: a portal page, the report page, `/app/affiliate` signed in, and `npm run affiliate:merchant -- list` against production (read-only).

Rollback is `npx wrangler rollback` for the Worker; the schema changes are additive and the previous Worker ignores them. The release gates in `docs/products/affiliate-manager.md` must all be met first.
