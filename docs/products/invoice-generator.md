# Invoice Generator

**Route:** `/invoice-generator` · **Category:** Business · **Status:** Live — Phase 1
(free tier), deployed 2026-10-21. Pro Stage 1 (accounts + saving) built, not
deployed. Decisions: [`DECISIONS.md`](../DECISIONS.md) (2026-10-21 entries).
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
- **Settings (free account):** business details, state, GSTIN, getting paid,
  number prefix + next number, default currency/tax/days-to-pay/notes. New
  invoices start from them.
- **Customers (free: 3) and items (free):** pick them by typing on the invoice
  (native suggestions); “Save as customer” from Bill to.
- **Pro:** Dashboard (billed this month, unpaid, overdue per currency, recent)
  and Mark as paid in the editor and the list.

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
| `app/_components/invoice/invoice-pdf.tsx` | react-pdf A4 template (lazy) |
| `app/_components/invoice/generate-pdf.tsx` | Dynamic import, filename, page count |
| `app/_components/invoice/react-pdf-server-stub.ts` | Server stand-in for `@react-pdf/renderer` (via `turbopack.resolveAlias` in `next.config.mjs`) so the PDF engine stays out of the Worker bundle (−587 KiB gzip) |
| `public/fonts/` | Inter Regular/Bold TTF + `OFL.txt` (PDF font; has ₹) |
| `tests/e2e/invoice.spec.ts` | Playwright: desktop/phone × light/dark, PDF text, 10-item one-page, currency, a11y |

Every paid behaviour goes through `can('<key>')`: item limit →
`invoice_unlimited_items`; footer → `invoice_watermark_remove`.

## Testing

```bash
npm test
```

```bash
npm run test:e2e
```

E2E saves screenshots and sample PDFs to `test-results/screenshots/`
(gitignored).

## Paid tier (Stages 2–3 — not built)

Keys: `invoice_watermark_remove`, `invoice_unlimited_items` (multi-page),
`invoice_save`, `invoice_client_directory`, `invoice_templates`,
`invoice_brand_color`, `invoice_quote_mode`, `invoice_recurring`,
`invoice_csv_export`, `invoice_batch_csv`. All seeded on the `invoice_pro` plan.

- Stage 2B (free): full GST tax invoice — place of supply, CGST+SGST vs IGST,
  per-line HSN/SAC and rates, tax summary, Rule 46 particulars.
- Stage 2C (Pro): footer-free, multi-page, templates, brand colour, quotations,
  recurring copies, CSV, and currency reference rates (Frankfurter / ECB —
  source to be approved).
- Stage 3 (payments): Razorpay (registered business); needs prices, Razorpay
  activation, and the GST status of the business.
- Recurring = reminder + one-click copy each period; no emails to clients.

PDF generation stays in the browser for Pro too; server checks guard saving,
client directory, recurring and CSV export of saved history.

## Not doing

Login for the free tier · collecting payments from the user's clients · GST
filing-level compliance (GSTIN, HSN/SAC, e-invoicing/IRN) · multi-page in free ·
team seats · upsell clutter inside the free tool.
