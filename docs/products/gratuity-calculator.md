# Gratuity Calculator

`/gratuity-calculator` (catalogue: India, slug `gratuity-calculator`). Decision: [`DECISIONS.md`](../DECISIONS.md) (2026-10-27).

## What it does
Joining date, last working day and last drawn monthly wages in; the gratuity out, live, with the working shown
(`₹50,000 × 15 × 10 ÷ 26`) and a Copy button. Permanent / fixed-term and leaving / death-or-disability are switches. If the person
is not eligible yet it says why and the date they will be. Everything runs in the browser; nothing is sent or saved.

## Rules it uses (checked 27 October 2026, from secondary sources — the statute has NOT been read)
| Rule | In the tool |
|---|---|
| Gratuity = wages × 15 × years ÷ 26 (Payment of Gratuity Act, carried into the Code on Social Security) | The formula, exact (whole paise as BigInt), rounded to the rupee, half up |
| A part-year of **more than six months** counts as a full year; exactly six months does not | `countedYears`; the result says when it rounded up |
| 5 years' service for permanent staff; 1 year for fixed-term (new labour codes); none on death or disability | `MIN_YEARS`; "not eligible yet" shows the date the minimum is reached |
| Maximum ₹20,00,000 under the Act (employer may pay more) | `GRATUITY_CAP_RUPEES`; the result shows the formula figure and the limit |
| "Wages" = basic + DA; the codes (in force 21 Nov 2025) widen it and sources disagree on the 50% test | The person enters the wages figure; the page says so |

Conventions: the last working day counts as worked (1 Jan 2020 to 31 Dec 2024 = exactly 5 years); months from the joining date clamp
to month end; no time zones (plain year-month-day).

## Not done (on purpose)
Employers outside the Act (15/30 or average of 10 months); tax or exemption (a note only, no section numbers); the "4 years 240 days"
idea (a note when service is 4y 8m or more); a CTC-to-wages estimator; leave encashment; saving or history.

## Review
Live since 2026-10-27; the owner reviewed the rules box and FAQ wording. Rules can change; update `RULES_AS_OF` when rechecked.

## Code
| Piece | File |
|---|---|
| Dates, service period, counted years, eligibility date | `app/lib/gratuity/service.ts` |
| Inputs → validated outcome, the formula, the cap | `app/lib/gratuity/calc.ts` |
| Amount parsing and Indian grouping | `app/lib/invoice/words.ts` |
| The page UI | `app/_components/calc/gratuity-calculator.tsx` |
| Route, steps, FAQ | `app/(calculators)/gratuity-calculator/page.tsx` |
| Tests | `test/gratuity.test.mts` (15), `tests/e2e/gratuity.spec.ts` (14) |
