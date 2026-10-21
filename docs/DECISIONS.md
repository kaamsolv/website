# KaamSolv — Decision Log

Short, dated record of decisions that change the product, brand or
infrastructure. Newest first. Detail lives in the linked docs.

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
