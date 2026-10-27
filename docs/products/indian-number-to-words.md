# Indian Number to Words

`/indian-number-to-words` — an amount in figures, in words, lakh and crore style, live as you type. Catalogue: India
(`slug indian-number-to-words`). Decision: [`DECISIONS.md`](../DECISIONS.md) (2026-10-27).

## What it does
- One box, "Amount in figures". Accepts `125000`, `1,25,000`, `125,000`, `₹ 1,180.5`, `Rs. 500`, `.50`, `5.`.
- Shows how it reads in figures with Indian grouping (`₹1,25,000.50`), so a typo is visible.
- Two results, each with Copy:
  - **Cheque style** — `Rupees One Lakh Twenty-Five Thousand and Fifty Paise Only` (`.50` alone → `Fifty Paise Only`; `0` → `Rupees Zero Only`).
  - **Just the words** — `One Lakh Twenty-Five Thousand Point Five Zero` (decimals read digit by digit).
- Runs entirely in the browser: no sign-in, no request, nothing stored.

## Rules (the parser is strict on purpose)
A cheque must not change value, so these are **refused with a plain message**, never fixed silently:
a comma that is not a thousands separator (`1,5`, `12,34`), a minus sign, letters or `1e5`, more than 2 decimal places
(extra zeros such as `100.000` are fine), more than **14 integer digits** (up to 9,99,99,99,99,99,999 = 99 lakh crore).
A lone `₹` or `Rs.` counts as empty. Above a crore the words keep counting in crore ("One Thousand Crore"): no arab, kharab or
neel. At 15 digits the crore count itself passes a crore and the words would repeat "Crore", hence the 14-digit limit.

## Code
| Piece | File |
|---|---|
| Parsing, grouping, wording (BigInt, framework-free) | `app/lib/invoice/words.ts` — `parseAmountText`, `groupIndian`, `figuresIndian`, `amountWords`, `indianWordsBig` |
| UI | `app/_components/calc/number-to-words.tsx` |
| Page (steps, FAQ, related tools) | `app/(calculators)/indian-number-to-words/page.tsx` |
| Catalogue entry | `app/lib/catalogue.ts` (`status: 'live'`, flat URL like every live tool) |
| Reserved short-link name | `app/lib/reserved-routes.ts` (`indian-number-to-words`; `test/reserved-routes.test.mts` fails without it) |

`indianNumberWords(number)` and `rupeesInWords(number)` (used by the Invoice Generator) are kept, with the same output;
`indianNumberWords` delegates to `indianWordsBig`. `rupeesInWords` is unchanged (for `0.5` the invoice still says
"Rupees Zero and Fifty Paise Only"; the tool says "Fifty Paise Only").

## Tests
- `test/number-words.test.mts` — parsing, refusals, every group edge, the largest amount, paise, grouping, **parity with a
  verbatim copy of the old functions** on thousands of generated values.
- `tests/e2e/number-words.spec.ts` — live typing, paise, refusals, example buttons, Copy to clipboard, sitemap/tools listing,
  light/dark × desktop/phone screenshots with a no-sideways-scroll check.

## Not done (on purpose)
Hindi; international (million/billion) wording; other currencies; lakh↔million conversion (planned *Indian Currency Converter*);
cheque printing / PDF; history. FAQ wording about "Only" is common practice, not legal advice — banks can have their own rules.
