# Notice Period Calculator

**Status (2026-11-15):** **live** (committed as `3a288fe` on `main`; deployed 2026-11-15, version `11c87958`, from `release/notice-on-affiliate`: see the warning row in `infra/deployment.md`). Route `/notice-period-calculator`, Career category. Decision record: [`../DECISIONS.md`](../DECISIONS.md).

## What it does

Live as you change anything; browser-only; nothing is saved or sent.

- **I know when I'll resign:** the last working day, "that is in 77 days", the rule used in words, and the notice as a calendar strip (weeks Monday to Sunday: the resignation day ringed, notice days tinted, weekend days striped, the last working day solid coral; a **Table** view carries the same facts as text). A very long notice shows its first and last 8 weeks with "N more weeks" between.
- **I know when the new job starts:** the latest day you can resign so the notice ends the day before. Found by trying resignation dates backwards against the same forward rule, so it can never disagree with it (a unit test checks this across thousands of rule combinations).
- **Inputs:** a date (today by default), the notice as a slider and box (0 to 180 typed up to 365 days, or 0 to 6 typed up to 12 months) with common picks, how days are counted (calendar, working days Mon to Fri, working days Mon to Sat), and when notice starts (the day after you resign, or the day you resign). Every non-obvious input has an "i".
- **Under "More":** move a weekend last day to the working day before (calendar and month counts only; working-day counts never end on a weekend); leave at the end of notice (0 to 30 working days: shows your last day in the office, the official day does not move); leaving sooner (pick a date, monthly pay and the divisor 30 or 26: days short and a rough buyout).
- **Suggestions ("What if?"):** serve 10 days less; apply the weekend move in one tap.
- **Keep and share:** Share on WhatsApp and Copy (a sentence; **no date goes into a link**), Add last day to calendar (a small `.ics` all-day event made in the browser), Print / save as PDF. The page-wide "Pass it on" card is the usual one.

## The rules (`app/lib/notice/calc.ts`)

A date is a whole-day number (days since 1970-01-01), so there is no clock, time zone or daylight saving in the arithmetic.

- **Calendar days:** day one is the day after you resign (default) or the day you resign. The last day is day one plus the notice minus one. 30 days from Fri 1 Jan 2027 ends Sun 31 Jan; counting the resignation day as day one ends Sat 30 Jan.
- **Working days:** count only working days from day one. Mon to Fri skips Saturday and Sunday; Mon to Sat skips Sunday. 30 working days from Fri 1 Jan 2027 end Fri 12 Feb (Mon to Fri) or Fri 5 Feb (Mon to Sat).
- **Months:** the day before the same date n months after day one; if that date does not exist (a notice starting on the 31st into February), the last day of that month. 1 month from 1 Jan 2027 ends Mon 1 Feb; from 30 Jan 2027 it ends Sun 28 Feb; from 30 Jan 2028 it ends Tue 29 Feb.
- **Weekend last day:** kept by default (the page says it is a weekend and what the working day before would be); optionally moved to the working day before, never earlier than the resignation day.
- **No notice:** the last day is the day you resign.
- **Buyout:** `round(monthly pay ÷ divisor × days short)`, days short in the notice's own unit (calendar days, or working days when the notice counts those). An estimate only: employers use basic or gross pay and different divisors.
- **Not worked out:** your company's holidays and leave policy, GST on a buyout (unverified, so left out), legal rules. A notice period comes from the offer letter; the page says so and points to the HR portal.

## Why these defaults (research, 2026-11-14)

Three Indian calculators were read (page text only, not clicked through): [Intervue](https://www.intervue.io/tools/notice-period-calculator) (calendar or working days, buyout with ÷30 or ÷26), [Petpooja](https://blog.petpooja.com/free-tools/notice-period-calculator-free/) (recovery by days short; the last day and a PDF sit behind a contact form), [SalaryInHand](https://salaryinhand.in/notice-period-calculator) (buyout with an optional 18% GST line and ads; says nothing about how days are counted). Guides and calculators agree that calendar days starting the day after resignation is the common reading and disagree on the first day, on weekends and on the divisor, which is why each is a visible choice here. None of the three offered a calendar picture, the "when must I resign" question or sharing (a hypothesis from a small sample).

## Tests

`test/notice-period.test.mts` (15: real dates with known weekdays, both starts, working days, months and leap years, weekend rules, the reverse property across thousands of combinations, leave, buyout, the picture, the calendar file) and `tests/e2e/notice-period.spec.ts` (25: known answers, every rule, reverse, weekend, nudges, limits, zero notice, blank date, a year of notice, leave, buyout, WhatsApp text, the `.ics` file, nothing uploaded, every "i", the choices fitting their box, search, catalogue, sitemap, structured data, and 375 / 360 / 320 px in light and dark with touch emulation, everything open, the answer riding on top). Screenshots: `test-results/screenshots/notice-*.png`.

## Shared pieces touched

`Segmented` gained `fill` (full width, equal parts, text wraps) and `SliderField` pads the box for suffixes longer than three characters ("days"); neither changes existing pages. The catalogue entry moved from `/calculators/notice-period-calculator` (planned) to `/notice-period-calculator` (live).

## Later, not built

An **Experience Calculator** (total experience across jobs; it would feed the gratuity five-year rule) can share this date engine. A "buyout with notice recovery from the employer's side" and a holiday list per state are left out on purpose.
