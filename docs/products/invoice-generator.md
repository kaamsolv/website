# Invoice Generator

**Route:** `/invoice-generator` · **Category:** Business · **Status:** Live — Phase 1
(free tier), deployed 2026-10-21. Decisions: [`DECISIONS.md`](../DECISIONS.md)
(2026-10-21 entry).

## What it is

Type straight onto a white invoice "paper" and download a one-page A4 PDF. No
sign-up, nothing uploaded, nothing saved. Totals update as you type (§45); there
is no Generate button.

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

## Paid tier (Phase 2 — not built, needs approval)

Keys: `invoice_watermark_remove`, `invoice_unlimited_items` (multi-page),
`invoice_save`, `invoice_client_directory`, `invoice_templates`,
`invoice_brand_color`, `invoice_quote_mode`, `invoice_recurring`,
`invoice_csv_export`, `invoice_batch_csv`.

Approval gates: payment provider (Stripe India is invite-only; Razorpay
alternative), auth model, schema + privacy model (saved invoices hold personal
data → Privacy/Terms update), pricing and GST on our own sales.

PDF generation stays in the browser for Pro too; server checks guard saving,
client directory, recurring and CSV export of saved history.

## Not doing

Login for the free tier · collecting payments from the user's clients · GST
filing-level compliance (GSTIN, HSN/SAC, e-invoicing/IRN) · multi-page in free ·
team seats · upsell clutter inside the free tool.
