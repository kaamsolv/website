# Coupons: the free generator, then tracked redemption (paid)

**Status (2026-11-13):** Phase 1 is built locally on `feat/coupon-generator` (not committed, not deployed): the engine, the page at `/coupon-code-generator` (design approved by the owner in chat), its Business catalogue entry, search phrase and tests. No database change. Phase 2 onwards is not started. Decision record: [`../DECISIONS.md`](../DECISIONS.md).

## The plan (approved by the owner, 2026-11-13)

| Phase | What | Account | Status |
|---|---|---|---|
| 1 | **Free Coupon Code Generator**: make one or many codes, optional discount and expiry labels, copy / CSV / TXT. Runs in the browser; nothing is uploaded. | none | built locally; awaits commit and deploy approval |
| 2 | **Coupons Pro (paid): tracked redemption.** Saved batches; codes that are single-use or limited-use and expire on the server; a hosted redeem page (staff / till mode) and QR coupons; redemption counts and CSV export. Works for shops with no online store. | account; Pro | not started; needs approval of schema, entitlement keys and the redemption data we keep |
| 3 | A small API so a shop's own checkout can ask "is this code good?" and "redeem it". Needs merchant API keys (none exist in the repo today). | Pro | later |
| 4 | Store connectors: WooCommerce first (REST API, free to use), Shopify only if people ask (app review, protected customer data). | Pro | later, on demand |

## What Phase 1 leaves out (on purpose)

Redemption tracking; enforcing single use or an expiry (a code is a string, the discount and date are **labels** your store or till enforces); accounts, saved batches and history; store connectors and platform pushes; sending codes to customers (email, WhatsApp, SMS); coupon QR codes and a claim page; an API or webhooks; analytics; teams.

## Not doing, to keep it at zero cost

- **Automated WhatsApp or SMS sending.** It is charged per message (sources put India marketing messages at about ₹0.86 and utility at about ₹0.115 before GST and provider markup). A WhatsApp **share link** stays free (as on invoices).
- **Pushing codes into Razorpay.** Its documentation describes offers as created in the Razorpay Dashboard; the API attaches an existing offer to an order. Nothing to push to.
- No paid third-party API, no per-seat tools, nothing uploaded in Phase 1.

## The page (`/coupon-code-generator`)

`app/coupon-code-generator/page.tsx` (server page in `ToolPageShell`: steps, 8 FAQs, related tools, WebApplication, FAQPage and Breadcrumb JSON-LD) and the client island `app/_components/coupon/coupon-generator.tsx`, in the shared slider-calculator `Frame` (inputs left, answer right; on a phone the answer rides at the top while you drag).

- **Inputs:** how many codes (slider and box, 1 to 1,000), characters per code (4 to 16), prefix, characters (clear / letters / digits / letters and digits), dashes (every 4 / every 3 / none), an optional discount label (none / % off / ₹ off) and an optional valid-until date. Every input a non-expert might not understand has an "i" note. Defaults give 100 codes on first load. **Dashes is a small addition to the approved mockup** (some tills reject dashes).
- **Answer:** "N codes", the odds of a lucky guess in lakh and crore (a strength bar, with a plain warning under 1 in 10 lakh), six sample codes, copy all, CSV, TXT, make a new set, and "See every code". A yellow note says the discount and date are labels and the page cannot stop a code being used twice; "Made on your device. Nothing is uploaded."
- **Behaviour worth knowing:** the settings that shape a code (length, characters, dashes) draw a pool of 1,000 unique codes after the page loads (codes are random, so they are not pre-rendered); the count and the prefix are applied on top, so dragging the count or typing a prefix never reshuffles the codes you see. "Make a new set" redraws. An invalid number shows a plain message and no codes; an invalid discount or date keeps the codes and copy working but holds the files.
- **Free cap:** 1,000 per batch (`MAX_CODES` in the component). Generation is free and local, so this is a comfort limit, not a paywall; the engine allows 10,000.
- **Shared pieces touched:** `CopyButton` gained optional `primary` and `onCopied`; the catalogue, `reserved-routes.ts` and `search-actions.ts` got their entries. Analytics: a success is counted on the first copy or download (`generator`).
- **Tests:** `tests/e2e/coupons.spec.ts` (20: first load, settings, slider and box, stable codes, uniqueness at 1,000, refusals, CSV and TXT read back, labels, copy, nothing uploaded, keyboard, search, catalogue, sitemap, JSON-LD, and 375 / 360 / 320 px in light and dark with no sideways scroll). Screenshots land in `test-results/screenshots/coupons-*.png`.

## The engine (`app/lib/coupons/`)

- `generate.ts`: `generateCoupons({ count, length?, prefix?, groupSize?, charset? })`. Format `PREFIX-XXXX-XXXX`. Secure random (`crypto.getRandomValues`, never `Math.random`), unbiased (rejection sampling), unique within a batch. Default alphabet is 31 symbols with no `I L O 0 1`; also letters-only, digits-only, and all A-Z0-9. Limits: 1 to 10,000 codes (a technical ceiling; the free cap is a page decision), 4 to 16 random characters, prefix up to 12 letters or digits, groups of 2 to 8 or none. A request that cannot be met throws `CouponError` with plain-English text (including "too many for this length": a batch may use at most half the possible codes). `cleanPrefix`, `codeSpace`, `describeStrength` feed the page's live prefix box and its "how hard to guess" note.
- `export.ts`: `couponsToCsv` (columns `code,discount_type,discount_value,expires_on`; CRLF; plain ASCII, **no byte-order mark** so importers read the header literally; formula-looking cells are defused by the invoice CSV writer's `csvCell`) and `couponsToTxt`. Discount label: percent above 0 up to 100, or an amount above 0, at most two decimals. Expiry label: a real date, `YYYY-MM-DD`.
- `describe.ts`: `plainNumber` (lakh and crore) and `describeOdds` (the guess sentence, the weak flag, the bar). `applyPrefix` and `couponFileName` support the page.
- Tests: `test/coupons.test.mts` (20 cases: alphabets, shape, prefix, grouping, charsets, no `Math.random`, rejection sampling, spread, broken random source, uniqueness at the limit, refusals, strength, CSV, labels, TXT, file names, odds wording).
- Known limit: codes are not filtered for accidental words.

## Why this shape (research, 2026-11-13)

- Free generators (ConversionPro+, Heights Platform, Cartylabs) make code **strings**; expiry is a label there too. Shopify and WooCommerce already make codes and track use inside the store, so a connector adds little. Promo platforms (Voucherify and similar) start at hundreds of dollars a month. The gap is **shops without a store** (counter, restaurant, salon, event, WhatsApp and Instagram sellers) who need a code that can be checked and used once. That is a hypothesis, not measured demand: no search-volume data was available.
- Zero-cost basis: Cloudflare Workers free plan 100,000 requests a day and 10 ms CPU (past it requests fail, not billed); Neon free plan 1 GB per project; Resend free 3,000 emails a month, 100 a day. **Unknown: which Cloudflare and Neon plans production is on**, and coupons would share that database with invoices and QR scans. Check before Phase 2.
- Shopify's bulk-add mutation takes at most 250 codes per call and needs `write_discounts`; reading orders needs protected customer data approval for public apps. Whether Shopify's App Store charges a registration fee was not confirmed.

## Open decisions (not made)

Free batch size on the page; Phase 2 price and entitlement keys (the entitlement model, not hard-coded limits); the redemption data we keep (aim: no personal data, as with QR scans); whether the Business category's first Coupon entry goes in the catalogue at Phase 1 launch (categories stay locked; Business is the natural home).
