# Invoice Generator

**Route:** `/invoice-generator` · **Category:** Business · **Status:** Live — free
tier (2026-10-21); accounts and saving (Stage 1), workspace (2A) and GST tax
invoice (2B) deployed 2026-10-22; Pro Stages 2C-1 and 2C-2 deployed 2026-10-25
(hidden until payments). Payment ledger and partial payments (Stage C, every
account) built 2026-10-26 — not yet deployed. Pro Payments & Collections (Stage D) and the invoice workspace
(Stage E: list search and paging, customer pages, item fill rule) built 2026-10-26 — not yet deployed. Decisions: [`DECISIONS.md`](../DECISIONS.md) (2026-10-21 entries).
Accounts: [`accounts.md`](./accounts.md).

## What it is

Type straight onto a white invoice "paper" and download a one-page A4 PDF. No
sign-up, nothing uploaded. Totals update as you type (§45); there is no Generate
button. The draft is kept in this browser (localStorage) so a refresh doesn't
lose it. With a free account, invoices can be saved (up to 20).

## Saving (Pro Stage 1 — free account)

| | |
|---|---|
| Anonymous | Draft kept in this browser only (`app/lib/invoice/draft.ts`, `kk.invoice.draft.v1`), written 400 ms after typing stops and on `pagehide`. A quiet "Sign in to save invoices and reuse your details — free" link. No leave-page warning (nothing is lost). |
| Signing in | The draft survives the trip to `/login` and back, so it can be saved straight away. |
| Signed in, new | Starts from the business profile (seller details, logo, `INV-0001`-style next number). **Save** creates it (`POST /api/invoices`); the URL becomes `?id=…`; the draft is cleared. |
| Signed in, saved | Autosaves 1.5 s after typing stops (`PUT`). Status: Saved / Unsaved changes / Saving… / Not saved + Retry save. Leave-page warning only while changes haven't reached the server. Seller details + logo are saved to the profile when they change. |
| Free limit (20) | Save disabled with "You've saved 20 invoices — the free limit. Delete one to save another. You can still download this one as a PDF." No Pro mention until Stage 2. |
| `/app/invoices` | List (number, client, total, date) with Open, PDF, Copy, Delete; "3 of 20 saved". |

The logo is stored once, on the business profile — never inside an invoice.

## Stage 2A — workspace + GST rate dropdown

- **Tax row (everyone):** tax type GST / VAT / Tax / No tax. GST has a rate
  dropdown — 0, 0.25, 3, 5, 18, 40% and **Other…** (a number box for anything
  else, e.g. tobacco or old invoices) — with the on-screen note “GST rates
  follow the changes from 22 September 2025.” (never printed). Rates live in
  `app/lib/invoice/gst.ts` with their source. New invoices start on “Choose
  rate” (no tax added until chosen) unless Settings sets a default — unregistered
  sellers must not charge GST.
- **GSTIN (everyone):** seller and client GSTIN fields on the paper, checked
  (format, state code, official check character — `app/lib/invoice/india.ts`)
  and printed under the names on the PDF.
- **Payment details (everyone):** account name/number, IFSC, bank, UPI, and an
  optional “Scan to pay” UPI QR (rupee invoices; `upi://pay` link with the total,
  built with the QR tool's own builder) printed in a Payment details block.
- **Business profile (free account, shared — `/app/business`):** business
  details, state, GSTIN, logo, getting paid. **Invoice settings
  (`/app/invoices/settings`):** number prefix + next number, default
  currency/tax/days-to-pay/notes. New invoices start from both.
- **Customers (free: 3) and items (free):** pick them by typing on the invoice
  (native suggestions); “Save as customer” from Bill to.
- **Pro:** Invoices → Overview (`/app/invoices/overview`: billed this month,
  still owed, overdue per currency, recent). (The 2A “Mark as paid” switch was
  replaced by the payment ledger in Stage C — see “Payments”.)

## Free tier (Phase 1)

| Area | Behaviour |
|---|---|
| Seller | Business name, address, email, phone, logo (PNG/JPG/WebP ≤ 2 MB, downscaled to 400 px in the browser, never uploaded) |
| Client | Name, address, email |
| Items | Up to **10** (description, qty, rate, line amount). The 11th is blocked: "That's the limit — up to 10 items fit on a one-page invoice." |
| Maths | Subtotal → discount (% or flat, capped at subtotal) → tax % on the discounted amount → total. Rounded to 2 dp at each step. Bad numbers flag the field (`aria-invalid`) and list a plain message. |
| Meta | Invoice no. `INV-YYYYMMDD-XXXX` (editable), date = today, due = +14 days (resets when the date changes, then editable) |
| Currency | INR (Indian grouping, ₹1,25,000.00), USD, EUR, GBP, AED (shown as "AED") — user-chosen, never by IP |
| Notes | Free text (bank / UPI details), 400 chars |
| PDF | Footer "Made with KaamSolv · kaamsolv.com". Preview PDF opens a tab; Download PDF saves `<invoice-no>.pdf`. Warns if output ever exceeds one page. |
| Leaving | Browser "leave page?" prompt only when there's content. Start new (with confirm) clears it. |

Field lengths (`app/lib/invoice/limits.ts`) keep a full invoice on one page.

## Layout

- **≥ 768 px:** A4-proportioned sheet; sticky toolbar (currency, Start new,
  Preview PDF, Download PDF).
- **Phones:** the same sheet reflows to one column; line items become stacked
  cards; a fixed bottom bar shows the total and Download PDF.
- **Themes:** page chrome follows light/dark; the paper stays white with fixed
  high-contrast colours (dashed underline `#AEB6C6`, coral focus `#FE6336`,
  muted `#5B6478`, error `#B42318`).
- **A11y:** every field has an accessible name ("Item 2 rate", "Client email");
  tab order follows reading order; the grand total is announced in a hidden
  `role="status"` 800 ms after typing stops, only when it changed.

## Code map

| Path | Role |
|---|---|
| `app/lib/invoice/` | Framework-free: `types`, `limits`, `money`, `totals`, `defaults` (unit-tested in `test/invoice.test.mts`) |
| `app/lib/entitlements.ts` | Keys, `useEntitlements()`, `can()` — free set is empty |
| `app/_components/invoice/invoice-editor.tsx` | Paper sheet, toolbar, live totals |
| `app/_components/invoice/paper-fields.tsx` | Paper input/textarea styles |
| `app/_components/invoice/invoice-pdf.tsx` | react-pdf A4 template (lazy): three looks, brand colour, multi-page, quotation labels |
| `app/_components/invoice/design-panel.tsx` | Template + brand colour picker (editor Design panel and Invoice settings) |
| `app/lib/invoice/design.ts` | Templates, swatches, hex check, white-or-navy text on the colour |
| `app/_components/invoice/generate-pdf.tsx` | Dynamic import, filename, page count |
| `app/_components/invoice/react-pdf-server-stub.ts` | Server stand-in for `@react-pdf/renderer` (via `turbopack.resolveAlias` in `next.config.mjs`) so the PDF engine stays out of the Worker bundle (−587 KiB gzip) |
| `public/fonts/` | Inter Regular/Bold TTF + `OFL.txt` (PDF font; has ₹) |
| `tests/e2e/invoice.spec.ts` | Playwright: desktop/phone × light/dark, PDF text, 10-item one-page, currency, a11y |
| `app/lib/invoice/list-query.ts`, `app/lib/paging.ts` | The list's request vocabulary and page maths; `db/invoice-filters.ts` builds the one set of conditions |
| `db/customer-workspace.ts`, `app/_components/account/customer-detail.tsx` | Customer totals, by-name suggestions, connect / disconnect |
| `app/lib/invoice/item-fill.ts` | The saved-item fill rule (pure) |
| `app/lib/invoice/payments.ts` | Payment maths and checks: paise, `paymentSummary()` (state, balance, %, overdue), input cleaning, ledger error names |
| `db/payments.ts` | Ledger data access: record (idempotent), void, edit note, history — scoped by user |
| `app/app/invoices/[id]/` + `app/_components/account/invoice-payments.tsx` | The payments page; `status-badge.tsx`, `payment-progress.tsx` are shared with the list |

Every paid behaviour goes through `can('<key>')`: item limit →
`invoice_unlimited_items`; footer → `invoice_watermark_remove`; Design →
`invoice_templates` / `invoice_brand_color`; quotations → `invoice_quote_mode`.

## Testing

```bash
npm test
```

```bash
npm run test:e2e
```

E2E saves screenshots and sample PDFs to `test-results/screenshots/`
(gitignored).

## GST tax invoice (Stage 2B — free)

Sources: CGST Rule 46 (tax invoice particulars), Rule 49 (bill of supply),
Notification 9/2025-CT(Rate) (rates from 22 Sept 2025), Notification
78/2020-CT (HSN digits). Maths in `app/lib/invoice/gst-tax.ts` (tested in
`test/gst.test.mts`).

- **When:** valid seller GSTIN + INR + tax type GST → title **TAX INVOICE**.
  GST without a GSTIN → note "Only GST-registered businesses can charge GST".
  Composition (Business profile toggle, or "Bill of Supply (composition)" in
  the tax menu) → **BILL OF SUPPLY**, the composition wording, no tax.
- **Place of supply:** chosen, else client GSTIN state, else client state,
  else seller state; "Outside India (export)" = code 96. Same state → CGST +
  SGST; same UT without legislature (04, 26, 31, 35, 38) → CGST + UTGST;
  otherwise IGST.
- **Lines:** HSN/SAC (4/6/8 digits, soft hint), unit, own GST rate (blank =
  invoice rate). Discount spread pro-rata over lines; tax per rate, rounded to
  paise; last rate group takes the discount remainder so totals reconcile.
- **PDF:** state lines, place of supply, reverse charge, HSN/GST columns,
  CGST/SGST/UTGST/IGST lines, tax summary by rate, amount in words (INR),
  "For ‹business› · Authorised signatory" with optional signature image. A
  full 10-line tax invoice with ship-to and payment details fits one A4 page.
- **Numbers:** tax invoice numbers ≤ 16 characters, letters/digits/-// (inline
  message). The anonymous default is now `INV-YYMMDD-XXXX` (15 characters).
- **Not done:** e-invoicing/IRN, online GSTIN lookup, cess, LUT/bond for
  exports, credit/debit notes, round-off line.

## Pro — Stage 2C-1 (live, hidden until payments)

Hidden from free accounts until Pro can be bought (Stage 3): no "Pro" tags, no
"coming soon". Each feature is checked with `can()` in the editor, the PDF and
the API. Tests: `test/pro.test.mts`, `tests/e2e/pro.spec.ts`.

- **No footer** (`invoice_watermark_remove`) — "Made with KaamSolv" left off.
- **Multi-page** (`invoice_unlimited_items`, up to 200 lines): the table header
  repeats on every page, rows never split, the closing block (totals, tax
  summary, signatory, notes, payment details) stays together, page 2 onwards
  has "Invoice INV-0042 · continued", and "Page 1 of 3" appears only past one
  page. The "runs onto a second page" warning is for free invoices only.
- **Templates** (`invoice_templates`): Classic (default, today's look), Minimal
  (hairlines, no fills — for black-and-white printing), Bold (colour header
  band, filled table header, total in a colour box). Same particulars in all.
- **Brand colour** (`invoice_brand_color`): 8 swatches or a `#RRGGBB` hex, on
  the accent rule, table header, total line and Bold's band. Text on the
  colour is white or navy, whichever has more contrast (WCAG luminance).
- Editor: **Design** button → panel (template, colour); Preview PDF shows it.
  The paper keeps one layout and takes the accent colour. Invoice settings →
  **Design** sets the default for new invoices. Stored as `invoice.design`.
- **Quotations** (`invoice_quote_mode`): Invoice / Quotation switch on unsaved
  documents, or **+ New quotation** on All invoices (`?type=quote`). Title
  QUOTATION, "Quote no.", **Valid until** (+30 days), own numbering (`QT-0001`,
  prefix and next number in Invoice settings). Never a tax invoice: with a
  GSTIN and GST its GST shows as an estimate ("A tax invoice follows on
  supply"); no reverse charge, no paid/unpaid, no UPI QR, signatory only if a
  signature was added. **Convert to invoice** (editor or list) makes a new
  invoice — same client, lines and design, the next invoice number, today, the
  account's days to pay — and leaves the quotation as it was. Copying a
  quotation gives the next quotation. All invoices filters All · Invoices ·
  Quotations; Overview counts invoices only.
- Server: `cleanInvoice` keeps `kind: 'quote'` and `design` only with the
  matching entitlement, so a free account can't save them by editing the
  request. `POST /api/invoices/:id/convert` is Pro-only.
- Data: migration `0006_pro_design_quotes.sql` (`invoices.kind`,
  `business_profiles.quote_prefix/quote_next_number/default_template/default_brand_color`).

## Pro — Stage 2C-2 (live, hidden until payments)

Same rules as 2C-1: hidden from free accounts, each feature checked with
`can()` in the UI and on the server. Tests: `test/recurring.test.mts`,
`tests/e2e/pro2.spec.ts`.

- **Recurring** (`invoice_recurring`): a saved invoice (not a quotation) gets
  **Repeat…** in the editor — weekly, monthly, every 3 months or yearly, with a
  next date. It is a **reminder, not automation**: when the date arrives,
  **Due to repeat** appears at the top of All invoices and Overview, with
  **Create invoice** (next invoice number, today's date, the account's days to
  pay, same client, lines and design) and **Skip this one**. No emails, no
  cron — nothing is made until you press Create. The copy doesn't repeat; the
  original's date moves on (past today, so a missed month doesn't pile up).
  Month ends clamp (31 Jan → 28 Feb) and continue from there (→ 28 Mar); edit
  the date by hand to go back to the 31st.
  - **"Today" is the browser's own calendar date** (`isoDate(new Date())`, same
    as the Overview). The server accepts it when it is a real date within one
    day of server UTC (largest real offset is 14 h), so IST just after midnight
    works and a far-off date can't skip a schedule. Next dates are plain
    calendar arithmetic on `YYYY-MM-DD` (`app/lib/invoice/recurring.ts`).
  - Create moves the schedule first in one compare-and-set, so a double click
    or a second tab can't make two invoices (the second gets a calm 409); if
    the copy can't be saved (limit) the schedule is put back.
- **CSV export** (`invoice_csv_export`): All invoices → **Export CSV**, with
  optional From / To (by issue date). **Invoices**: one row each — number,
  type, dates, status, client, client GSTIN, place of supply, currency,
  subtotal, discount, taxable value, CGST, SGST/UTGST, IGST, total. **Line
  items** (the accountant's HSN view): one row per line — HSN/SAC, description,
  unit, qty, rate, GST %, taxable value (after the invoice discount), tax.
  Totals come from `computeTotals`, so they match the PDF. GST columns are
  filled only for GST tax invoices (and GST quotes). UTF-8 with BOM; cells
  starting `= + - @` are prefixed with `'` (CSV injection). Max 5,000
  invoices (413 asks for a shorter range).
- **Batch from a CSV** (`invoice_batch_csv`): **Invoices → From a CSV**
  (`/app/invoices/batch`): download the template → upload → preview → create →
  ZIP of PDFs. Rows with the same `group` are one invoice (a blank group is its
  own); seller, tax, currency, payment details and design come from Settings.
  Dates read as `2026-11-01` or `01/11/2026`. Reading and checking happen in
  the browser (`app/lib/invoice/batch.ts`): a bad row (GSTIN, rate, GST rate,
  HSN, date, state) blocks only its own invoice, with the line number. The
  server re-checks with `cleanInvoice`, ignores any numbers and assigns the
  account's next numbers in order; max 50 per batch, 1 MB file.
  - **If the tab closes before the ZIP:** every invoice is already saved.
    All invoices has Pro checkboxes and **Download N as ZIP** (the batch result
    links there with the batch ticked). **Limitation:** re-uploading the same
    file makes the invoices again (new numbers); the preview warns when a
    client, total and date match one made in the last 24 hours. If the
    connection drops mid-create, the page says to check All invoices first.
- **Currency rates** (`invoice_fx_rates`): Frankfurter (`api.frankfurter.dev`,
  free, no key, caching encouraged; the default blended rates, because the ECB
  feed has no AED). `GET /api/fx` fetches on the server (Pro only), keeps it 6
  hours, and fails soft. The editor shows "≈ ₹1,80,000 · 1 USD = ₹90.00 · rate
  of 23 Oct · Frankfurter" with **Copy** (a rupee invoice gets "See in…"),
  and Overview shows an "in rupees, roughly" line under each foreign-currency
  block. **On screen only — never on the PDF**, never summed across currencies,
  and labelled as a reference rate (GST on exports uses the notified rate).
- Data: migration `0007_recurring.sql` (`invoices.recur_every`, `recur_next`,
  check, partial index). Rollback is in [`infra/deployment.md`](../infra/deployment.md).
- API: `PUT /api/invoices/:id/recurring`, `POST /api/invoices/:id/recur`,
  `GET /api/invoices/due`, `GET /api/invoices/export`,
  `POST /api/invoices/batch`, `GET /api/fx` (all Pro-gated).

## Payments (Stage C — every account; built, not yet deployed)

Record what a client has paid, see what's still owed, correct mistakes. **Every
signed-in account has it** (`invoice_payments`, free and Pro) — it is basic
recordkeeping, not a paywall. Collection analytics, ageing and reports stay Pro
(later stages). Tests: `test/payments.test.mts`, `test/payments-migration.test.mts`,
`tests/e2e/payments.spec.ts`.

### One status model, one source of truth

The **ledger** (`invoice_payments`) is the source of truth. `invoices.amount_paid`
is its running total — recomputed from the non-voided entries by triggers, never
incremented and never written by the app — and `invoices.status` follows it. The
`unpaid | paid` enum is **unchanged**; "partially paid" is derived, so no enum
migration and no old code breaks.

| State shown | Stored as | Means |
|---|---|---|
| **Unpaid** | `status = unpaid`, `amount_paid = 0` | Nothing received |
| **Partially paid** | `status = unpaid`, `amount_paid > 0` | Some received, balance outstanding |
| **Paid** | `status = paid`, `amount_paid >= total` | The ledger covers the invoice |
| **Marked paid** | `status = paid`, `amount_paid = 0` | Legacy: marked paid before the ledger existed; **no payments on record** |

One function turns the stored numbers into a state, balance and percentage:
`paymentSummary()` in `app/lib/invoice/payments.ts` (used by the API, the list, the
payments page and the CSV, so they can't disagree). Collection % is whole percent,
rounded **down** and never 100 until the ledger really covers the total; it is
blank for "Marked paid" (nothing to measure). **Overdue** = a balance is still owed
and the due date is before today (due today is not overdue).

An invoice can't become Paid with a balance outstanding: the database refuses to flip
`unpaid → paid` unless the ledger covers it, and derives `status`/`paid_at` from the
ledger whatever a caller writes. `paid_at` is the date of the last payment. There is
no "Mark as paid" switch any more — recording the payment settles the invoice.

### The ledger (`invoice_payments`, migration 0010)

Amount (`numeric(14,2)`, > 0), currency (copied from the invoice), date received,
method (UPI · bank transfer · cash · card · cheque · other), optional reference
(≤ 100) and note (≤ 400), a per-form idempotency key, owner, timestamps, and
`voided_at` / `void_reason`. Foreign keys cascade from the invoice and the user.

Rules the **database** enforces (AFTER-INSERT/UPDATE triggers, under the invoice
row's lock), whoever writes the row:

| Rule | Error name |
|---|---|
| The invoice is the **same user's** own invoice (so a hand-written insert can't touch someone else's) | `payment_owner` |
| It is an invoice, not a quotation | `payment_quote` |
| Same currency as the invoice | `payment_currency` |
| Total of non-voided payments **never exceeds the invoice total** | `payment_exceeds` |
| Date is real, ≥ 2000-01-01, and not after tomorrow UTC (time-zone slack) | `payment_date` |
| At most 200 entries per invoice (voided included) | `payment_cap` |
| Amount, date, method, currency, invoice, owner never change; a voided entry is frozen; nothing is un-voided | `payment_immutable` / `payment_voided` |
| Once an invoice has payments its **currency and type are fixed** and its **total can't fall below** what was received | `invoice_has_payments` / `invoice_total_below_paid` |
| No `unpaid → paid` without the ledger covering the total | `invoice_unsettled` |

The API checks the same things first, to give plain messages ("That's more than is
owed — only ₹15,000.00 is outstanding"); the app never trusts a browser total or
balance. Raising an invoice's total after a payment is allowed (a Paid invoice then
shows Partially paid); lowering it to exactly what was received settles it.

**Concurrency.** Neon over HTTP can't hold a transaction across statements, so each
change is one SQL statement and the triggers do the rest under `SELECT … FOR UPDATE`
on the invoice row. Two payments at the same instant are applied one after the other;
the second sees the first and is refused if the invoice is covered.

**Idempotency.** The form creates one `clientKey` (uuid) per payment and keeps it
across retries. Recording is `INSERT … ON CONFLICT (user_id, client_key) DO NOTHING`
(all rules are in AFTER triggers, so a repeat changes nothing): a double click, a
retry after a dropped connection or a second tab returns the payment already
recorded (`200`, `duplicate: true`) instead of a second one — even when the first
already settled the invoice. The same key with a *different* payment is a `409`.

### Correcting mistakes: void, then record again

Amount, date and method are never edited. **Void** takes the payment out of the totals
(the invoice gets the amount back and moves Paid → Partially paid → Unpaid as
needed); the entry **stays in the history**, struck through, with the reason. Then
record the right payment. Only the **reference and note** can be edited in place.
Voiding twice is harmless. Rows are never hard-deleted by the app; they go only with
the invoice or the account (cascade).

**Audit trail:** `invoice_payment_events` (append-only, written by the triggers) keeps
every record, void and edit, with old and new values for edits. Read by support, not
shown in the app.

### Invoices marked paid before the ledger existed (reconciliation)

Migration 0010 changes **no existing row**. An invoice that was marked paid keeps
`status = paid` with `amount_paid = 0`: **"Marked paid — no payments on record."** We do
not invent an amount, date or method.

- It counts as **settled** (nothing outstanding, not overdue) but **not as money
  received**: it adds nothing to "Received" or to the collection rate, and is
  reported on its own.
- Its payments page says so and offers **Record the payments you received** and
  **Mark unpaid** (only for this legacy state; an invoice with payments can't be
  marked unpaid — void instead).
- Recording a payment against it needs the caller to say it is replacing the mark
  (`reconcile: true`; the page asks first and states the consequence). The entries are
  capped at the invoice total. If they cover it, it becomes **Paid**, now with a real
  record. If only part was ever paid, it honestly becomes **Partially paid** with the
  rest outstanding — the page warns before doing that.
- From the first entry on it is an ordinary ledger invoice; nothing is flagged.
- Editing such an invoice keeps its status, as before.

### Dashboard and report formulas (used by the Overview and by Payments & Collections)

Per currency — **never summed across currencies, never converted** (the on-screen FX
reference stays a labelled estimate). Quotations never count. "Today" is the visitor's
calendar date. `balance = total − amount_paid`.

| Figure | Formula |
|---|---|
| **Invoiced** (range) | Σ `total` of invoices with `issue_date` in the range. Invoice **value**, not money. |
| **Received** (range) | Σ `amount` of **non-voided** ledger entries with `paid_on` in the range, on any invoice (cash basis). "Marked paid" invoices add 0. |
| **Outstanding** (now) | Σ `balance` of invoices with `status = unpaid` (Unpaid and Partially paid). Paid and Marked paid owe 0. |
| **Overdue outstanding** | Σ `balance` of those with `due_date < today` (strictly before; no due date = never overdue). |
| **Collection rate** (invoices issued in range) | Σ `amount_paid` ÷ Σ `total` over invoices issued in the range **excluding Marked paid**; whole %, rounded down; "—" when the denominator is 0. Marked-paid invoices are listed separately ("N settled with no payment records"). |
| **Ageing** (Stage D) | Outstanding grouped by `today − due_date`: not yet due · 1–30 · 31–60 · over 60 days overdue — using the **balance**, not the original total. |

Received (range) ÷ Invoiced (range) compares different invoice cohorts, so charts
labelled "invoiced vs collected" say what basis they use. **In Stage C** the Pro
Overview's "Unpaid" is Outstanding, "Overdue" is Overdue outstanding, "Billed this
month" is Invoiced (this month) — tested in `test/payments.test.mts`. The Payments & Collections
page (Stage D, below) uses the same definitions.

### Where it appears

- **`/app/invoices/[id]`** (new, any signed-in account): total · received ·
  outstanding, status badges, a progress bar (`role="progressbar"`, with the amounts
  printed — never colour alone), **Record payment** (amount prefilled with what is
  owed, date defaults to today, method, optional reference and note → a **review
  step** "Record ₹5,000.00 received on 20 Oct 2026 by UPI? ₹15,000.00 will still be
  outstanding." → Confirm), the history with Edit note / Void, and the legacy notice.
  `?record=1` opens the form ready to type.
- **All invoices**: status badge for every account (Unpaid · Partially paid · Paid ·
  Marked paid · Overdue), a compact progress bar and "₹X outstanding" for partly paid
  rows, and **Record payment** / **Payments** in place of Mark paid. Deleting an
  invoice with payments says they go with it.
- **Editor**: the toolbar button is a link to the payments page ("Record payment" /
  "₹5,000.00 received" / "Paid" / "Marked paid"); the currency is locked once money is
  recorded; a save that would drop the total below what was received is refused with a
  plain message (409 `below_paid`).
- **CSV export** (Pro): the Status column reads Paid · Partially paid · Unpaid · Marked
  paid, and "Paid on" is the last payment date. Received/balance columns and a payments
  report come in Stage F.

### API

| Route | |
|---|---|
| `GET /api/invoices/:id/payments` | invoice facts + the whole ledger (voided included) |
| `POST /api/invoices/:id/payments` | record. `{ amount, paidOn, method, reference?, note?, clientKey, today, reconcile? }` → 201, or 200 for a recognised repeat; 409 `exceeds` · `legacy_paid` · `cap` · `key_reused` |
| `PATCH /api/invoices/:id/payments/:paymentId` | `{ reference, note }` only |
| `POST /api/invoices/:id/payments/:paymentId/void` | `{ reason? }` |
| `PUT /api/invoices/:id/status` | kept for old tabs: `"paid"` → 409 `record_payment`; `"unpaid"` works only on a legacy "Marked paid" (else 409 `has_payments`) |

All need a signed-in account with `invoice_payments`, a same-origin request, and
scope every query by the signed-in user (another user's invoice or payment is a 404).

### Not in Stage C

Write-off / adjustment (a balance clears only by recording payments), overpayments and
credit notes, refunds, collection charts, ageing, customer-level totals, the payments
report, reminders, and any automatic email. Each is a later, separately approved stage.

## Payments & Collections (Stage D — Pro; built, not yet deployed)

**Invoices → Payments & collections** (`/app/invoices/collections`, Pro, `invoice_dashboard`):
what you've billed, what has come in, and what is still owed — from the payment ledger,
one currency at a time. No migration (it reads Stage C's tables). The Overview and
`GET /api/dashboard` are unchanged. Tests: `test/collections-lib.test.mts`,
`test/collections.test.mts`, `tests/e2e/collections.spec.ts`; benchmark:
`scripts/benchmark-collections.mts`.

### The figures (formulas as in "Dashboard and report formulas" above)

| Card | Covers | Link goes to |
|---|---|---|
| **Invoiced** | invoices **issued in the period** — invoice value, not money | `issuedFrom/issuedTo` |
| **Received** | **cash that arrived in the period**, on any invoice (including ones issued earlier) | `paidFrom/paidTo` — each row shows what it received in the period |
| **Outstanding** | balances **as of today**; *not* limited to the period | `state=outstanding` |
| **Overdue** | the part past its due date, as of today | `state=overdue` |
| **Collection rate (invoices issued in this period)** | the **invoice-cohort** rate: money collected so far — to *any* date — on the invoices issued in the period ÷ their total; whole %, rounded down, "—" if none; marked-paid excluded | the issued-in-period list |

**Cash received vs collection rate.** They answer different questions and are labelled so
on the page (each card names its basis; a sentence under the cards says they "won't
match"). Example: an invoice issued in April and paid in full in September counts in
April's collection rate (100%), but its cash is **Received in September**, and April's
Received is ₹0. Cash received in a period can also include money for invoices issued
before it. The monthly chart is titled "Invoiced vs received" and says the two series can
come from different invoices. Invoices **marked paid before payments were recorded** are
not counted as received or in the rate; a note under the cards counts them and links to
them.

Outstanding, Overdue and the ageing chart are **positions as of today**, so the period
picker does not change them (decision D1); Invoiced, Received, the collection rate and the
monthly chart follow the period. Quotations are never counted.

### Dates and time zones — one rule

Every business date (issue, due, date received, "today", range ends) is a plain calendar
date `YYYY-MM-DD`, with no time zone, and is **never converted**. Months are the
`YYYY-MM` of the stored date; days are counted as whole calendar days.

- **"Today" is the visitor's own calendar date**, sent as `today=`. It is **required**
  (400 if missing — no fallback to the server's clock) and must be a real date **within
  one day of the server's UTC date** (the biggest real UTC offset is 14 hours), so an
  Indian visitor just after midnight IST is accepted, and a far-off date can't be used to
  dodge "overdue".
- **Indian financial year:** 1 April – 31 March, worked out from that calendar date. On 31
  March it is still the old year; on 1 April the new one begins — wherever the server runs.
  **This financial year** is the default; presets are this month, last 3 / 6 months (whole
  months), this FY, last FY, and custom dates (1 to 24 months).
- **Overdue** is `due_date < today` (due today is not overdue); **days overdue** is
  `today − due_date`. **Ageing buckets:** not yet due (including no due date) · 1–30 ·
  31–60 · over 60 days overdue — by the **balance**, not the original total.
- Range ends are inclusive. Tested at the boundaries: IST midnight, 31 March ↔ 1 April,
  due-on-the-day and the day after, leap February, year ends, UTC±14.

### Currency

One currency per view; when an account has more than one, a switch lists them (INR first).
Every query filters `currency = $c` — nothing is summed or converted across currencies, and
this page doesn't use the Overview's FX hint. A saved-customer filter limits every figure
to that customer's invoices (invoices not linked to a saved customer can't be filtered by
customer).

### Charts and states

- **Invoiced vs received, by month:** grouped columns in plain SVG (no chart library); the
  series differ by pattern and position, not colour alone, with a text legend; each bar is
  a real link whose name carries the amount ("Sep 26: received ₹5,000.00 in 1 payment.
  View the invoices paid."); a "View as a table" version has the same numbers and links;
  on a phone the chart scrolls sideways rather than shrinking its labels.
- **Outstanding by age:** four rows (label, invoices, balance, a bar) — links when there
  are invoices; they add up to Outstanding, which the page says.
- **Needs chasing:** the five invoices longest past due, each opening its payments page.
- **Empty:** no invoices ("Nothing to measure yet"); nothing in the period; nothing
  received yet; nothing outstanding ("Nothing outstanding. Sorted."); nothing overdue; a
  bad custom range is explained and not sent. Loading shows a skeleton, errors a retry.

### API

`GET /api/invoices/collections?from=&to=&today=[&currency=][&customer=]` — Pro only: **403
(no figures at all) without `invoice_dashboard`**, checked before anything is read; 401
signed out; 400 for a missing/implausible `today`, a bad or backwards range, more than 24
months, an unknown currency or a malformed customer id. Returns the five figures, the
zero-filled monthly series, the four ageing buckets and the needs-chasing list for one
currency, plus the account's currency list. Every query is scoped to the signed-in user.

`GET /api/invoices?state=&currency=&bucket=&issuedFrom=&issuedTo=&paidFrom=&paidTo=&customer=`
(`today=` for overdue and ageing) — the drill-down: invoices only, capped at 200, plus
**totals over every match, per currency**. Without those params the response is exactly as
before. These filters only narrow a user's own invoices, so every account may use them.
The SQL for "outstanding", "overdue", each bucket and each payment state is defined once
(`db/invoice-filters.ts`) and shared with the dashboard figures, so **every drill-down
reconciles with its card or bar** (tests assert it for each one).

### Performance (benchmark, not a promise about Neon)

`npx tsx scripts/benchmark-collections.mts` seeds one account with **5,000 invoices and
20,000 payments** (plus 3,000 invoices / 12,000 payments of other accounts) on in-memory
PGlite with the real migrations, checks every invoice's cached total against its ledger,
and times the real queries (25 runs, medians): the whole INR dashboard for a financial
year ≈ 41 ms (p95 61 ms); the 24-month maximum ≈ 60 ms; USD ≈ 24 ms; each drill-down list
≈ 15–22 ms. The received-in-range query uses the Stage C partial index. That is query
time only — Neon adds a network round trip per query (one lookup, then the rest in
parallel). No index was added (decision D6); revisit only if real accounts show otherwise.

### Not in Stage D

The payments report and CSV additions, reminders or any email, write-off. (Stage F.)
Customer pages, list paging and search came in Stage E.

## Invoice workspace (Stage E — every account; built, not yet deployed)

Search, sort and page the invoice list, a page for each saved customer, and a fill rule for saved items that
never overwrites what you typed. No migration and no new dependency. Tests: `test/invoice-list.test.mts`,
`test/customers-workspace.test.mts`, `test/item-fill.test.mts`, `tests/e2e/invoice-list.spec.ts`,
`customers.spec.ts`, `items.spec.ts`; benchmark: `scripts/benchmark-workspace.mts`.

### The invoice list (`/app/invoices`)

The address bar is the state: `/app/invoices?state=overdue&currency=INR&q=acme&sort=due&page=2`. A link, a
reload or Back lands in the same place; links and the pager change the URL in place without a reload (and keep
the ZIP ticks, so Pro can tick invoices on several pages). Search (invoice number or client name, any case; `%`
and `_` are ordinary characters), type (All / Invoices / Quotations — quotations are Pro), sort (recently
changed, newest issued, due soonest, largest amount, number) and the Stage D filters combine; chips remove one
at a time.

`GET /api/invoices` answers in three ways — **the first two are unchanged**:

| Request | Answer |
|---|---|
| none of the params below | every invoice and quotation, summary columns only (the batch-import duplicate check relies on it) |
| Stage D filters (`state`, `currency`, `bucket`, `issuedFrom/To`, `paidFrom/To`, `customer`), no `page` | invoices only, ≤ 200, with totals over every match |
| any of `page`, `pageSize` (1–100, default 25), `q` (≤ 80), `kind` (`all`·`invoice`·`quote`), `sort`, `ids` (≤ 50) | **one page**: `{ paged, invoices, matched, page, pages, pageSize, totals }`; each row adds `balance` and `customerId`. A page past the end is the last page. A payment filter means invoices only unless `kind` is given; `kind=quote` with a payment filter is a 400 |

`totals` are per currency over **every** match (invoices only — a quotation owes nothing), not just the page.
Search, type, sort and paging use the same condition builder as the Stage D filters (`db/invoice-filters.ts`), so
**pages add up to the totals, and the totals equal the Payments & Collections card** — each has a test. `ids`
makes the batch-result link ("See them in All invoices") show exactly the invoices it just made, ticked.

### Customers: connected, never matched by name

An invoice belongs to a saved customer only when it was **picked from the saved list** (or the full saved name
was typed): that stores `invoices.customer_id`. Invoices typed in by hand have no connection, and saving a
customer later does not connect old invoices. Stage E keeps it that way:

- **Nothing is matched or merged by name.** The customers table has no unique name, so two customers can share
  one; a name can't say which was meant.
- A customer's page counts **only connected invoices**, and says so.
- It also *lists* — and connects nothing — invoices and quotations whose client name is **exactly** the
  customer's (any case, spaces at the ends; "Acme Traders Ltd" and "Acme" don't match), not connected to anyone,
  yours only, up to 50, with a "GSTIN differs" warning where the typed one disagrees. **Nothing is ticked.** You
  tick the ones that are this customer and press **Connect selected**, then confirm.
- Connecting changes **only `invoices.customer_id`** (not the printed client, totals, status or `updated_at`), only
  for your own invoices that aren't connected yet, to your own customer, in one statement; anything else is
  skipped and counted. Each connected invoice has **Disconnect**. It's also what happens when you delete a
  customer: the invoices keep their own copy of the details.
- Saving a customer with a name you already have asks first ("You already have a customer called …") and is then
  allowed — the two stay separate customers; the same suggestions appear on both.

**`/app/business/customers/[id]`** (any account with saved customers; Free has 3): details, **per-currency totals —
invoiced, received, outstanding, overdue (all time)** — computed with the Stage D SQL fragments, so they equal the
invoice list filtered by `customer=<id>` and the Collections page's customer filter; a marked-paid note; a paged
invoice history linking to each payments page; and the review list above. The customers list shows each customer's
invoice count and what they owe (one grouped query for the page). Rows link through; the invoice list shows a
**Customer** link on connected rows and the payments page names the saved customer. The money totals are free for
every account (own-data bookkeeping, like Stage D's filtered totals); period analytics stay Pro.

APIs (signed in, `invoice_client_directory`, same-origin for writes, every query scoped to the user):
`GET /api/customers/:id/summary?today=` · `GET /api/customers/:id/unlinked` ·
`POST /api/customers/:id/links { action: "connect"|"disconnect", invoiceIds: [≤ 50] }`.
`GET /api/customers` and `/api/items` gain `?q=&page=&pageSize=` (a paged answer with `total`/`pages`; without them
the answer is exactly as before, cut at 200 — which is why the lists page now: Pro can save 1,000) and
`stats=1&today=` on customers (per-customer figures).

### Saved items and the invoice line

`app/lib/invoice/item-fill.ts` (pure, tested): when a line's description matches **one** saved item exactly (any
case, spaces at the ends), its rate, unit, HSN/SAC and GST rate are filled — **never over something you typed.** A
field is written only if it is empty or still holds what the previous fill put there, so switching from one item
to another replaces the first's values (clearing ones the new item lacks — no stale HSN/SAC), typing the name
again later restores untouched fields and leaves edited ones, and the line says "Kept the rate you typed …" when
the item has a different one. Two items with the same name fill nothing and say why. The memory of what was filled
lives in the editor only; **the invoice document is unchanged.** Items carry no currency, so the manager says
"Default rate" (no ₹) and the rate goes onto any invoice as typed. If an account has more than 200 customers or
items, the editor's suggestions come from a server search while you type (an exact match still fills and, for a
customer, connects).

### Navigation

Customers rows and names link to the customer page; the nav highlights Customers there; connected invoices link
back. Quotations and repeating invoices stay filters on All invoices rather than separate pages (no dead ends); a
test opens every nav link for a Free and a Pro account.

### Performance (benchmark, not a promise about Neon)

`npx tsx scripts/benchmark-workspace.mts` — 5,000 invoices (3,000 connected), 19,500 payments, 1,000 customers
(plus three other accounts), in-memory PGlite, medians of 25: list page 16 ms; search by client 26 ms, by number
26 ms; sort by amount 14 ms; deep page (100) 16 ms; one customer's invoice history 8 ms; customers page 2 ms,
search 6 ms; figures for 25 customers at once 6 ms; one customer's totals 7 ms; exact-name suggestions 4 ms. No
index was added (E8). On this small table the search is a sequential scan filtered to the user; if real accounts
make search slow, the fix is an index decision for the owner, not a surprise.

### Not in Stage E

Reports and exports of payments or customers, reminders or any email, automatic recurring invoices, write-off, a
quotations or repeating-invoices page, merging customers. (Stage F and later.)

## Paid tier (Stages 2–3)

Keys: `invoice_watermark_remove`, `invoice_unlimited_items` (multi-page),
`invoice_save`, `invoice_client_directory`, `invoice_templates`,
`invoice_brand_color`, `invoice_quote_mode`, `invoice_recurring`,
`invoice_csv_export`, `invoice_batch_csv`. All seeded on the `invoice_pro` plan.
`invoice_payments` (record and view payments) is on `free_account` **and**
`invoice_pro`; `invoice_dashboard` (Overview and Payments & collections) stays Pro.

- Stage 2B (free): **built** — see "GST tax invoice" above.
- Stage 2C-1 (Pro): **built** — see above.
- Stage 2C-2 (Pro): **built** — recurring reminders, CSV export, batch from
  CSV, currency reference rates (Frankfurter, approved 2026-10-22) — see above.
- Stage 3 (payments): Razorpay (registered business); needs prices, Razorpay
  activation, and the GST status of the business.
- Recurring = reminder + one-click copy each period; no emails to clients.

PDF generation stays in the browser for Pro too; server checks guard saving,
client directory, recurring and CSV export of saved history.

## Not doing

Login for the free tier · collecting payments from the user's clients (we record
what they received; we never take or move money) · GST
filing-level compliance (GSTIN, HSN/SAC, e-invoicing/IRN) · multi-page in free ·
team seats · upsell clutter inside the free tool.
