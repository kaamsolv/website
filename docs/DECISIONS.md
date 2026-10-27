# KaamSolv — Decision Log

Short, dated record of decisions that change the product, brand or
infrastructure. Newest first. Detail lives in the linked docs.

---

## 2026-10-27 — Billing M1: selling KaamSolv plans through Razorpay (built locally, not deployed)
Approved plan (read-only audit first): a verified Razorpay webhook, never the browser, switches a plan on; one-time **Orders first**
(Subscriptions auto-renew later); idempotent by Razorpay's event id; payment claim and plan grant in one SQL statement
(Neon HTTP has no transactions); full refund ends access at once; disputes suspend. Launch prices (generous, raise later, launch
subscribers keep theirs): Invoice Pro ₹149/₹1,490, QR Pro ₹99/₹990, bundle ₹199/₹1,990 (month/year), in `plan_prices`.
Sales records survive account deletion, unlinked. Open: GST treatment of prices and seller details (Beam Me Up), Razorpay
activation/keys/webhook. Later milestones (invoice email, links, WhatsApp share, summaries, accountant packs) are separate.
Details: [`products/billing.md`](products/billing.md).

## 2026-10-27 — Billing M2: sales invoice, email, private link, WhatsApp share (built locally, not deployed)
A verified payment queues a durable job (`outbox`, written before anything is attempted, deduped by payment). The job makes
**one** numbered invoice in the seller's own KaamSolv account (`BILLING_SELLER_EMAIL`; number, ledger and reports are the ordinary
ones), makes a private `/i/<token>` link and emails it with a stable idempotency key; a failed email retries with a back-off and
never makes a second invoice. Nothing about tax is guessed: no `BILLING_TAX_TREATMENT`, no seller details or a GSTIN that can't
honour it → the job waits as `blocked`. "Tax included" works only where the total reconciles exactly (₹149 monthly at 18% does
**not**: no two half-rate taxes add back to ₹149.00); "tax added on top" is not supported. Every account can share any invoice on
WhatsApp (click-to-chat, a wa.me link: nothing is sent for the user). Server PDF is a ~100-line writer, not pdf-lib (stubbed out of
the Worker). **Worker size: 2,966 KiB of 3,072 KiB gzip (was 2,730 at M1)**: no room for the next milestone, see the
recommendation in `products/billing.md`. Details: [`products/billing.md`](products/billing.md).

## 2026-10-27 — Gratuity Calculator (new catalogue tool, India)
`/gratuity-calculator`. Narrow on purpose, because the law changed on 21 Nov 2025 and the sources disagree: only the Act formula
(wages × 15 × years ÷ 26, more than six months rounds up, ₹20 lakh maximum, 5 years or 1 for fixed-term, none on death/disability).
The person enters "wages"; no tax calculation, no employers outside the Act, no CTC estimator; the page lists the rules it uses with
the date checked. Live 2026-10-27, after the owner reviewed the rules box and FAQ. Details:
[`products/gratuity-calculator.md`](products/gratuity-calculator.md).

## 2026-10-27 — Rent Receipt Generator (new catalogue tool, India)

**Decided by:** product owner (kickoff and plan approved 2026-10-27). Built, not deployed.

- **What:** monthly rent receipts for HRA, up to 24 months in one PDF, three to an A4 page, each with a landlord signature line.
  Made in the browser; nothing is sent or stored, not even locally. A **new** catalogue tool in **India** (the generic *Receipt
  Generator* stays planned); URL `/rent-receipt-generator`.
- **Rules it follows, from secondary sources only (tax-help sites), not the statute, and worded as "what employers usually ask for":**
  landlord PAN when rent is more than ₹1,00,000 in a financial year (a warning, not a block; format check only); a ₹1 revenue-stamp
  box for cash receipts above ₹5,000. Both limits are strict "more than". Rules and section numbers changed when the Income-tax
  Act 2025 took over in April 2026, so the page quotes no section numbers.
- **Out:** HRA calculation or tax advice, PAN verification or storage, e-signature, TDS, rent changing mid-range, any saved details.
  The page says to make receipts only for rent actually paid, and to ask the employer or a CA about HRA.
- **Not verified:** that any employer's payroll accepts the format, and the stamp and PAN rules against the statute.
- Details: [`products/rent-receipt.md`](products/rent-receipt.md).

## 2026-10-27 — PDF to Word: text first, in the browser, free

**Decided by:** product owner (chose both options when asked; plan approved 2026-10-27). Built, not deployed.

- **Approach:** in the browser (pdf.js + a hand-written `.docx` via fflate), not a server. Private (the file never leaves the device),
  no new service, cost or dependency. A server converter would give closer layouts but needs a paid conversion service, uploads,
  retention and abuse controls (CLAUDE.md §17): a much bigger decision, left for later if demand justifies it.
- **Free for everyone, 10 MB**, like the other PDF tools. `pdf_convert_office` stays reserved.
- **Honest limits, said on the page before the download:** text, paragraphs and headings only: no images, tables, columns, fonts
  or exact layout; scanned PDFs are refused (no OCR); 300 pages max.
- **Not verified here:** how Word, Google Docs and Pages display the file (structure and text are tested; the owner opens real files).
- Details: [`products/pdf-tools.md`](products/pdf-tools.md) → "PDF → Word".

## 2026-10-27 — Indian Number to Words (first of the Number to Words → Rent Receipt → Gratuity shortlist)

**Decided by:** product owner (picked from the shortlist; kickoff and plan approved 2026-10-27). Built, not deployed.

- **Why this one:** fastest to build, steady India-wide demand (cheques, invoices, forms), and the core already existed in `app/lib/invoice/words.ts`. Rent Receipt and Gratuity each get their own kickoff.
- **Exact text, no floats:** the tool parses what is typed (`parseAmountText`) and words it with BigInt, so paise never drift. It **refuses** what could change an amount (a comma that isn't a thousands separator such as `1,5`, a minus sign, letters, more than 2 decimal places) instead of guessing. Limit **14 integer digits** (99 lakh crore); the plan said 15, but at 15 the crore count itself passes a crore and the words repeat "Crore".
- **Out for now:** Hindi and other languages (needs a reviewed 0–99 table), international (million/billion) wording, other currencies, lakh↔million conversion (the planned Indian Currency Converter), PDF/cheque printing.
- **The Invoice Generator is unchanged:** `indianNumberWords` now delegates to the BigInt version; a test compares it with a verbatim copy of the old code on thousands of values.
- Details: [`products/indian-number-to-words.md`](products/indian-number-to-words.md).

## 2026-10-27 — Security headers, robots.txt sitemap line, deploy guard

**Decided by:** product owner (asked for both after a read-only audit on 2026-10-27). Not yet deployed.

- **Headers:** a conservative set on every Worker-handled route (HSTS 1 year, nosniff, SAMEORIGIN, `frame-ancestors/base-uri/object-src` CSP, Referrer-Policy, Permissions-Policy). **No `script-src` CSP yet**: nonces would end static pre-rendering and GA/Razorpay need allow-listing; a later, separate decision. No `includeSubDomains`/`preload`.
- **robots.txt** now generated by `app/robots.ts` with the `Sitemap:` line; `/app/` and `/api/` disallowed.
- **Deploy guard** in `cf:deploy`: the checkout must contain `origin/main`, be pushed, and have no uncommitted shipping files; `KK_DEPLOY_OVERRIDE="reason"` for deliberate exceptions. Does not cover Workers Builds or a bare `opennextjs-cloudflare deploy`, and can't know whether a pushed feature branch has been merged to `main`.
- Details: `docs/infra/deployment.md` → Deploy guard, Security headers.

## 2026-10-26 — Release-readiness audit: remediation before the invoice release (built, not deployed)

**Decided by:** product owner, after a read-only audit of Stages C–F. Detail: [`infra/deployment.md`](./infra/deployment.md) §9
"Applying a migration to production".

- **`main` merged into the feature branch** (local only, no conflicts): the branch had lacked the analytics fix that keeps Google Analytics off `/app`
  pages and strips page addresses — which matters more now that invoice-list and customer URLs carry filters and ids — and the QR "Save tracked QR" fix.
  Deploy only from a branch that contains the latest `main`.
- **Privacy page now describes payment records**: amount, date received, method, reference, note, void reason and date, and the payment audit history
  (which also keeps a note's or reference's earlier wording). **Retention is unchanged and disclosed:** the history is kept while the invoice exists and
  deleted with the invoice or account. A shorter retention would be a separate decision.
- **Migration 0010 is applied with `npm run db:migrate:atomic`**, not `db:migrate`: the Neon HTTP migrator is not atomic (each statement is its own request, the
  journal row comes last), so a mid-migration failure leaves a half-applied schema that a re-run can't get past. The atomic runner sends the statements and
  the journal row as one transaction, refuses a database whose journal differs from the checkout, and needs `--confirm --restore-point-taken`. It never picks a
  target: `DATABASE_URL` must be in that one command's environment (no `.env` file is read), `--expect-host` must match it every time (dry run included) or nothing is
  contacted, and every error it prints is one line scrubbed of the connection string and password (an escaping error is caught and printed the same way — never Node's dump of the error object, which for an invalid URL contains the whole string). The rehearsal script additionally needs `--non-production` and refuses any
  database that has a user in it; both CLIs are tested as real processes.
  Proved on PGlite (same schema and journal as drizzle's migrator; injected failures leave nothing behind); **not yet run against any Neon database.**
- **Tooling hardened after a review of how the Neon driver really behaves** (uncommitted at the time of writing): `sql.transaction` is one HTTP request whose atomicity is the server's, so an error
  the database reports means rolled back, while a dropped connection or a 5xx means the outcome is *unknown* — the runner now says exactly that and tells the operator not to re-run `--confirm`.
  The journal-hash check tolerates LF/CRLF (migration files are CRLF in a Windows checkout and LF in git; drizzle ignores the hash) but still refuses any other difference.
  The rehearsal's emptiness check now covers **every application table**, not just users — a copy of production from before accounts existed has links and clicks but no users. The concurrency harness
  fails on any unexpected error (deadlock, serialization failure, timeout, a refusal other than "more than is owed") and checks the payment audit trail. `npm run db:rehearsal:prepare` builds production's
  pre-0010 state with drizzle's own migrator on a brand-new database, so the rehearsal starts where production is.
- **Review fixes to that tooling** (an independent read-only review found these; uncommitted at the time of writing): uncaught errors could print the connection string (confirmed for a malformed URL in the payments
  harness) — all three tools now install a handler that prints one scrubbed line; the emptiness check read `information_schema`, which hides tables from a role without privileges, so it now uses `pg_class`, and treats an unreadable
  or row-level-security table as unverifiable; the harness read `--expect-host` as the *first argument* when the flag was missing — all tools now share one parser that never falls back; the runbook's `npm run db:migrate` step
  (no host gate, reads `.env` files) is removed and the §9 warning added; claims of certain atomicity and of "everything printed is scrubbed" were qualified; and a test parses every `.mts` file with `node --check`, because
  `npm run typecheck` covers only `.ts`/`.tsx` and had let a syntax error in a CLI through.
- **Remaining tooling findings addressed** (uncommitted at the time of writing; none of it validated on Neon): the migration transaction now begins with `SET LOCAL lock_timeout` (5 s) and `statement_timeout` (60 s),
  configurable within bounds, then an advisory lock and a check that the journal is still what the plan saw — so a second operator's stale plan fails cleanly instead of applying twice (a data-only migration would have);
  timeout errors are a confirmed rollback only when the database reported them (they carry a SQLSTATE), a client or gateway timeout stays "outcome unknown". The CLI logic moved into `db/atomic-cli.ts` / `db/prepare-cli.ts`
  behind a driver interface and is tested against a fake driver (gates, dry run, the exact transaction, already-applied, journal mismatch, confirmed rollback, unknown outcome, read-back failure → exit 3). The refusal no longer
  tells the operator the host; the emptiness check covers every non-system schema; `--through` must be exact; `npm run db:host` replaces hand-parsing the URL in PowerShell; the payments rehearsal repeats its scenarios behind
  a start barrier and reports requests and in-flight overlap without ever claiming a race, and a locally-injectable fault proves it fails on an unexpected error even when every total reconciles.
- **First real Neon rehearsal, 2026-10-27** (a brand-new throwaway project, PostgreSQL 18.6, run with the committed tools through a one-command program; nothing of production was touched). Passed: real statement and lock
  timeouts (57014, 55P03) inside Neon's HTTP transaction; the runner accepting drizzle's journal rows; a planted conflict making 0010 fail at its second-to-last statement and **rolling back completely** (a `42710` error from the
  database, correctly reported as rolled back); the real apply in one transaction; repeat runs and drizzle's own migrator as no-ops. It found **two real defects**, both fixed: (1) the tools called `process.exit()` while the Neon driver's sockets
  were closing, which crashed Node on Windows with a garbage exit code right after a correct message (the repo's db/link-status.mts documents the hazard; the tools now set `process.exitCode`, and a test forbids `process.exit()` in them);
  (2) **payments deadlocked under concurrency** — the foreign-key check on `invoice_payments.invoice_id` takes a KEY SHARE lock on the invoice row, then the ledger trigger asks for FOR UPDATE on it, and two or more simultaneous payments
  each wait to upgrade (SQLSTATE 40P01; 31 failed requests in 2 of 20 rounds, totals still correct). Fixed without a migration by taking `FOR UPDATE` on the invoice row inside the insert statement itself (`insertPaymentStatement`);
  the same 20 rounds then passed with no deadlock (720 requests released together). PGlite, with its single connection, cannot show a deadlock, so this class of defect is only found on a real server.
- **Docs corrected**: the old Worker does *not* simply ignore 0010 — its Pro "Mark paid" fails with a server error from the moment 0010 exists until the new
  Worker is live (and after a Worker-only rollback); a Worker rollback keeps all payments; a database rollback destroys them.
- **Cloudflare plan is not assumed.** The repo doesn't record it; earlier wording that treated it as the free plan was reworded. Owner to confirm the plan,
  which sets the Worker's CPU and bundle limits.
- **Stage E pager race fixed** (`directory-manager.tsx`, found while re-running the suite): the customers/items search timer also fired once after
  the list opened and reset it to page 1 even though the search text hadn't changed, so a quick click on another page was undone; and a late answer
  for an older page could replace a newer one. Now the list returns to page 1 only when the search text changes, and only the latest request's answer is
  used. Two browser tests (a controlled clock that fires the timer after a page is chosen; a deliberately late page-2 answer) fail on the old code and
  pass on the new.
- **Neon rehearsal harness** (`scripts/rehearse-payments.mts`) prepared; it refuses any database that contains a user, so it can't run on a copy of real
  data. Real concurrency on Neon remains unverified until it is run on a dedicated empty branch.

---

## 2026-10-26 — Reports & exports, Stage F (Pro): decisions applied (built, not deployed)

**Decided by:** product owner (plan approved with F1–F8 as recommended, plus nine conditions). Detail:
[`products/invoice-generator.md`](./products/invoice-generator.md) "Reports & exports".

- **F1** The CSV is **built in the browser from small server-computed pages** (100 register / 500 payment rows), not on
  the server: a Node benchmark of the existing export (5,000 GST invoices ≈ 90 ms of JavaScript, 7.6 MB of documents) is
  a proxy only, but it is a lot of work for one request on any plan whose CPU limit is small (the actual Cloudflare plan is not
  recorded and is unconfirmed), while a page costs under 1 ms of JavaScript. Cap 10,000 / 50,000 / 10,000 rows. **F2** Reuses the existing `invoice_csv_export` entitlement, checked
  server-side on every request; no new key. **F3** One currency per file, never converted. **F4** Voided payments are
  excluded from totals, listed only on request and labelled "Voided" / "Not counted". **F5** Nothing is invented for
  legacy marked-paid invoices (a note and a count, no rows). **F6** The existing `/api/invoices/export` and `csv.ts`
  are untouched. **F7** Formula-injection defence, escaping, UTF-8 BOM, caps, progress, cancel and an integrity check
  (whole-paise totals, drift detection between pages) are all kept — the check exists because a multi-request export
  is not one snapshot. **F8** Labelled operational reports — not GST returns or tax filings — in the page copy and in
  tests that forbid statutory wording in column names.
- **No migration, no dependency.** Page queries pick ids on narrow columns and read documents only for the page
  (deep register pages 116 ms → 23 ms in the proxy); no index was needed. A new rate-limit entry (`invoiceReport`,
  120/min and 1,200/h per account) is configuration, not schema.
- The register's total, received and balance are the stored, ledger-backed figures; tax columns are derived from the
  invoice's own lines and left blank (with a count in the result) when they no longer match the stored total.
- Unverified: actual Worker CPU for a report page, and which Cloudflare plan (and so which limits) applies. The proxy says one page is ~1 ms of JavaScript plus database time;
  confirm on a deployed Worker before relying on it, and lower the page sizes if a page ever runs hot.

---

## 2026-10-26 — Invoice workspace, Stage E: search and paging, customer pages, safer item fill (built, not deployed)

**Decided by:** product owner (plan approved with E1–E8 as recommended). Detail:
[`products/invoice-generator.md`](./products/invoice-generator.md) "Invoice workspace".

- **E1** The customer page's money totals and invoice history are **free for every account** (own-data bookkeeping);
  period analytics stay Pro. **E2** An **explicit connect / disconnect** flow for invoices typed in by a customer's
  exact name — a list to review with nothing ticked, confirmed before it acts, changing only `customer_id`.
  **E3** Offset pages (25 by default, ≤ 100), URL-driven; ZIP ticks persist across pages; the batch-result link uses
  `ids=`. **E4** Items have no currency: neutral "Default rate" wording, rate filled as typed on any invoice.
  **E5** Item fill never overwrites typed values, clears stale auto-filled ones when switching items, and does
  nothing for duplicate names. **E6** Server-side suggestions in the editor past 200 saved. **E7** One stage,
  one review. **E8** No migration and no index (benchmarked: every new query ≤ 26 ms median).
- **Customers are never matched or merged by name.** The table allows duplicate names, so a name can't say which
  customer was meant. Reads change nothing; a connection is made only for invoices the owner ticks and confirms.
  Saving a name you already have warns, then allows it.
- **The unfiltered `GET /api/invoices` answer is unchanged** (batch import depends on it), as is the Stage D filtered
  answer; the paged answer is new and opt-in by parameter. `/api/dashboard`, invoice create and edit, GST maths,
  PDFs, quotation workflows and recurring reminders are untouched; the invoice document gains no field.
- Every list, page and customer total reconciles with the Stage D numbers (same SQL fragments), tested.
- Directory lists page on the server: the old plain list stopped at 200 although Pro can save 1,000; it still does,
  for compatibility, and the manager and editor no longer depend on it.

---

## 2026-10-26 — Payments & Collections, Stage D (Pro): decisions applied (built, not deployed)

**Decided by:** product owner (plan approved with D1–D6 as recommended, plus two clarifications). Detail:
[`products/invoice-generator.md`](./products/invoice-generator.md) "Payments & Collections".

- **D1** Outstanding, overdue and ageing are **balances as of today**; the period applies to
  invoiced, received, collection rate and the monthly chart. **D2** reuse the Pro key
  `invoice_dashboard` (no new key, **no migration**). **D3** default period is the
  current **Indian financial year (Apr–Mar)**. **D4** saved-customer filter included
  (saved customers only). **D5** top-five "Needs chasing" included. **D6** no indexes
  added; benchmarked first (5,000 invoices / 20,000 payments: dashboard median ≈ 41 ms,
  24-month maximum ≈ 60 ms on in-memory Postgres).
- **Clarification 1 — collection rate is the invoice-cohort rate**, labelled as such
  ("Collection rate (invoices issued in this period)"), and kept visibly apart from
  **Received** (cash that arrived in the period, any invoice). The page says they won't
  match; marked-paid invoices are excluded from both and reported on their own.
- **Clarification 2 — time, stated once:** business dates are plain calendar dates, never
  converted; "today" is the browser's date, **required**, accepted only within a day of
  server UTC (no server-clock fallback); the financial year, ranges, overdue and ageing are
  all computed from that date, so IST just after midnight and 31 March ↔ 1 April behave
  the same wherever the server runs. Boundary tests added.
- **Everything is computed on the server from the ledger**; the browser lays numbers out.
  One currency at a time, never summed or converted. Pro is enforced in the API (403, no
  figures) as well as the page.
- **Every drill-down reconciles:** the filter SQL (outstanding, overdue, buckets, payment
  states) is defined once and shared with the figures; filtered lists return totals over
  every match, which equal the card even when the list is cut at 200. Filtering one's own
  invoices is open to every account; the analytics are Pro.
- `/api/dashboard` and the Overview are unchanged apart from one link.

---

## 2026-10-26 — Invoice payments, Stage C: a ledger, not a switch (built, not deployed)

**Decided by:** product owner (plan approved with six changes). Detail:
[`products/invoice-generator.md`](./products/invoice-generator.md) "Payments".

- **Source of truth is a payment ledger** (`invoice_payments`, migration 0010).
  `invoices.amount_paid` is its trigger-maintained total and `invoices.status`
  follows it. The `unpaid | paid` enum is **unchanged** — "partially paid" is
  derived (`unpaid` with money received) — so no enum migration and old code keeps
  working. The ledger tables are relational, with money in `numeric(14,2)`.
- **Free accounts record payments and see the history** (new key `invoice_payments`
  on `free_account` and `invoice_pro`); the Overview, collection analytics, ageing
  and reports stay Pro. Previously even paid/unpaid tracking was Pro: **this widens
  Free** — recorded payments are the basic record of whether an invoice was paid.
- **No "Mark as paid" switch.** Recording the payment settles the invoice; the
  database refuses `unpaid → paid` unless the ledger covers the total. The old
  status endpoint now only undoes a legacy mark.
- **Rules live in the database** (owner, currency, never above the total, immutable
  amounts, fixed currency/type and a total floor once paid), enforced under the
  invoice row's lock, so two payments at once can't overshoot. Neon HTTP can't hold a
  transaction, so every change is a single statement plus triggers.
- **Idempotent by key:** one `clientKey` per form; a repeat returns the original.
- **Mistakes are voided, not edited or deleted:** the entry stays, with a reason, an
  audit event is written, and the right payment is recorded after. Only reference and
  note can change in place.
- **Overpayment is refused** (no credit/advance workflow); **write-off/adjustment is
  deferred** — a balance clears only by recording payments.
- **Legacy "marked paid" invoices are not rewritten:** shown as "Marked paid — no
  payments on record", counted as settled but not as received; reconciling is an
  explicit action that can honestly turn one into Partially paid.
- **Dashboard formulas are fixed** (per currency, never converted; invoiced vs
  received vs outstanding vs overdue vs collection rate) and written down in the
  product doc. In Stage C the Overview's "Unpaid"/"Overdue" already use the remaining
  balance. Charts, ageing and customer totals are Stage D/E.
- **Rollback caution:** unlike 0007–0009, dropping 0010's tables removes
  user-entered financial data; prefer rolling back the Worker only (deployment doc).
- Not done in Stage C: write-off, credit notes, refunds, reminders, any automatic email.

---

## 2026-10-25 — Google Analytics 4 (consent-first) — deployed (d6193c4d, redeployed 8866be1c)

**Decided by:** product owner. Deployed 2026-10-25 from branch `claude/exciting-spence-025d65` with `NEXT_PUBLIC_GA_ID` set at build time (Worker version `d6193c4d-7c5c-49c0-8338-0223c65d536c`). Enhanced measurement to be switched off in the GA4 stream.

- **GA4 via `gtag.js`, no new dependency.** `app/_components/analytics.tsx`
  (mounted in the root layout) + `app/lib/analytics.ts`. Measurement ID from
  `NEXT_PUBLIC_GA_ID` (build-time); unset (local, dev, e2e) → nothing renders,
  loads or sends.
- **Consent first.** Banner with equally prominent "Accept analytics" / "No
  thanks". Until "Accept", `gtag.js` is **not loaded**: no request to Google, no
  `_ga` cookie. Consent Mode v2 is still declared (all four signals denied by
  default; only `analytics_storage` granted on accept; ad signals and Google
  signals permanently off). The choice lives in localStorage
  (`kaamsolv-analytics`) and can be changed at `/privacy#analytics`; withdrawing
  sets `ga-disable-<ID>` and deletes `_ga*` cookies.
- **What is sent:** `page_view` (path only: no query string, hash or `/app/*`),
  `tool_open`, `tool_success`, `tool_error`, `file_download`, `outbound_click`,
  with fixed-label parameters only. Never file names, contents, typed values,
  shortened URLs, invoice data or error messages. Detail: `docs/ANALYTICS.md`.
- **The ID is committed in `.env.production`** (public, not a secret) so no
  deploy depends on someone remembering a shell variable (2026-10-25: the first
  deploy only worked because the variable was set in that one command).
  `npm run cf:deploy` now runs `scripts/check-analytics-build.mts` between build
  and deploy: it fails unless the ID resolved with Next's precedence is in the
  built client files. Opting out needs `NEXT_PUBLIC_GA_ID=off` *and*
  `KK_ALLOW_NO_ANALYTICS=1` (not an empty value, which PowerShell/cmd delete).
  `cf:preview`, dev, tests and Playwright are unchanged.
- **Cloudflare Web Analytics stays** (cookieless, auto-injected by Cloudflare;
  verified on the live site: `static.cloudflareinsights.com` beacon and
  `/cdn-cgi/rum`). It runs without asking because it uses no cookies or
  storage; it is now listed on the Privacy page.
- **Privacy page rewritten** (new Analytics section, cookies, providers). It
  mentions the DPDP Act and says it is not legal advice; owner to review the
  wording, ideally legally.
- **Search Console:** a separate step, not in this change.

---

## 2026-10-25 — Salary Calculator (CTC → in-hand), India

**Decided by:** product owner (plan approved).

- **One tool, not two.** The catalogue's "Salary Calculator" (Money) and
  "Salary / CTC Calculator" (India) are merged into one live tool at
  `/salary-calculator`, category **India**. Logic in `app/lib/calc/salary.ts`
  (unit tests `test/calc-salary.test.mts`), UI in
  `app/_components/calc/salary-calculator.tsx`.
- **v1 scope:** CTC + optional bonus in; monthly and yearly in-hand out, new and
  old regime compared, full breakdown, Copy. Old regime takes one "deductions
  you claim" box (80C incl. PF, 80D, HRA exemption, home-loan interest). No
  HRA/80C sub-calculators, no state professional-tax table (one field, default
  ₹200/month, capped at ₹2,500/year), no ESI/NPS, no senior-citizen slabs.
- **Rules (checked 25 Oct 2026, FY 2026-27, Income-tax Act 2025 in force from
  1 Apr 2026):**
  - New-regime slabs 0–4L nil, 5/10/15/20/25%, 30% above ₹24L; standard deduction
    ₹75,000; rebate to nil up to ₹12L taxable, with marginal relief above it.
    Budget 2026 left slabs unchanged. Source: incometax.gov.in (AY 2026-27
    page) and news coverage of Budget 2026.
  - Old regime (under 60): 2.5L nil, 5/20/30%; standard deduction ₹50,000;
    rebate up to ₹12,500 at ≤ ₹5L. Professional tax is deductible in the old
    regime only.
  - Surcharge 10/15/25% (old 37% above ₹5 Cr) with marginal relief; 4% cess.
  - **EPF wage ceiling ₹25,000/month from 17 Sep 2026** (PIB PRID 2310811,
    2313829). Used for the whole FY, not prorated.
  - Labour codes (21 Nov 2025): wages ≥ 50% of pay; allowances above 50% count
    back as wages for PF and gratuity. Default Basic = 50% of fixed pay.
- **Calculation choices:** gratuity = annual basic × 15/26 ÷ 12 (≈ 4.81%) when
  it's in the CTC; employer PF is not taxable salary; monthly in-hand excludes
  the tax attributable to variable pay (tax with bonus − tax without), which
  the page states; professional tax is paid once in cash and, in the old
  regime only, also lowers taxable income.
- **Benchmark check (25 Oct 2026):** with the same PF and professional tax
  entered, ClearTax matched our in-hand except for gratuity (₹6L: ₹43,800 vs
  ₹42,598; ₹12L: ₹93,800 vs ₹91,396 — the gap is exactly our gratuity). At ₹25L
  ClearTax also taxes the employer's PF (₹1,75,561 vs ₹1,72,666). Groww has no
  income-tax step and gave no usable result; AmbitionBox needs a
  company/designation form submitted, so it wasn't tested. The page says other
  calculators may show more and why; it doesn't name them.
- **Re-check** `SALARY_RULES` / `SALARY_RULES_CHECKED` after every Budget,
  any EPFO ceiling change and the labour-code rules as states notify them.

---

## 2026-10-25 — PDF tools, Stage 1 (free): libraries, routes, keys

**Decided by:** product owner (§46 kickoff + plan approved; install approved
separately before it ran). Detail: [`products/pdf-tools.md`](./products/pdf-tools.md).

- **Libraries:** `pdfjs-dist` 6.4 (rendering; moved from dev to production
  dependency, same version) + **`@cantoo/pdf-lib` 2.11.1, pinned** (writing).
  Chosen over the original `pdf-lib` (no release since Nov 2021; the fork keeps
  its API and is maintained) and over pdf.js-only (it can't rewrite images, so
  no real compression). `mupdf.js` rejected: AGPL-3.0 and ~10 MB WASM. Both load
  only on first use and are stubbed out of the Worker.
- **pdf.js runtime files** (WASM decoders for scanned PDFs, standard fonts,
  ~1.9 MB) served as static assets from `public/vendor/pdfjs/`, synced by
  `npm run pdfjs:sync` and checked by a test. Not in the plan; needed for JBIG2 /
  JPEG 2000 scans to render.
- **Routes:** hub `/pdf-tools` + `/compress-pdf`, `/merge-pdf`, `/split-pdf`,
  `/pdf-to-jpg`, `/jpg-to-pdf` — top-level like every live tool, not
  `/documents/…`. New catalogue tools: Compress PDF, PDF to JPG. PDF to Word
  stays planned.
- **Free tier:** 10 MB per file (owner's choice; flagged that many scans people
  need to compress are 10–20 MB — revisit with real use), merge 3, JPG → PDF 5,
  standard compression, no daily cap, no watermark, no sign-up.
- **Entitlement keys:** `pdf_batch_compress`, `pdf_unlimited_merge`,
  `pdf_advanced_split`, `pdf_convert_office`, `pdf_ocr`, `pdf_large_files`, plus
  **`pdf_batch_convert`** (added: the brief's "batch image conversion" had no
  key). Checked per key in `app/lib/pdf/limits.ts`. No plan seeded yet — Pro
  features are Stage 2.
- **Not in v1:** editing, e-signatures, PowerPoint, unlocking, server uploads,
  PDF → Word/Excel and OCR (each a separate decision).

---

## 2026-10-26 — QR workspace: dashboard, management, campaigns, analytics, exports

**Decided by:** product owner (plan approved with six clarifications). Detail:
[`products/qr-tracking.md`](./products/qr-tracking.md) "QR workspace".

- **The 25 Oct split stands.** Free: dashboard, search / filter / sort, download,
  duplicate, pause, 7 / 30-day chart and Scan analytics. QR Pro (hidden until
  payments, server-side `can()`): campaigns, country / device / referrer
  breakdowns, the 90-day range, CSV export. No upgrade buttons.
- **Limits:** `qr_dynamic` (free 3) counts the whole stored library; the 2,000
  cap is a separate abuse ceiling; Duplicate obeys the same limit, rate limit and
  re-screening as Save.
- **Scans** have one definition everywhere (non-bot events = `click_count`);
  analytics show only what we record (no OS), labelled all-time vs date-range.
- **Deferred:** folders, brand presets, QR settings, OS, UTM, destination edits.
- Migration 0009 (additive; rollback in `infra/deployment.md`).

---

## 2026-10-25 — Tracked QR codes: first slice ("count only")

**Decided by:** product owner, after a codebase reality check. Detail:
[`products/qr-tracking.md`](./products/qr-tracking.md).

- Signed-in users can save a **link-type** QR (Website, WhatsApp, Social, File)
  as a *tracked* QR: it encodes `kaamsolv.com/{code}` and scans are the link's
  clicks. Location (`geo:`) and the non-link types stay static.
- **Free account: 3 tracked codes**; `qr_pro` (unlimited) exists but is not sold
  or shown. **A printed code never dies** — the redirect never checks plans.
- Reuses the URL Shortener's redirect, click recording, Web Risk screening and
  limits; the redirect route is unchanged. `links.account_id` becomes a real FK
  (cascade), written only for tracked codes.
- The logo is **not** saved with a code (500 KB; the QR content is identical).
- **Deferred:** campaigns, UTM, breakdowns, editing a destination, CSV export, and
  the `click_events.os` column (needs a privacy-policy change).
- Migration 0008 (additive; rollback SQL in `infra/deployment.md`). Privacy page
  updated: saved tracked codes are kept in your account.

---

## 2026-10-25 — Stage 2C-2: Invoice Pro — recurring, CSV export, batch from CSV, currency rates

**Decided by:** product owner (plan approved with four clarifications). Detail:
[`products/invoice-generator.md`](./products/invoice-generator.md) "Pro — Stage 2C-2".

- Hidden from free accounts, like 2C-1, until payments exist.
- **Recurring is a reminder, not automation:** a "Due to repeat" card with
  Create / Skip. No emails to clients, no scheduled jobs. "Today" is the
  browser's local date, accepted within a day of server UTC.
- **CSV export:** one row per invoice, or one row per line item (HSN/SAC view);
  matches the PDF's totals; formula-safe cells; 5,000-invoice cap.
- **Batch from CSV:** max 50 invoices, checked in the browser and again on the
  server; ZIP of PDFs built in the browser with `fflate` (no new dependency);
  recoverable from All invoices ("Download N as ZIP"). Re-uploading the same
  file makes the invoices again (flagged in the preview, not blocked).
- **Currency rates:** Frankfurter (free, no key), the blended feed — not
  ECB-only, which lacks AED. On screen and Overview only, never on the PDF, and
  labelled as a reference rate (GST on exports uses the notified rate). Kept
  Pro, as asked on 2026-10-22; costs nothing to serve, so the gate is a
  product choice.
- Migration 0007 (additive; rollback SQL in `infra/deployment.md`).
- `docs/README.md` status table brought up to date (separate docs commit).

---

## 2026-10-22 — Stage 2C-1: Invoice Pro — no footer, multi-page, templates, brand colour, quotations

**Decided by:** product owner (plan approved). Detail:
[`products/invoice-generator.md`](./products/invoice-generator.md) "Pro — Stage 2C-1".

- Stage 2C split in two: **2C-1** (this) and **2C-2** (recurring, CSV export,
  batch from CSV, currency rates via Frankfurter / ECB — source approved).
- Pro stays **hidden** from free accounts until payments exist (Stage 3): no
  tags, no "coming soon".
- Multi-page for Pro only (up to 200 lines); free keeps 10 lines on one page.
- Three templates (Classic default, Minimal, Bold) + brand colour (8 swatches
  or hex); text on the colour auto-picks white or navy.
- Quotations: own numbering (`QT-`), valid 30 days, never a tax invoice (GST
  shown as an estimate), no UPI QR, no paid/unpaid; convert to a new invoice
  keeps the quotation. Overview counts invoices only.
- Migration 0006 (additive).

---

## 2026-10-22 — Stage 2B: GST tax invoice (free)

**Decided by:** product owner (plan approved). Detail:
[`products/invoice-generator.md`](./products/invoice-generator.md) "GST tax invoice".

- Free for everyone, no account: TAX INVOICE when the seller has a GSTIN and
  charges GST in INR; BILL OF SUPPLY for composition sellers.
- Follows CGST Rule 46 particulars; place of supply decides CGST+SGST / UTGST /
  IGST; per-line GST rates and HSN/SAC; tax summary; amount in words.
- Default anonymous invoice number shortened to `INV-YYMMDD-XXXX` (15 chars) to
  fit the 16-character GST rule.
- Business profile gains composition + optional signature (migration 0005).
- Out of scope: e-invoicing, online GSTIN lookup, cess, LUT/bond, credit notes.

---

## 2026-10-22 — Account hub: one account, a workspace per tool (paths, not subdomains)

**Decided by:** product owner. Detail: [`products/accounts.md`](./products/accounts.md).

- `/app` is "Your KaamSolv": a card per tool with its own plan. The Stage 2A
  "Dashboard" became **Invoices → Overview** (`/app/invoices/overview`).
- Business profile, customers and items are **shared** (`/app/business/*`) so
  quotations, receipts and UPI QR codes can reuse them; invoice numbering and
  defaults moved to **Invoice settings**.
- **Paths, not subdomains** (`invoice.kaamsolv.com` considered): subdomains
  would need cross-subdomain cookies and auth origins, split browser drafts
  between origins, and scatter plans/billing. An optional redirect from
  `invoice.kaamsolv.com` can be added later as a Cloudflare rule.
- Each tool keeps its own subscription; a later all-tools bundle is just
  another plan. No database change.

---

## 2026-10-22 — Invoice Pro, Stage 2A: workspace + GST rate dropdown

**Decided by:** product owner. Detail: [`products/accounts.md`](./products/accounts.md),
[`products/invoice-generator.md`](./products/invoice-generator.md).

- **GST tax invoice stays free** (full version in Stage 2B).
- **GST rate dropdown** with the post-22 September 2025 slabs (5% and 18%, 40%
  demerit, plus 0, 0.25, 3%) and an on-screen note; 12% / 28% dropped (PIB note,
  Notification 9/2025-CT(Rate)). Default is "Choose rate", not 18% — deviation
  from the plan, so unregistered sellers never charge GST by accident.
- **Free with an account:** Settings, Customers (**limit 3** — owner, 2026-10-22),
  Items. **Pro:** Dashboard + paid/unpaid; currency reference rates (2C).
- Pro list can change any time via `plan_features` (data, not code).
- Manual Pro grants via `npm run account:grant` until payments exist.
- GSTIN / IFSC / UPI / HSN checked for format only; no online GSTIN lookup
  (needs a paid GSP) and no e-invoicing (> ₹5 crore only).
- `heic2any` stubbed out of the Worker like react-pdf (−334 KiB gzip).

---

## 2026-10-21 — Invoice Pro, Stage 1: accounts + saving

**Decided by:** product owner (plan approved after two review rounds).
Detail: [`products/accounts.md`](./products/accounts.md).

- **Pro ships in three stages**, each approved separately: 1 accounts + saving;
  2 Pro features (tested with hand grants); 3 payments.
- **Payments: Razorpay** (registered business; Stripe India is invite-only).
  Prices decided before Stage 3.
- **Sign-in: Google + email sign-in link**, no passwords. **better-auth 1.7.12,
  pinned exactly** (Auth.js is security- and critical-fixes-only under the
  Better Auth team, per its own announcement, nextauthjs/next-auth discussion
  #13252). Fallback: Arctic + our own sessions; only auth files change.
- **Email: Resend**, plain `fetch`, from `login@send.kaamsolv.com`. No SDK.
- **Free account saves 20 invoices** (first draft said 5; 20 chosen so the
  limit isn't a bait paywall — the real Pro hooks are features, not the count).
  Hitting the limit never blocks making or downloading a PDF.
- **Anonymous drafts kept in the browser** (localStorage) so a refresh doesn't
  lose work.
- **Entitlements computed per request** from `plan_features` + active
  subscriptions — not synced into a table (changed from the Phase 1 design).
- **Recurring (Stage 2) = reminder + one-click copy**; no automatic emails to
  clients.
- **Stored minimum**: no raw IPs, no Google tokens or photo; logo stored once on
  the business profile.
- **Test-only sign-in route** with three locks (compile-out, `KK_E2E=1`,
  per-run secret header); never a Worker secret.
- **E2E runs on a throwaway database**; the free limit is lowered to 3 there
  only, and the database is deleted on teardown.
- Privacy and Terms updated for accounts (owner to review the wording).

---

## 2026-10-21 — Invoice Generator (Phase 1: free tier)

**Decided by:** product owner (§46 kickoff + plan approved).

- **Dependencies installed before formal approval on 2026-10-21; retroactively
  approved; process note for future tools.** The next tool waits for explicit
  approval before any install.
- **Phasing.** Phase 1 = the free tool only (no account, no saving). The paid
  tier (Phase 2) needs separate approval of payment provider, auth, database
  schema/privacy model and pricing (§40). Full spec:
  [`products/invoice-generator.md`](./products/invoice-generator.md).
- **PDF library: `@react-pdf/renderer`** over jsPDF + html2canvas. Vector,
  selectable text and declarative templates outweigh the size (~440 KB gzip),
  which loads only on the first Download / Preview, never on page load and
  never in the Worker. Font: Inter Regular + Bold TTF (₹ verified), OFL,
  served from `public/fonts/`.
- **Dev-only test deps:** `@playwright/test` (e2e) and `pdfjs-dist` (reads the
  text inside the downloaded PDF in tests). Neither ships to visitors.
- **PDFs are made in the browser for everyone, Pro included.** Server-side PDF
  would send the user's clients' personal data to us (breaks the Privacy
  page promise; DPDP processor role) and needs paid Workers CPU. Accepted
  risk: a determined user can strip the free footer via dev tools. What Pro
  sells that matters (saving, client directory, recurring, CSV export) is
  server-enforced.
- **Entitlements:** `app/lib/entitlements.ts` — named keys
  (`invoice_watermark_remove`, `invoice_unlimited_items`, `invoice_save`, …),
  `useEntitlements()` / `can(key)`. Everyone gets the empty free set today;
  Phase 2 swaps only the data source. Never "if paid allow all".
- **Free line-item cap: 10** (spec changed from 5 with owner's confirmation).
  10 two-line items + notes verified to fit one A4 page; 5 would feel like a
  bait paywall. `invoice_unlimited_items` later means multi-page invoices.
- **Payment provider: TBD.** Stripe is invite-only for Indian businesses
  (registered business + video KYC). The schema and lookup keys work for
  Stripe or Razorpay; the drafted webhook is the Razorpay variant
  (HMAC-SHA256 over the raw body, idempotent on `x-razorpay-event-id`).
- **Not a GST tax invoice.** No GSTIN/HSN/SAC/e-invoicing checks (§33); the FAQ
  says so plainly.

---

## 2026-10-21 — UI audit: one choice control for all tools

**Prompted by:** owner noticed GST's selected options looked like slightly
different blues. Cause: newer tools hard-coded `bg-navy-900` for selected,
which in dark mode is ~1.1 : 1 against unselected. Fixed with shared
`Segmented` (modes) and `Chips` (values) on the design system's theme-aware
`activebg` / `activetext` tokens, ✓ on selected chips, radio semantics, 40 px
targets. Applied to GST, EMI, Percentage, Tip, Split bill, Case converter,
Lorem ipsum, Image Compressor, Resize image to KB and the converters' resize
options. Result-card buttons made pill-shaped like every other action button.
Rule recorded in `DESIGN-SYSTEM.md` §13.

---

## 2026-10-21 — Resize image to KB (exact size for forms)

**Decided by:** product owner (plan approved via the §46 kickoff).

- New page `/resize-image-in-kb` (not a mode of the compressor) — matches how
  people search. Draggable crop box; batch up to 20.
- **New dependency: `fflate` ^0.8.3** for the "Download all" ZIP, built in the
  browser. Small, maintained, no audit advisories at install.
- Output JPG only; KB limit treated as ≤ N × 1000 bytes; files are never
  padded to meet a minimum; an oversized result is never labelled as fitting.
- No exam-specific presets (requirements change) — generic KB picks and a
  passport 3.5 × 4.5 cm preset; users type what their notice says.
- Details: `products/image-kit.md` → "Exact size module".

---

## 2026-10-21 — Image Compressor, Writing pack, Everyday calculators

**Decided by:** product owner.

- New live tools (23 total): `/image-compressor` (see `products/image-kit.md`);
  writing — `/word-counter`, `/character-counter`, `/case-converter`,
  `/text-cleaner`, `/lorem-ipsum-generator`; calculators —
  `/percentage-calculator`, `/discount-calculator`, `/tip-calculator`,
  `/split-bill-calculator`, `/age-calculator`.
- **Tools live at top-level URLs**, like the converters — not under
  `/writing/…` or `/calculators/…` (those segments were never approved). Every
  new route is reserved against short codes (enforced by test).
- Shared `ToolPageShell` + `toolMetadata` for new tool pages; logic is
  framework-free in `app/lib/text` and `app/lib/calc` with unit tests.
- Word counting follows Microsoft Word (punctuation-joined tokens are one word;
  CJK/Thai via Intl.Segmenter). Character limits list carries a "checked
  October 2026" date — re-check periodically.
- Age: 29 Feb birthdays fall on 28 Feb in non-leap years. Money shown with
  Indian grouping (₹1,25,000.00).
- GST and EMI calculators followed the same day (`/gst-calculator`,
  `/emi-calculator`).

## 2026-10-21 — GST and EMI calculators

- **GST rates source:** PIB release on the 56th GST Council meeting (PRID
  2163555) — from 22 Sept 2025, 5% merit and 18% standard rates, 40% for a few
  demerit/luxury items. Presets are 5 / 18 / 40; anything else (special items,
  older 12% / 28% invoices) uses Custom. Special rates for gold/diamonds were
  not confirmed from an official source, so they are not stated. Rates are in
  `app/lib/calc/finance.ts` with a "checked" date — **re-check when the GST
  Council changes rates.** The page says it's an estimate, not tax advice.
- Shows both CGST + SGST/UTGST (intra-state, half each; odd paise go to SGST
  so the two always add up) and IGST (inter-state).
- **EMI:** standard monthly reducing-balance formula; last instalment absorbs
  rounding so the schedule ends at ₹0; yearly and monthly schedule. Limits:
  ₹1 – ₹100 crore, 0–50% a year, 1–480 months.
- Known dev-only console warning on all pages ("Encountered a script tag while
  rendering React component"), pre-existing, likely the theme script in
  `app/layout.tsx`. No user impact; tidy up later.

---

## 2026-10-21 — Basic pages: Privacy, Terms, About, Contact

**Decided by:** product owner. **Status: drafts — owner to review before
deploy; ideally a legal review of Privacy and Terms.**

- New pages `/privacy`, `/terms`, `/about`, `/contact` on a shared `TextPage`
  shell. Contact email: **kaamsolv@gmail.com** (mailto links pre-fill a subject:
  Tool suggestion, Feedback, Privacy request).
- Privacy describes only what the code does today: no cookies, no analytics or
  ad trackers; theme choice in local storage; image + QR tools run in the
  browser; URL Shortener stores destination, salted IP hash, and per-click
  time/device class/referrer domain/country; reports; rate-limit counters;
  Cloudflare (hosting) and Neon (Singapore) as processors. **Rule: any change
  that adds a cookie, tracker, third party or stored field updates
  `app/privacy/page.tsx` in the same change.**
- "Log in" removed from the header and phone menu until accounts exist.
  "Suggest a tool" → `/contact#suggest`, "Feedback" → `/contact#feedback`,
  "Cookies" → `/privacy#cookies`. No broken internal links remain.
- Open points for the owner: legal entity name and address (Terms/Privacy say
  just "KaamSolv"); which city's courts for disputes (Terms say only "laws of
  India"); confirm the 18+ audience statement.

---

## 2026-10-21 — All tools page, "coming soon" entries, shorter short links

**Decided by:** product owner.

- **`/tools` page:** every catalogue tool. "Ready to use" grid of live tools,
  then each category (anchor `#<category-slug>`) with live tools first and
  planned ones as compact grey "Coming soon" cards (anchor `#<tool-slug>`).
- **Coming soon is allowed** (refines CLAUDE.md §13): live first, planned
  visually secondary and never a link to a missing page. "Faded" = grey text +
  dashed outline, not opacity (60% opacity measured 2.56:1 contrast; plain muted
  text is 5.93:1).
- **Homepage:** hero sticky notes now link to live tools (shortener, QR, PNG→JPG,
  HEIC→JPG) followed by two "Soon" notes (GST, invoice) — status is read from
  the catalogue, so a note goes live with its tool. Quick links under search,
  the Popular grid, search results and related-tools sections show live tools
  first; planned tools route to their `/tools` entry instead of a 404.
- **Category links** (homepage, footer, header "Categories") go to `/tools#…`
  instead of the unbuilt `/categories/*` pages. Footer's dead Calculators /
  Converters / Generators links replaced with live tools.
- **Short links shown and copied without `https://`** (`kaamsolv.com/abc1234`);
  "Copy with https://" button for forms and other QR makers. The API's
  `shortUrl` still includes the scheme. On phones the Copy button is icon-only
  so the whole link fits.
- Still 404 (need content or decisions): About, Contact, Feedback, Suggest a
  tool, Log in, Privacy, Terms, Cookies.

---

## 2026-10-21 — URL Shortener live

**Decided by:** product owner.

- Deployed to `kaamsolv.com` and listed: first card in the homepage's Popular
  tools. Percentage Calculator (planned) left the rail to keep six cards and
  one fewer "Soon" placeholder.
- Verified with real links on production (see `products/url-shortener.md` §11).
  Test links `kaamsolv.com/hmTfloG` and `kaamsolv.com/883xfqy` remain — harmless,
  or disable with `npm run link:status -- <code> disable --confirm`.
- Homepage card copy changed to "Paste a long link, get a short one you can
  share anywhere." — click stats aren't built yet.

---

## 2026-10-21 — URL Shortener merged into `main` (not yet deployed)

**Decided by:** product owner (merge + local test; deploy waits for approval).

- `cf-workers-poc` (URL Shortener + Cloudflare runtime changes) merged into
  `main` and renamed to KaamSolv. Catalogue stays `planned` until launch.
- **Route clash resolved:** image converters are now ten static folders under
  `app/(image-converters)/` sharing `converterMetadata` / `ConverterRoute`, so the
  shortener's `app/[shortCode]` owns the root dynamic segment. URLs unchanged.
  Converter slugs are reserved short codes; `test/reserved-routes.test.mts` fails
  if any top-level route folder isn't reserved.
- Known issue: `npm run link:status` / `link:reports` print their result but
  don't exit when run against local PGlite (stop with Ctrl-C). Not seen with Neon
  yet; tool-only, no effect on the site.

---

## 2026-10-21 — New Neon database for the URL Shortener

**Decided by:** product owner.

- New Neon account (kaamsolv Gmail) and project `kaamsolv` in **Singapore**,
  replacing the old KaamKit database in `us-east-2`: every short-link redirect
  queries it, so it sits near Indian visitors. An empty project accidentally
  created in Ohio (`long-dawn-09331756`) is unused and should be deleted.
- Tables created and Worker secrets set — see
  [`infra/deployment.md`](infra/deployment.md). The old database and the old
  `.env.local` in the `url-shortener` worktree are no longer used.

---

## 2026-10-21 — Image converters live

**Decided by:** product owner.

- `feature/image-converters` merged into `main` and deployed: 10 converters
  (JPG, PNG, WEBP, HEIC, AVIF pairs) at `/{from}-to-{to}`, processed in the
  browser. Old `/image-tools/{slug}` paths redirect there. Image Compressor is
  still planned. Product docs: [`products/image-kit.md`](products/image-kit.md).
- Fixed on merge: the result card showed "Original: 0 B" because the input
  buffer was read after being transferred to the Web Worker.
- **Heads-up for the URL Shortener merge:** converters use a root-level
  dynamic route `app/(image-converters)/[slug]`, and the shortener uses
  `app/[shortCode]`. Next.js won't allow both at the root. One must give way
  (e.g. converters as static routes, or the shortener checks converter slugs
  first) — decide at that merge.
- Polish backlog: a non-image file shows a broken preview and the error
  "The source image could not be decoded." — should be caught on drop with
  friendlier copy.

---

## 2026-10-21 — Hosting: Cloudflare Workers

**Decided by:** product owner.

- KaamSolv is hosted on **Cloudflare Workers** via OpenNext, replacing Vercel.
  Worker `kaamsolv`, Custom Domains `kaamsolv.com` (canonical) and
  `www.kaamsolv.com` (308 → apex). Detail: [`infra/deployment.md`](infra/deployment.md).
- Builds on the `cf-workers-poc` proof of concept. Its URL-Shortener-specific
  runtime changes (Cloudflare geo header, production detection) are still on
  that branch and must come in with the URL Shortener.
- Code repository is now `github.com/kaamsolv/website`; the old one stays as
  remote `kaamkit-old`.
- Upgraded Next.js 16.3.4 → 16.4.2 for a critical advisory (GHSA-vcvr-r3jv-pc5j)
  and because OpenNext requires ≥ 16.4.1.

---

## 2026-10-21 — Rebrand: KaamKit → KaamSolv

**Decided by:** product owner.

- The product name is now **KaamSolv**. All user-facing copy, metadata,
  structured data, docs and the package name use it.
- **Domain:** `kaamsolv.com` (registered on Cloudflare). Code uses
  `https://kaamsolv.com` (apex) as the canonical base, same pattern as before:
  `www` should redirect to the apex. `NEXT_PUBLIC_SITE_URL` still overrides it.
- **Logo / colours:** a new logo and colour scheme are coming. Until they are
  supplied, the existing palette and the text wordmark stay — now
  "Kaam**Solv**" with the coral accent on the second half. The old
  `assets/KaamKit — Logo …` files are kept for reference only.
- **Source repo:** moved to a new GitHub account (see Hosting entry above).
- **Working folder:** renamed `KaamKit` → `KaamSolv`. The folder name has no
  effect on the build. It did break the git worktree links
  (`../KaamKit-*`), which were repaired with `git worktree repair`.

**Deliberately unchanged** (internal, not brand-visible, renaming would break
live configuration):

- `kk-` CSS class prefix (`kk-container`, …).
- `KK_` environment variable prefix (`KK_IP_HASH_SALT`, … on the
  `url-shortener` branch) — already set in hosting.

**Side effects to know about:**

- Theme preference key changed `kaamkit-theme` → `kaamsolv-theme`. A visitor's
  stored light/dark choice resets once. It is a new origin anyway.
- QR downloads are now named `kaamsolv-qr-code.{png,svg,jpg}`.
- Feature branches (`url-shortener`, `feature/image-converters`,
  `cf-workers-poc`) still say KaamKit. Expect small text conflicts when they
  next merge `main`; resolve in favour of KaamSolv.
