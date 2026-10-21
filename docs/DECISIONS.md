# KaamSolv — Decision Log

Short, dated record of decisions that change the product, brand or
infrastructure. Newest first. Detail lives in the linked docs.

---

## 2026-10-21 — Invoice Generator (Phase 1: free tier)

**Decided by:** product owner (§46 kickoff + plan approved).

- **Dependencies installed before formal approval on 2026-10-21; retroactively
  approved; process note for future tools.** The next tool waits for explicit
  approval before any install.
- **Phasing.** Phase 1 = the free tool only (no account, no saving). The paid
  tier (Phase 2) needs separate approval of payment provider, auth, database
  schema/privacy model and pricing (§40). Full spec:
  [`products/invoice-generator.md`](./products/invoice-generator.md).
- **PDF library: `@react-pdf/renderer`** over jsPDF + html2canvas. Vector,
  selectable text and declarative templates outweigh the size (~440 KB gzip),
  which loads only on the first Download / Preview, never on page load and
  never in the Worker. Font: Inter Regular + Bold TTF (₹ verified), OFL,
  served from `public/fonts/`.
- **Dev-only test deps:** `@playwright/test` (e2e) and `pdfjs-dist` (reads the
  text inside the downloaded PDF in tests). Neither ships to visitors.
- **PDFs are made in the browser for everyone, Pro included.** Server-side PDF
  would send the user's clients' personal data to us (breaks the Privacy
  page promise; DPDP processor role) and needs paid Workers CPU. Accepted
  risk: a determined user can strip the free footer via dev tools. What Pro
  sells that matters (saving, client directory, recurring, CSV export) is
  server-enforced.
- **Entitlements:** `app/lib/entitlements.ts` — named keys
  (`invoice_watermark_remove`, `invoice_unlimited_items`, `invoice_save`, …),
  `useEntitlements()` / `can(key)`. Everyone gets the empty free set today;
  Phase 2 swaps only the data source. Never "if paid allow all".
- **Free line-item cap: 10** (spec changed from 5 with owner's confirmation).
  10 two-line items + notes verified to fit one A4 page; 5 would feel like a
  bait paywall. `invoice_unlimited_items` later means multi-page invoices.
- **Payment provider: TBD.** Stripe is invite-only for Indian businesses
  (registered business + video KYC). The schema and lookup keys work for
  Stripe or Razorpay; the drafted webhook is the Razorpay variant
  (HMAC-SHA256 over the raw body, idempotent on `x-razorpay-event-id`).
- **Not a GST tax invoice.** No GSTIN/HSN/SAC/e-invoicing checks (§33); the FAQ
  says so plainly.

---

## 2026-10-21 — UI audit: one choice control for all tools

**Prompted by:** owner noticed GST's selected options looked like slightly
different blues. Cause: newer tools hard-coded `bg-navy-900` for selected,
which in dark mode is ~1.1 : 1 against unselected. Fixed with shared
`Segmented` (modes) and `Chips` (values) on the design system's theme-aware
`activebg` / `activetext` tokens, ✓ on selected chips, radio semantics, 40 px
targets. Applied to GST, EMI, Percentage, Tip, Split bill, Case converter,
Lorem ipsum, Image Compressor, Resize image to KB and the converters' resize
options. Result-card buttons made pill-shaped like every other action button.
Rule recorded in `DESIGN-SYSTEM.md` §13.

---

## 2026-10-21 — Resize image to KB (exact size for forms)

**Decided by:** product owner (plan approved via the §46 kickoff).

- New page `/resize-image-in-kb` (not a mode of the compressor) — matches how
  people search. Draggable crop box; batch up to 20.
- **New dependency: `fflate` ^0.8.3** for the "Download all" ZIP, built in the
  browser. Small, maintained, no audit advisories at install.
- Output JPG only; KB limit treated as ≤ N × 1000 bytes; files are never
  padded to meet a minimum; an oversized result is never labelled as fitting.
- No exam-specific presets (requirements change) — generic KB picks and a
  passport 3.5 × 4.5 cm preset; users type what their notice says.
- Details: `products/image-kit.md` → "Exact size module".

---

## 2026-10-21 — Image Compressor, Writing pack, Everyday calculators

**Decided by:** product owner.

- New live tools (23 total): `/image-compressor` (see `products/image-kit.md`);
  writing — `/word-counter`, `/character-counter`, `/case-converter`,
  `/text-cleaner`, `/lorem-ipsum-generator`; calculators —
  `/percentage-calculator`, `/discount-calculator`, `/tip-calculator`,
  `/split-bill-calculator`, `/age-calculator`.
- **Tools live at top-level URLs**, like the converters — not under
  `/writing/…` or `/calculators/…` (those segments were never approved). Every
  new route is reserved against short codes (enforced by test).
- Shared `ToolPageShell` + `toolMetadata` for new tool pages; logic is
  framework-free in `app/lib/text` and `app/lib/calc` with unit tests.
- Word counting follows Microsoft Word (punctuation-joined tokens are one word;
  CJK/Thai via Intl.Segmenter). Character limits list carries a "checked
  October 2026" date — re-check periodically.
- Age: 29 Feb birthdays fall on 28 Feb in non-leap years. Money shown with
  Indian grouping (₹1,25,000.00).
- GST and EMI calculators followed the same day (`/gst-calculator`,
  `/emi-calculator`).

## 2026-10-21 — GST and EMI calculators

- **GST rates source:** PIB release on the 56th GST Council meeting (PRID
  2163555) — from 22 Sept 2025, 5% merit and 18% standard rates, 40% for a few
  demerit/luxury items. Presets are 5 / 18 / 40; anything else (special items,
  older 12% / 28% invoices) uses Custom. Special rates for gold/diamonds were
  not confirmed from an official source, so they are not stated. Rates are in
  `app/lib/calc/finance.ts` with a "checked" date — **re-check when the GST
  Council changes rates.** The page says it's an estimate, not tax advice.
- Shows both CGST + SGST/UTGST (intra-state, half each; odd paise go to SGST
  so the two always add up) and IGST (inter-state).
- **EMI:** standard monthly reducing-balance formula; last instalment absorbs
  rounding so the schedule ends at ₹0; yearly and monthly schedule. Limits:
  ₹1 – ₹100 crore, 0–50% a year, 1–480 months.
- Known dev-only console warning on all pages ("Encountered a script tag while
  rendering React component"), pre-existing, likely the theme script in
  `app/layout.tsx`. No user impact; tidy up later.

---

## 2026-10-21 — Basic pages: Privacy, Terms, About, Contact

**Decided by:** product owner. **Status: drafts — owner to review before
deploy; ideally a legal review of Privacy and Terms.**

- New pages `/privacy`, `/terms`, `/about`, `/contact` on a shared `TextPage`
  shell. Contact email: **kaamsolv@gmail.com** (mailto links pre-fill a subject:
  Tool suggestion, Feedback, Privacy request).
- Privacy describes only what the code does today: no cookies, no analytics or
  ad trackers; theme choice in local storage; image + QR tools run in the
  browser; URL Shortener stores destination, salted IP hash, and per-click
  time/device class/referrer domain/country; reports; rate-limit counters;
  Cloudflare (hosting) and Neon (Singapore) as processors. **Rule: any change
  that adds a cookie, tracker, third party or stored field updates
  `app/privacy/page.tsx` in the same change.**
- "Log in" removed from the header and phone menu until accounts exist.
  "Suggest a tool" → `/contact#suggest`, "Feedback" → `/contact#feedback`,
  "Cookies" → `/privacy#cookies`. No broken internal links remain.
- Open points for the owner: legal entity name and address (Terms/Privacy say
  just "KaamSolv"); which city's courts for disputes (Terms say only "laws of
  India"); confirm the 18+ audience statement.

---

## 2026-10-21 — All tools page, "coming soon" entries, shorter short links

**Decided by:** product owner.

- **`/tools` page:** every catalogue tool. "Ready to use" grid of live tools,
  then each category (anchor `#<category-slug>`) with live tools first and
  planned ones as compact grey "Coming soon" cards (anchor `#<tool-slug>`).
- **Coming soon is allowed** (refines CLAUDE.md §13): live first, planned
  visually secondary and never a link to a missing page. "Faded" = grey text +
  dashed outline, not opacity (60% opacity measured 2.56:1 contrast; plain muted
  text is 5.93:1).
- **Homepage:** hero sticky notes now link to live tools (shortener, QR, PNG→JPG,
  HEIC→JPG) followed by two "Soon" notes (GST, invoice) — status is read from
  the catalogue, so a note goes live with its tool. Quick links under search,
  the Popular grid, search results and related-tools sections show live tools
  first; planned tools route to their `/tools` entry instead of a 404.
- **Category links** (homepage, footer, header "Categories") go to `/tools#…`
  instead of the unbuilt `/categories/*` pages. Footer's dead Calculators /
  Converters / Generators links replaced with live tools.
- **Short links shown and copied without `https://`** (`kaamsolv.com/abc1234`);
  "Copy with https://" button for forms and other QR makers. The API's
  `shortUrl` still includes the scheme. On phones the Copy button is icon-only
  so the whole link fits.
- Still 404 (need content or decisions): About, Contact, Feedback, Suggest a
  tool, Log in, Privacy, Terms, Cookies.

---

## 2026-10-21 — URL Shortener live

**Decided by:** product owner.

- Deployed to `kaamsolv.com` and listed: first card in the homepage's Popular
  tools. Percentage Calculator (planned) left the rail to keep six cards and
  one fewer "Soon" placeholder.
- Verified with real links on production (see `products/url-shortener.md` §11).
  Test links `kaamsolv.com/hmTfloG` and `kaamsolv.com/883xfqy` remain — harmless,
  or disable with `npm run link:status -- <code> disable --confirm`.
- Homepage card copy changed to "Paste a long link, get a short one you can
  share anywhere." — click stats aren't built yet.

---

## 2026-10-21 — URL Shortener merged into `main` (not yet deployed)

**Decided by:** product owner (merge + local test; deploy waits for approval).

- `cf-workers-poc` (URL Shortener + Cloudflare runtime changes) merged into
  `main` and renamed to KaamSolv. Catalogue stays `planned` until launch.
- **Route clash resolved:** image converters are now ten static folders under
  `app/(image-converters)/` sharing `converterMetadata` / `ConverterRoute`, so the
  shortener's `app/[shortCode]` owns the root dynamic segment. URLs unchanged.
  Converter slugs are reserved short codes; `test/reserved-routes.test.mts` fails
  if any top-level route folder isn't reserved.
- Known issue: `npm run link:status` / `link:reports` print their result but
  don't exit when run against local PGlite (stop with Ctrl-C). Not seen with Neon
  yet; tool-only, no effect on the site.

---

## 2026-10-21 — New Neon database for the URL Shortener

**Decided by:** product owner.

- New Neon account (kaamsolv Gmail) and project `kaamsolv` in **Singapore**,
  replacing the old KaamKit database in `us-east-2`: every short-link redirect
  queries it, so it sits near Indian visitors. An empty project accidentally
  created in Ohio (`long-dawn-09331756`) is unused and should be deleted.
- Tables created and Worker secrets set — see
  [`infra/deployment.md`](infra/deployment.md). The old database and the old
  `.env.local` in the `url-shortener` worktree are no longer used.

---

## 2026-10-21 — Image converters live

**Decided by:** product owner.

- `feature/image-converters` merged into `main` and deployed: 10 converters
  (JPG, PNG, WEBP, HEIC, AVIF pairs) at `/{from}-to-{to}`, processed in the
  browser. Old `/image-tools/{slug}` paths redirect there. Image Compressor is
  still planned. Product docs: [`products/image-kit.md`](products/image-kit.md).
- Fixed on merge: the result card showed "Original: 0 B" because the input
  buffer was read after being transferred to the Web Worker.
- **Heads-up for the URL Shortener merge:** converters use a root-level
  dynamic route `app/(image-converters)/[slug]`, and the shortener uses
  `app/[shortCode]`. Next.js won't allow both at the root. One must give way
  (e.g. converters as static routes, or the shortener checks converter slugs
  first) — decide at that merge.
- Polish backlog: a non-image file shows a broken preview and the error
  "The source image could not be decoded." — should be caught on drop with
  friendlier copy.

---

## 2026-10-21 — Hosting: Cloudflare Workers

**Decided by:** product owner.

- KaamSolv is hosted on **Cloudflare Workers** via OpenNext, replacing Vercel.
  Worker `kaamsolv`, Custom Domains `kaamsolv.com` (canonical) and
  `www.kaamsolv.com` (308 → apex). Detail: [`infra/deployment.md`](infra/deployment.md).
- Builds on the `cf-workers-poc` proof of concept. Its URL-Shortener-specific
  runtime changes (Cloudflare geo header, production detection) are still on
  that branch and must come in with the URL Shortener.
- Code repository is now `github.com/kaamsolv/website`; the old one stays as
  remote `kaamkit-old`.
- Upgraded Next.js 16.3.4 → 16.4.2 for a critical advisory (GHSA-vcvr-r3jv-pc5j)
  and because OpenNext requires ≥ 16.4.1.

---

## 2026-10-21 — Rebrand: KaamKit → KaamSolv

**Decided by:** product owner.

- The product name is now **KaamSolv**. All user-facing copy, metadata,
  structured data, docs and the package name use it.
- **Domain:** `kaamsolv.com` (registered on Cloudflare). Code uses
  `https://kaamsolv.com` (apex) as the canonical base, same pattern as before:
  `www` should redirect to the apex. `NEXT_PUBLIC_SITE_URL` still overrides it.
- **Logo / colours:** a new logo and colour scheme are coming. Until they are
  supplied, the existing palette and the text wordmark stay — now
  "Kaam**Solv**" with the coral accent on the second half. The old
  `assets/KaamKit — Logo …` files are kept for reference only.
- **Source repo:** moved to a new GitHub account (see Hosting entry above).
- **Working folder:** renamed `KaamKit` → `KaamSolv`. The folder name has no
  effect on the build. It did break the git worktree links
  (`../KaamKit-*`), which were repaired with `git worktree repair`.

**Deliberately unchanged** (internal, not brand-visible, renaming would break
live configuration):

- `kk-` CSS class prefix (`kk-container`, …).
- `KK_` environment variable prefix (`KK_IP_HASH_SALT`, … on the
  `url-shortener` branch) — already set in hosting.

**Side effects to know about:**

- Theme preference key changed `kaamkit-theme` → `kaamsolv-theme`. A visitor's
  stored light/dark choice resets once. It is a new origin anyway.
- QR downloads are now named `kaamsolv-qr-code.{png,svg,jpg}`.
- Feature branches (`url-shortener`, `feature/image-converters`,
  `cf-workers-poc`) still say KaamKit. Expect small text conflicts when they
  next merge `main`; resolve in favour of KaamSolv.
