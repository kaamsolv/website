# Interest and investment calculators (SIP, FD, RD, simple, compound)

Five pages, one maths file, one UI file. Built 2026-11-04 on the owner's approved plan (kickoff in `DECISIONS.md`). Pure browser maths: no server,
no database, no new dependency, nothing stored or sent. Category: Money. **Status: built locally, see DECISIONS for whether it is deployed.**

| Page | Formula and conventions (all stated on the page) |
|---|---|
| `/sip-calculator` | Money goes in at the **start** of each month; monthly rate = yearly ÷ 12; value = P × ((1+i)^n − 1) ÷ i × (1+i). Optional yearly step-up (amount rises by x% at the start of each year; worked month by month). Not advice: "returns are assumed, not guaranteed; mutual fund investments are subject to market risk". |
| `/fd-calculator` | A = P (1 + r/n)^(n t); monthly, **quarterly (default)**, half-yearly, yearly. Cumulative FD only. No TDS, no premature-withdrawal rules, no bank rates listed. |
| `/rd-calculator` | Monthly deposits, interest **quarterly**; the deposit in month k earns (1 + r/4)^(months left ÷ 3). Equals the published closed form R × ((1+i)^(n/3) − 1) ÷ (1 − (1+i)^(−1/3)). |
| `/simple-interest-calculator` | I = P r t ÷ 100, t = years + months/12 + days/365. |
| `/compound-interest-calculator` | A = P (1 + r/n)^(n t); daily, monthly, quarterly, half-yearly, yearly. |

Limits (calm per-page message, never NaN): amount > 0 and ≤ ₹100 crore; rate 0–25% (0–50% for a SIP return, step-up 0–50%); period 1 month to 50 years.
Rounded to the paisa only at the end. **A bank's own figure can differ by a few rupees** (rounding, day counts): said on each page.

## Checked
`test/interest.test.mts` (13 tests): hand-worked cases, a second method for each (SIP and RD month-by-month vs the closed forms), invariants (more time/rate/frequency never
lowers a result; 0% returns the principal), every refusal, and **every number quoted in the pages' FAQs and worked examples** (so the copy cannot drift from the maths).
`tests/e2e/interest-calculators.spec.ts` (18): live answers, refusals, nothing sent, SIP step-up and table, FD compounding switch, Copy, the Share card on three tools, SEO tags
and structured data on all five pages, and phone/desktop, light/dark screenshots with no sideways scroll.
**Not verified:** agreement with any specific bank's or app's calculator to the rupee (the official pages were not reachable), real search ranking.

## SEO (per page, and shared by every tool page)
Per page: one H1, unique title and description (≤ 160), canonical, keywords from the catalogue, intro that answers the query first, "How it works", 6–8 FAQs with worked numbers,
related tools. Shared (`app/lib/tool-metadata.ts`, `app/_components/tool-page-shell.tsx`, `app/layout.tsx`): Open Graph (site name, `en_IN`, image), Twitter card with image,
`en-IN` and `x-default` language alternates, `robots` with `max-image-preview: large` / `max-snippet: -1`, **FAQPage** and **Organization** JSON-LD alongside WebApplication and
BreadcrumbList. `public/og-default.png` is one generated 1200×630 brand image (wordmark and palette; replace when the new logo arrives). Owner steps after deploy: submit
`/sitemap.xml` in Google Search Console and Bing Webmaster Tools, request indexing of the five URLs, test one in Google's Rich Results Test.

## Share card (every tool page)
`app/_components/share-tool.tsx`, shown under the tool by `ToolPageShell`: "Saved you some kaam? Pass it on." with **Share on WhatsApp** (wa.me message with the tool name, blurb and the plain
page URL), **Copy link**, and **More** (the phone's share sheet, only where the browser has one). No tracking parameters; nothing is sent to KaamSolv.

## Not done (on purpose)
Fund, bank or scheme recommendations; today's FD rates; TDS or income tax; inflation or goal planning; lump sum + SIP; premature withdrawal; saving or history; PDF export (Copy only).

## UI redesign (2026-11-04)
Approved mockup implemented: `SliderField` (slider + typed box), `GrowthChart` (SVG, Graph|Table), two-column layout, sticky answer on phones, prefilled defaults, split bar, "About ₹X lakh". Simple interest has sliders and no chart. WhatsApp buttons site-wide use WhatsApp green (`whatsapp-style.ts`). Rule recorded as CLAUDE.md §47. Later: EMI/GST retrofit, SIP "reach a goal" mode.

## Value-add pack (2026-11-04)
Approved from the "make it better" list; rule recorded as CLAUDE.md §48.
- **Reach a goal** (SIP, FD, RD): `goalSip/goalRd/goalCompound` in `app/lib/calc/interest.ts`. Results are linear in the amount, so a first estimate is refined to the smallest whole rupee that does not fall short (tested: one rupee less always falls short).
- **Today's money**: `realValue = value ÷ (1+inflation)^years`, off by default, 6% suggested, 0–12% allowed. Dashed line on the chart.
- **Tax estimate** (FD, RD): user picks 0/5/10/20/30%; tax = rate × interest. No slab law, TDS, rebate, surcharge or cess is built in, and the page says so.
- **What-if nudges**: live one-liners with "Try it" that set the slider.
- **Result-carrying share**: `app/lib/calc/share-state.ts` reads/writes `?a=&r=&y=&m=&s=&f=&g=&i=&t=&d=`; every value is range-checked, unknown or hostile values are ignored. Canonical URL, title and meta never change with the query (CLAUDE.md §20). WhatsApp message carries the numbers plus the link.
- **Print / save as PDF**: `window.print()` and an `@media print` rule in `globals.css` (hides header, footer, inputs, share, FAQ); no PDF library.
- **Compare page** `/sip-vs-fd-vs-rd-calculator`: Every month = SIP vs RD; One lump sum = market-linked vs FD. Neutral wording, no recommendation.
- Components: `result-extras.tsx`, `compare-calculator.tsx`; tests `test/interest-extras.test.mts`, `tests/e2e/interest-extras.spec.ts`.
- Not done: SIP vs FD with tax, goal mode for simple/compound pages beyond FD/compound, PDF with branding.

## Phone fix and "i" help (2026-11-04, after first live use)
- **Bug:** on a phone with the Table view open, the page grew wider than the screen and the sliders and number boxes were cut off. Cause: a one-column grid sizes itself to its widest content, and the table has a minimum width. Fix: the grid column is `minmax(0,1fr)` and the cards are `min-w-0`, so the table scrolls inside its own box. Regression test at 360px and 320px with Table view open (`tests/e2e/interest-mobile.spec.ts`). Why it was missed: the earlier no-sideways-scroll check ran at 375px with the Graph view only.
- **"i" help:** every slider, the compounding choice, tax rate and today's money carry a small "i" that opens a plain-words note under the label (`info-tip.tsx`, texts in `HELP` and the page components). In-flow, never floating, so it cannot be cut off. Rule for new tools: every input that is not self-explanatory gets one.
- The big answer now shrinks and wraps its Copy button on narrow screens instead of breaking the number.
