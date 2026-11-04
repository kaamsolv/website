# EMI Calculator

**Route:** `/emi-calculator` · **Category:** Money · **Status:** upgraded locally 2026-11-04 (not committed, not deployed).
**Why:** it was the only money calculator still on the old layout (empty fields, no sliders, no share, no "i" help, no prepayment, no browser test). Competitor research (2026-11-04) found prepayment and sliders are already common (Jupiter exercised; Kotak and ICICI from page text), so the value here is a clearer, calmer, shareable version, not a unique feature.

## What it does
- **Find my EMI:** loan, rate, tenure (years + months) with sliders and typed boxes; defaults ₹50,00,000, 9%, 20 years so an answer shows at once. EMI, total interest, total paid, a split bar, the repayment schedule by year or month.
- **Prepayment (collapsed, optional):** an extra amount on every EMI and/or one lump sum paid after a chosen month. With a lump sum it shows **both outcomes side by side**: *Finish sooner* (EMI unchanged) and *Lower my EMI* (end date unchanged), each with interest saved. A balance chart (No prepayment vs With prepayment, Graph | Table) shows the finish-sooner case.
- **How much can I borrow?** enter the EMI you can pay; the biggest whole-rupee loan whose EMI fits.
- What-if lines (5 years shorter, 0.5% lower rate, ₹5,000 extra), Copy, Print, WhatsApp "Share my result" and a link that reopens the page filled in (loan figures only: `a r y m x p n e`), plus the page Share card. "i" help on every input.

## Maths (`app/lib/calc/finance.ts`)
- `emi()` unchanged (monthly reducing balance, paisa rounding, last instalment absorbs rounding).
- `emiPrepay()`: month by month, interest on the balance, EMI plus extra, then the lump sum after the chosen month; `lower` recalculates the EMI on the new balance for the remaining months. A lump bigger than the balance is capped and closes the loan.
- `loanForEmi()`: closed form, then stepped down until `emi()` of the loan fits the budget (bounded to 50 steps; refuses anything over ₹100 crore).
- **Independent checks:** Jupiter's calculator (exercised 2026-11-04, ₹50,00,000, 9%, 20 years, ₹10,000 extra a month): 154 months, interest saved ₹23,65,746; ours ₹23,65,745.99 and an independent loop ₹23,65,747. Closed form for months to finish: −ln(1 − P·r/E) ÷ ln(1 + r). All numbers quoted on the page are in `test/calc-finance.test.mts`.

## Rules and limits
Arithmetic only: no policy rules. The page says a lender's figure can differ (fees, insurance, daily interest, a floating rate that changes) and to ask the lender about part-payment charges. It does **not** state the RBI rule on prepayment charges: only news reports were found, not the directions themselves. Not modelled: floating-rate changes, fees, several lump sums, eligibility. Limits: ₹100 crore, 0–50% a year, 1 month to 40 years.

## Tests
`test/calc-finance.test.mts` (extended, 17 cases), `tests/e2e/emi.spec.ts` (15: defaults, refusals, extra, lump both outcomes, borrow mode, share link reopen and hostile params, print, SEO and FAQ JSON-LD, "i" help, 360 and 320 px with everything open, screenshots).

## Later
Floating-rate scenarios, several dated lumps, loan comparison, feeding the EMI into a budget view. The catalogue doc lists the old route `/calculators/emi-calculator`; the live route is `/emi-calculator`.
