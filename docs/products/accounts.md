# Accounts & entitlements

The shared KaamSolv account system. First used by the Invoice Generator
(Stage 1, 2026-10-21); the URL Shortener and QR can use it later. Decisions:
[`DECISIONS.md`](../DECISIONS.md) (2026-10-21 "Invoice Pro — Stage 1").

## Flow

`Anonymous → Free account → Paid (Stage 3)` — CLAUDE.md §25. Every tool works
without an account. An account adds saving.

| | Anonymous | Free account | Invoice Pro (Stage 2–3) |
|---|---|---|---|
| Make and download invoices | ✓ | ✓ | ✓ |
| Draft survives a refresh (this browser) | ✓ | ✓ | ✓ |
| Saved invoices | — | **20** | unlimited |
| Settings (business details, GSTIN, bank/UPI, numbering, defaults) | — | ✓ | ✓ |
| Saved customers | — | **3** | unlimited |
| Saved items (HSN/SAC, unit, rate, GST) | — | ✓ | ✓ |
| Record payments, partial payments, payment history, balance per invoice | — | ✓ | ✓ |
| Overview (billed, still owed, overdue) + Payments & collections (received, ageing, monthly chart) | — | — | ✓ |
| No footer, multi-page (up to 200 lines) | — | — | ✓ |
| Templates + brand colour, quotations (+ convert to invoice) | — | — | ✓ |
| Recurring, CSV, currency rates (Stage 2C-2) | — | — | ✓ |

Customers and items also have a hidden anti-abuse ceiling of 1,000 rows each
(`DIRECTORY_HARD_CAP`) for every plan — not a paywall, never shown unless hit.

## Sign-in

- **Google** ("Continue with Google", account picker) and an **email sign-in
  link** (no passwords). Same verified email = one account, whichever method
  came first.
- Library: **better-auth 1.7.12, pinned exactly** (`better-auth/minimal`, no
  Kysely), Drizzle adapter on our Neon Postgres. Only `app/lib/auth.ts` and
  `app/lib/session.ts` import it. Fallback if it ever blocks us: Arctic (Google
  OAuth) + our own session tokens — about 25–30% of Stage 1, nothing outside
  auth changes.
- Both methods return through `/login?next=…`, which sees the session, marks
  this browser as signed in (`kk.account` in localStorage — lets the header skip
  `/api/me` for anonymous visitors) and forwards to `next` (same-site paths
  only, `app/lib/safe-next.ts`).
- Sign-in link: single use, 15 minutes, stored hashed. Rate limits (salted
  hashes, `db/rate-limits.ts`): 5/10 min and 20/day per IP; 3/10 min and 10/day
  per address. Over the limit → silently not sent; the page always says "if
  that address is real, a link is on its way".
- Session cookie `kk.session_token`: httpOnly, Secure, SameSite=Lax, 30 days
  (refreshed daily). better-auth's origin check is on; our own mutating API
  routes also require a same-site `Origin`.
- Stored minimum: email, name (Google), linked sign-in method. **No raw IPs**
  (`disableIpTracking`), **no Google tokens or profile photo** (stripped by
  `databaseHooks`).
- Email: Resend REST API via `fetch` (`app/lib/email.ts`), from
  `login@send.kaamsolv.com`. In dev with no key (or with `KK_E2E=1`) links are
  printed to the log and `test-results/mail-outbox.jsonl`.

## Entitlements

- Keys: `app/lib/entitlements.ts` (`ENTITLEMENT_KEYS`). Tools call `can(key)`
  and `limit(key)` — never "if paid, allow all".
- Resolution: `db/entitlements.ts`, **computed on every request**: the
  `free_account` plan for any signed-in user, plus the plan of every
  subscription that is `active` and inside `current_period_end`. Merged per key;
  the most generous limit wins (`null` = unlimited). Nothing is copied into a
  separate table, so a missed webhook can't leave stale access.
- Plans and their features live in `plans` / `plan_features` (seeded in
  migration 0003). A hand grant for testing or support is one `subscriptions`
  row with `provider = 'manual'`.
- Browser: `useEntitlements()` / `useMe()` (`app/lib/me-client.ts`) read
  `GET /api/me`. Every server route re-checks.

## Data (migration 0003)

| Table | Holds | Deleted with the user |
|---|---|---|
| `auth_users` | email, name, email_verified | — |
| `auth_sessions` | token, expiry, user agent | cascade |
| `auth_accounts` | provider + provider's user id (tokens always null) | cascade |
| `auth_verifications` | hashed sign-in link codes, OAuth state (15 min) | by email (no FK) |
| `plans`, `plan_features` | plan definitions | — |
| `subscriptions` | provider, ref, plan, status, period end | cascade |
| `business_profiles` | seller details, logo (≤ 280 k chars), next number | cascade |
| `invoices` | summary columns + `data` jsonb (no logo, ≤ 64 k chars); `status`, `paid_at`, `due_date`, `customer_id` (0004); `amount_paid` (0010, ledger total) | cascade |
| `invoice_payments` (0010) | the payment ledger: amount, date, method, reference, note, idempotency key, voided_at | cascade |
| `invoice_payment_events` (0010) | append-only audit trail of the ledger | cascade |
| `customers` (0004) | name, contact, email, phone, address, state code, GSTIN | cascade |
| `items` (0004) | name, HSN/SAC, unit, rate, GST rate | cascade |

`business_profiles` gained the Settings columns in 0004 (state, GSTIN, bank
account, IFSC, UPI, UPI-QR switch, number prefix, defaults). An invoice links to a
customer only when it is the same user's (`ownCustomer()` subquery); deleting the
customer clears the link (ON DELETE SET NULL) and the invoice keeps its own copy.

Every query on user data is scoped by the signed-in user's id; another user's id
is a plain 404. List endpoints and `/api/me` never return the logo or invoice
documents.

## API

| Route | |
|---|---|
| `/api/auth/*` | better-auth (sign-in, callbacks, sign-out, session) |
| `GET /api/me` · `DELETE /api/me` | who/entitlements/usage · delete account (`{confirm:"DELETE"}`) |
| `GET/POST /api/invoices` | list summaries · save new (403 `limit`). `GET` also takes search, type, sort, `page` and the Stage D filters → one page with `matched` and totals over every match; no params = everything, as before |
| `GET/PUT/DELETE /api/invoices/:id` | one invoice |
| `POST /api/invoices/:id/duplicate` | copy with next number and new dates (a quotation copies as the next quotation) |
| `POST /api/invoices/:id/convert` | quotation → new invoice, next invoice number (Pro) |
| `PUT /api/invoices/:id/recurring` · `POST /api/invoices/:id/recur` · `GET /api/invoices/due` | repeat schedule · Create/Skip a due reminder · what's due (Pro) |
| `GET /api/invoices/export` | CSV of invoices or line items (Pro) — server-built, up to 5,000 invoices; unchanged |
| `GET /api/invoices/reports?report=register\|payments\|outstanding\|ageing&currency=&today=[&from=&to=&customer=&state=&bucket=&method=&includeVoided=1&page=&pageSize=]` · `?report=meta` | Pro (`invoice_csv_export`, checked on every request, 403 without and no data): one small page of a report with totals over every match; the browser assembles the CSV. One currency; 413 over the cap; rate-limited; `private, no-store` |
| `POST /api/invoices/batch` | up to 50 invoices from a CSV (Pro) |
| `GET /api/fx` | currency reference rates, from Frankfurter (Pro) |
| `GET/POST /api/qr`, `GET/PUT/DELETE /api/qr/:id` | tracked QR codes: list · save (403 `limit` at 3 on free) · one with scans per day · rename / pause / resume · delete |
| `POST /api/qr/:id/duplicate` | a copy of a tracked code (same limit, rate limit and re-screening as Save) |
| `GET /api/qr/stats` | dashboard / analytics numbers; 90 days and breakdowns need `qr_breakdowns` |
| `GET/POST /api/qr/campaigns`, `PUT/DELETE /api/qr/campaigns/:id` | QR campaigns (`qr_campaigns`) |
| `GET /api/qr/export` | CSV of codes or scans (`qr_export`) |
| `GET/PUT /api/business-profile` | seller details + logo (the editor's save) |
| `GET/PUT /api/settings` | the Settings page (400 with `errors` per field) |
| `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id` | saved customers (403 `limit` at 3 on free). `GET` also takes `?q=&page=&pageSize=` (paged, `total`/`pages`) and, paged, `stats=1&today=` (per-customer invoice count and what's owed); without them the answer is unchanged (≤ 200) |
| `GET /api/customers/:id/summary?today=`, `GET …/unlinked`, `POST …/links` | the customer page: per-currency totals of connected invoices · invoices typed in by the exact name (a list to review, connects nothing) · explicit connect / disconnect of ticked invoices (any account with saved customers) |
| `GET/POST /api/items`, `GET/PUT/DELETE /api/items/:id` | saved items; `GET` also takes `?q=&page=&pageSize=` (paged) |
| `GET/POST /api/invoices/:id/payments`, `PATCH …/:paymentId`, `POST …/:paymentId/void` | the payment ledger: view · record (idempotent, 409 `exceeds`) · edit reference/note · void (any account, `invoice_payments`) |
| `PUT /api/invoices/:id/status` | only undoes a legacy “marked paid” (`unpaid`); `paid` is refused — record the payment |
| `GET /api/dashboard?today=` | Pro dashboard totals + recent invoices (unchanged) |
| `GET /api/invoices/collections?from=&to=&today=[&currency=&customer=]` | Pro (`invoice_dashboard`, 403 without): invoiced · received · outstanding · overdue · collection rate, monthly series, ageing, needs-chasing — one currency |
| `GET /api/invoices?state=&currency=&bucket=&issuedFrom=…&paidTo=&customer=` | filtered list for drill-down (any account): invoices only, ≤ 200 rows + totals over all matches; no filters = unchanged |
| `POST /api/test/oauth-sign-in` | **test only** — see below |

## Test-only sign-in

Playwright can't drive Google's real login, so `/api/test/oauth-sign-in` runs
better-auth's own `handleOAuthUserInfo()` (the function Google's callback runs)
with a Google-shaped profile. Three locks (`app/lib/e2e-gate.ts`): compiled out
of production builds (`NODE_ENV`), `KK_E2E=1`, and an `X-KK-E2E-Secret` header
matching a per-run `KK_E2E_SECRET` (constant-time compare). The better-auth
endpoint behind it is server-only and re-checks. **Never** a Worker secret.

## Pages

One KaamSolv account; **a workspace per tool**, each with its own plan; business
details shared by all business tools. Paths inside kaamsolv.com, not subdomains
(one cookie, one origin for drafts, one place for plans and billing — DECISIONS
2026-10-22).

```
/app                         Your KaamSolv — hub: a card per tool you use, its plan
/app/invoices                Invoices → All invoices
/app/invoices/overview       Invoices → Overview (Pro: billed, unpaid, overdue)
/app/invoices/collections    Invoices → Payments & collections (Pro: received, outstanding, ageing, monthly chart)
/app/invoices/reports        Invoices → Reports & exports (Pro: register, payments, outstanding, ageing as CSV)
/app/invoices/settings       Invoices → Invoice settings (numbering, defaults)
/app/business                Shared → Business profile (details, GSTIN, logo, bank/UPI)
/app/business/customers      Shared → Customers (free: 3)
/app/business/customers/<id> One customer: totals, invoices, typed-in invoices to review
/app/business/items          Shared → Items
/app/account                 Account (sign out, delete)
```

- The hub only shows tools that really have account features (Invoices today);
  new tools join as they get accounts. "Plans and billing" arrives with payments.
- Sidebar groups: Your KaamSolv · Tools (a tool's pages show while you're in
  it) · Shared · Account. Pro-only pages appear only for Pro.
- Header menu: Your KaamSolv · Invoices · Business profile · Account · Sign out.
- Business profile and Invoice settings are two views of one record
  (`/api/settings`); each sends the other's fields back unchanged.
- Old URLs redirect permanently (`/app/customers`, `/app/items`, `/app/settings`).
- Sign-in lands on `/app` unless `next=` says otherwise. `/login` (and
  `/signup` → `/login`). All `noindex`; `/app/*` redirect signed-out visitors to
  `/login?next=…`.

## Granting Pro by hand

Until payments exist: `npm run account:grant -- <email> invoice_pro --confirm`
(with `DATABASE_URL` set for that one command, like a migration). Adds a
`manual` subscription; `revoke --confirm` removes it; without a plan it shows
the account's plans and features. Dry run unless `--confirm`.

## Testing

- `test/accounts.test.mts` (PGlite, real migrations): seed, entitlement
  resolution, 21st save refused, IDOR, field caps, logo rules, `next` paths,
  cascade deletion, sign-in link limits, e2e gate.
- `tests/e2e/accounts.spec.ts`: runs on a throwaway `.pglite-e2e` database
  (`tests/e2e/start-server.mts`; free limit lowered to 3 **there only**, deleted
  on teardown). Covers draft, both sign-in orders = one account, carry-over,
  save/autosave/list/copy/delete, profile, limit, IDOR, response shapes,
  cross-site refusal, account deletion, redirects, the Google redirect URL, the
  test route's 404s, and screenshots.
- Manual before launch: a real Google round trip, and a real email arriving
  in the inbox (not spam).
