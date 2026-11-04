# HRA Calculator

**Route:** `/hra-calculator` · **Category:** India · **Status:** built locally 2026-11-04 (not committed, not deployed).
**Why:** competitor research on 2026-11-04 found the 50% city list changed from FY 2026-27, and two of three competitor pages checked still showed four metros (Finnovate observed live; Quicko from page text). ClearTax is current but asks a plain Yes/No. Rent Receipt Generator users are the natural audience.

## What it does
- Old-regime HRA exemption = least of (a) HRA received, (b) rent paid minus 10% of salary, (c) 50% or 40% of salary. Salary = basic + DA when DA is provided for under the terms of employment.
- Shows the three limits as bars with the smallest marked "limiting" (a text label, not colour alone), a one-line reason, and "rent that would make the full HRA exempt" as information only.
- Monthly or yearly; eight cities plus "Anywhere else"; FY 2026-27 or FY 2025-26 (four cities).
- Optional "Compare with the new regime" (FY 2026-27 only): salary-only old-versus-new tax using `incomeTax()` from `app/lib/calc/salary.ts`.
- Copy, Print / save as PDF, the page-level Share card. **No result-carrying link: the numbers are salary details.**

## Rules and sources (checked 2026-11-04, `HRA_RULES_CHECKED` in `app/lib/calc/hra.ts`)
- **FY 2026-27 onward:** Income-tax Rules 2026, rule 279 (Schedule III, Table Sl. No. 11), read directly at incometaxindia.gov.in/w/rule-279-1: 50% for Mumbai, Kolkata, Delhi, Chennai, Hyderabad, Pune, Ahmedabad, Bengaluru; 40% elsewhere. Rules notified 20 March 2026, in force 1 April 2026 (Department's Gazette text and CBDT/PIB press release, seen as search excerpts, not opened in full).
- **Up to FY 2025-26:** rule 2A of the Income-tax Rules 1962, four cities at 50% (Department's explanatory pages and ClearTax; the rule text itself was not opened).
- **New regime allows no HRA exemption:** every source agrees; the section number is not quoted anywhere on the page.
- **Not modelled:** commission, bonus, part-year stays, rent paid to a relative, landlord PAN and rent-receipt thresholds, Form 124/12BB. The FAQ tells users to ask payroll.
- **Re-check** after every Budget or Rules amendment (the Department has amended the 2026 Rules several times already).

## Tests
`test/hra.test.mts` (14 cases: worked examples, ties, DA, both city lists, refusals, rent-for-max round trip, regime check hand-worked at ₹12.75 lakh and ₹30 lakh). `tests/e2e/hra.spec.ts` (15 cases: live answer, cities, year switch, monthly/yearly, refusals, regime, copy/print/share, SEO, 360 and 320 px with every view open, screenshots).

## Found while building
At 320 px the "i" button could slide under the number box when a label wrapped. Fixed in `slider-field.tsx` (label row wraps, box is slightly narrower below 360 px), which also helps every other slider calculator.

## Later (not in v1)
Feeding the exemption into the Salary Calculator's deductions box; landlord details and receipts checklist; part-year occupancy.
