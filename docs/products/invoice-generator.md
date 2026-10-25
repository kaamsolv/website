# Invoice Generator

**Route:** `/invoice-generator` · **Category:** Business · **Status:** Live — free
tier (2026-10-21); accounts and saving (Stage 1), workspace (2A) and GST tax
invoice (2B) deployed 2026-10-22. Pro Stage 2C-1 built, not deployed. Decisions: [`DECISIONS.md`](../DECISIONS.md) (2026-10-21 entries).
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
  unpaid, overdue per currency, recent) and Mark as paid in the editor and the
  list.

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

## Pro — Stage 2C-1 (built, not deployed)

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

## Paid tier (Stages 2–3)

Keys: `invoice_watermark_remove`, `invoice_unlimited_items` (multi-page),
`invoice_save`, `invoice_client_directory`, `invoice_templates`,
`invoice_brand_color`, `invoice_quote_mode`, `invoice_recurring`,
`invoice_csv_export`, `invoice_batch_csv`. All seeded on the `invoice_pro` plan.

- Stage 2B (free): **built** — see "GST tax invoice" above.
- Stage 2C-1 (Pro): **built** — see above.
- Stage 2C-2 (Pro): recurring copies, CSV export, batch from CSV, currency
  reference rates (Frankfurter / ECB, approved 2026-10-22).
- Stage 3 (payments): Razorpay (registered business); needs prices, Razorpay
  activation, and the GST status of the business.
- Recurring = reminder + one-click copy each period; no emails to clients.

PDF generation stays in the browser for Pro too; server checks guard saving,
client directory, recurring and CSV export of saved history.

## Not doing

Login for the free tier · collecting payments from the user's clients · GST
filing-level compliance (GSTIN, HSN/SAC, e-invoicing/IRN) · multi-page in free ·
team seats · upsell clutter inside the free tool.
