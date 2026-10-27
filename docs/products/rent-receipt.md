# Rent Receipt Generator

`/rent-receipt-generator` (catalogue: India, slug `rent-receipt-generator`). Decision: [`DECISIONS.md`](../DECISIONS.md) (2026-10-27).

## What it does
Monthly rent receipts for an HRA claim, in one PDF. Fill in tenant, landlord, property address, monthly rent, how it was paid and
which months (a financial year, or any months, up to 24). The first receipt appears as you type; **Download PDF** builds the file in
the browser: **three receipts to an A4 page**, each with the date, the sentence "Received with thanks from … the sum of ₹X (Rupees …
Only) as rent for <month>, for the property at <address>", how it was paid, the landlord's name (and PAN if given), a signature line
and, for cash above ₹5,000, a box for a ₹1 revenue stamp. Nothing is sent anywhere and nothing is saved, not even in this browser.

## Rules (from secondary sources, shown as "what employers usually ask for", never as law)
| Rule | In the tool |
|---|---|
| Landlord PAN usually asked for when rent is **more than ₹1,00,000 in a financial year** | A note, and a format check (`AAAAA9999A`). Never blocks. Evaluated per financial year, so 12 months across two years at ₹15,000 does not trigger it. Exactly ₹1,00,000 does not trigger it |
| A ₹1 revenue stamp usually asked for on a **cash** receipt of **more than ₹5,000** | A stamp box on each receipt and a note. Exactly ₹5,000, or UPI / bank transfer / cheque, gets none |
| HRA exemption depends on the tax regime and the employer | Said on the page. No calculation, no section numbers (they changed with the Income-tax Act 2025, and sources disagree) |

## Not done (on purpose)
HRA calculation or any tax advice; PAN verification or storage; e-signature or e-stamp; TDS (section 194-IB); a rent that changes
mid-range (make two sets); saved details; sending to an employer. The generic *Receipt Generator* is a separate planned tool.

## Code
| Piece | File |
|---|---|
| Months, financial years (April to March), receipt dates, the 24-month cap | `app/lib/rent-receipt/months.ts` |
| PAN and stamp rules (money in whole paise as BigInt), PAN format, text cleaning | `app/lib/rent-receipt/rules.ts` |
| Form text → validated receipts, the receipt wording (one place, for page and PDF), file name | `app/lib/rent-receipt/build.ts` |
| Amount in words (exact, no floats) | `app/lib/invoice/words.ts` (`parseAmountText`, `amountWords`) |
| The page: form, live preview, notes, Download | `app/_components/receipt/rent-receipt.tsx` |
| The PDF template (plain `createElement`; takes the react-pdf module as a parameter) | `app/_components/receipt/rent-receipt-pdf.ts` |
| Loads react-pdf only on Download, registers the Inter font (it has the ₹ glyph) | `app/_components/receipt/generate-rent-pdf.ts` |
| Page, steps, FAQ | `app/(calculators)/rent-receipt-generator/page.tsx` |

The template does not import `@react-pdf/renderer` itself: the browser code imports it on demand and the unit tests import it too,
so the real PDF is rendered and read back in Node. (Under the test runner a `.tsx` file loads react-pdf through a path where its own
sub-dependencies do not resolve, hence no JSX there.)

## Tests
- `test/rent-receipt.test.mts`: months and financial years, leap years, the 24-month cap, the PAN and stamp rules at their exact edges,
  PAN format, text cleaning, every refusal with its message, paise, the receipt wording.
- `test/rent-receipt-pdf.test.mts`: the real PDF read back with pdf.js: 12 receipts on 4 pages of 3, in month order, the ₹ sign, words,
  PAN and landlord on each, the stamp box only for cash above ₹5,000, page counts for other lengths, special characters, long text.
- `tests/e2e/rent-receipt.spec.ts`: the form and live preview, the PAN and stamp notes, refusals, month pickers, the PDF that really
  downloads (nothing uploaded), its pages drawn as pictures, light/dark x desktop/phone screenshots.
- **Not verified by any test:** that an employer's payroll accepts this format; the PAN and stamp rules against the statute; how the
  printed page looks on paper (the owner reviews a generated PDF).
