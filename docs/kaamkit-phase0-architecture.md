# KaamKit — Phase 0: Product & Technical Architecture Document

**Status:** Draft for approval · **Phase:** 0 of 10 · **Scope:** Architecture only — no UI, no code, no products built yet.

---

## 0. A conflict that needs resolving before Phase 1

The brief for this build arrived with two layers of instruction that don't fully agree, and Phase 0's job is to surface that rather than quietly pick one.

**Layer A — the master brief (this document is built from it):** a real SaaS platform. URL shortener with server-side redirects, QR campaign tracking, accounts, billing, entitlements, file processing with server-side validation and deletion, shared analytics engine, GSTIN/VPA validation for future payment blocks.

**Layer B — the "locked execution protocols" at the top of the request:** dark-mode Tailwind-via-CDN pages, **vanilla client-side-only JavaScript with no backend endpoints**, `localStorage` as the data layer, and India-specific tax/payment validation blocks.

Layer B is a reasonable spec *for a static tools demo*. It is not compatible with Layer A's actual products:

- A short link (`kaamkit.com/x7Kp2`) has to resolve **on the server** when a stranger clicks it — there is no browser session to read `localStorage` from at that point. Client-only JS cannot implement a redirect service.
- QR campaign analytics (scans by device/location/time) happen on devices that never touch your browser. They must be recorded server-side.
- Accounts, billing, and entitlements require server-side authentication and a real database — `localStorage` is per-browser, per-device, and trivially editable by the end user, so it cannot hold anything the business depends on (usage limits, plan status, saved links).
- GSTIN/VPA/currency validation is explicitly a **Phase 6/9** concern in the roadmap (calculators and billing come after URL Shortener → QR → Image Tools), not a Phase 0–3 one.

**Recommendation:** Treat protocols #1, #3, #4, #5 (Tailwind dark-mode styling, JSON-LD schema, mobile QA, query-param-driven SEO metadata) as valid *frontend presentation-layer standards* — they're genuinely good practice and I'll apply them from Phase 1 onward. Treat #2 ("no backend, ever") as **overridden by the product requirements** — KaamKit needs a thin backend for redirects, tracking, auth, and billing, even if most tool *logic* (image conversion math, QR rendering, calculator formulas) runs client-side for speed. Treat #6 (GSTIN/VPA/INR-USD) as a **noted future requirement**, scheduled into Phase 6 (GST Calculator) and Phase 9 (Billing), not built now.

This is listed again as **Decision #1** at the end of this document. Nothing below assumes it's settled — I've designed around the real product need and I'm asking you to confirm.

---

## 1. Product Architecture

```
                        KAAMKIT
                           │
              ┌────────────┴────────────┐
              │                         │
        PUBLIC UTILITY              USER PLATFORM
        (no login needed)           (kaamkit.com/app)
              │                         │
        Tools, Categories          Dashboard, Links,
        SEO pages, Guides         QR Codes, Campaigns,
        Templates                 Files, Analytics,
              │                   Billing, Settings
              └────────────┬────────────┘
                            │
                 SHARED INFRASTRUCTURE
      Auth · Entitlements · Analytics Engine ·
      File Processing · Redirect Service · SEO Layer
```

**Initial products, in build order (per roadmap):**

| # | Product | Why it's first |
|---|---|---|
| 1 | URL Shortener | Cheapest to build, immediately useful standalone, and is the seed of the shared redirect + analytics engine everything else reuses. |
| 2 | QR Code Generator + Campaigns + Analytics | Consumes the same analytics engine; QR "campaign" is functionally a tracked short link wrapped in an image. |
| 3 | Image Tools (10 converters + compressor/resizer/to-PDF) | Consumes a shared file-processing pipeline instead of 10 bespoke converters. |

**Product dependency map:**

```
KAAMKIT FOUNDATION
│
├── Design System
├── Authentication
├── User System
├── Billing
├── Entitlements
├── Analytics Engine
├── File Processing
└── SEO Infrastructure
        │
        ├── URL Shortener ──────────────┐
        │                               │
        ├── QR Generator ── Campaigns ──┼── Analytics Engine
        │                               │
        ├── Image Tools ── File Processing
        │
        ├── Calculators        (Phase 6, standalone — no shared deps)
        ├── Generators         (Phase 7 — light entitlement use)
        └── Templates          (Phase 7)
```

Calculators and Generators are intentionally the *least* coupled products — they're mostly pure client-side logic (math, PDF templating) and don't need the redirect/analytics/file stack. That's part of why the roadmap defers them: build the hard shared infrastructure first, while the payoff (products 1–3) still justifies it.

**Update (Phase 1 approval) — locked category structure and incremental deployment model.**

The 10 top-level categories are now locked and final: `Money · Work · Business · Documents · Images & Files · Writing · Career · Everyday · India · Creators`. A 60-tool master catalogue mapped to these categories now exists at `/docs/products/kaamkit-tool-catalogue.md` — it is a *product universe*, not a build list. The dependency map above still governs *shared infrastructure*; the catalogue governs *which tool gets attached to that infrastructure next*.

Deployment is now explicitly incremental, not phase-batch: `build locally → test → document → approve → deploy → add tool to its live category → build next tool`. A category with zero live tools shows a plain "0 live" count, never a wall of "coming soon" cards — the category page itself must adapt its layout by tool count (1 tool = single strong feature, 2–4 = grid, 5+ = featured + all), not assume a fixed density.

Current build priority, reflected in the catalogue: **1** URL Shortener (Work) → **2** QR Code Generator (Business) → **3–7** the five Images & Files converters, in order. Everything else in the 60-tool catalogue is backlog until re-prioritized.

---

## 2. Information Architecture & Sitemap

The brief's proposed IA (Section 6) is close to right. Two refinements, with reasoning:

**a) Flatten image tools under one converter pattern, don't hand-nest every pair.**
`/image-tools/jpg-to-png` etc. is good for long-tail SEO (each conversion pair is its own search query — "jpg to png converter" and "png to jpg converter" are different searches with different intent, so they should stay separate indexable pages). But route them through **one templated page type** with a `from`/`to` config, not 10 hand-built pages — this is what makes "add another converter" cheap later, per the brief's own Section 44 plug-in model.

**b) Give the redirect path its own top-level namespace, not a subpath of the marketing site.**
Short links must resolve fast and shouldn't share a route tree with SSR marketing pages (different caching rules, different scaling profile — a viral link can spike traffic in a way that shouldn't touch homepage infra). Recommend short links resolve at the bare domain root (`kaamkit.com/x7Kp2`) but are served by a **distinct routing rule** at the edge (CDN/edge function) that checks "is this a known short-code?" before falling through to the marketing app. This preserves the clean, brandable short URL the brief wants while keeping it architecturally isolated.

```
/                              → homepage (search-first)
/tools                         → full tools directory
/categories/:slug              → category page
/:shortcode                    → redirect (edge-routed, isolated from marketing SSR)
/url-shortener                 → product 1 landing + tool
/qr-code-generator             → product 2 landing + tool
/image-tools                   → hub
/image-tools/:from-to-:to      → templated converter page (jpg-to-png, png-to-jpg, ...)
/image-tools/compress          → image-compressor
/image-tools/resize            → image-resizer
/image-tools/to-pdf             → image-to-pdf
/calculators/:slug             → Phase 6
/generators/:slug              → Phase 7
/templates/:slug               → Phase 7
/blog/:slug
/pricing
/about
/suggest-a-tool
/login  /signup
/app                            → requires auth
/app/dashboard
/app/links
/app/qr-codes
/app/campaigns
/app/files
/app/analytics
/app/billing
/app/settings
/app/account
```

This matches the brief's structure with the two changes above. No further deviation recommended — the rest is sound.

---

## 3. Data Model

Only the entities actually needed for Products 1–3 plus the platform foundation. Deferred: `ApiKey` (no external API yet), `SavedItem` as a generic table (folded into per-product tables below instead, since a "saved link" and a "saved QR" have different shapes).

| Entity | Key fields | Notes |
|---|---|---|
| **User** | id, email, auth_provider, created_at | Anonymous usage doesn't create a User row — see §7. |
| **Account** | id, user_id, plan_id | Separates "who's logged in" from "what they're entitled to"; supports future team accounts without a rewrite. |
| **Plan** | id, name, price, billing_interval | Free / Pro / (future team tiers). |
| **Entitlement** | id, plan_id, feature_key, limit_value | Configurable, not hard-coded — e.g. `feature_key: "links.analytics.window_days", limit_value: 7` for free vs `365` for paid. |
| **Usage** | id, account_id, feature_key, period, count | Rolling counters checked against Entitlement at request time. |
| **Link** | id, short_code, destination_url, account_id (nullable), campaign_id (nullable), expires_at, created_at | `account_id` nullable = anonymous shortening is allowed, per §20. |
| **QrCode** | id, type (url/text/wifi/vcard/...), payload (jsonb), style (jsonb), link_id (nullable), account_id (nullable) | `link_id` links a QR to a trackable short URL when the QR encodes a URL; other QR types (Wi-Fi, vCard) have no Link. |
| **Campaign** | id, name, account_id, created_at | A Campaign groups one or more Links/QrCodes for aggregate reporting. |
| **AnalyticsEvent** | id, event_type, subject_type (link/qr/campaign), subject_id, occurred_at, geo, device, browser, os, referrer, metadata (jsonb) | Single append-only table, shared by every trackable product — see §6. |
| **File** | id, account_id (nullable), original_name, mime_type, size_bytes, storage_key, status, created_at, expires_at | `expires_at` drives automatic deletion. |
| **ConversionJob** | id, file_id, operation (jpg_to_png/compress/resize/...), status, output_file_id, error, created_at | Decouples "a file exists" from "a job is transforming it" — needed once batch/queue processing exists. |
| **Tool** | id, slug, url, primary_category_id, secondary_category_ids[], tool_type, name, description, status (planned/in_development/live), build_priority, seo_title, seo_description, related_tool_ids[], acquisition_role, monetisation_role | Drives `/tools` and `/categories` pages programmatically. `tool_type` determines URL pattern (`/calculators/`, `/generators/`, `/image-tools/`, `/documents/`, `/writing/`); `primary_category_id` determines where it's browsed from. A tool has exactly one record even when discoverable from a secondary category. Full current catalogue: `/docs/products/kaamkit-tool-catalogue.md`. |
| **Category** | id, slug, name | The 10 locked names (Money / Work / Business / Documents / Images & Files / Writing / Career / Everyday / India / Creators) — final, not to be renamed or extended without a separate decision. |

```
Account 1─n Link, QrCode, Campaign, File, Usage
Campaign 1─n Link, QrCode
Link / QrCode / Campaign 1─n AnalyticsEvent  (polymorphic via subject_type/subject_id)
File 1─n ConversionJob
Tool n─1 Category
```

---

## 4. Service & API Architecture

Organized by **capability**, per the brief's instruction, not by page:

| Service | Responsibilities |
|---|---|
| `auth` | Session/JWT issuance, login/signup, anonymous → registered account upgrade |
| `users` | Profile, account, plan lookups |
| `links` | Create/list/update short links, slug availability, expiry |
| `redirects` | The hot path: short-code → destination lookup + emit AnalyticsEvent. Isolated for latency/scale (§2b). |
| `qr` | Generate QR payloads/styles, persist QrCode records |
| `campaigns` | Group links/QR codes, aggregate reporting queries |
| `analytics` | Ingest AnalyticsEvent (from redirects, QR scans, future products), serve aggregated reads |
| `files` | Upload, validate, request presigned storage URLs, enforce size/type limits |
| `conversions` | Enqueue and process ConversionJob, report status |
| `billing` | Plan changes, payment provider webhooks, invoice state |
| `entitlements` | Single source of truth for "can this account do X right now" — checked by every other service before a paid feature executes |
| `seo` | Serves Tool/Category metadata, sitemap generation, structured data |

**Contract rule:** the frontend calls these services and renders results; it never decides "is this user over their free limit" itself. `entitlements` is the only place that answer lives, so a future team-plan or pricing change doesn't require touching every product's frontend code.

---

## 5. Technology Stack Recommendation

| Layer | Recommendation | Reasoning |
|---|---|---|
| Frontend framework | Next.js (React) | SSR/SSG is required for tool-page SEO (brief §28) — pure client-rendered SPA would hurt indexability. One framework serves both public SEO pages and the authenticated `/app` dashboard. |
| Styling | Tailwind CSS (build-time, not CDN) | CDN Tailwind is fine for a single throwaway HTML file; a real multi-page app needs the compiled/purged build for performance and design-token consistency. This is the one place I'd amend protocol #1's literal wording once we're past static prototypes. |
| Backend | Node.js API layer (can live inside the Next.js app as API routes initially; split out once redirect traffic or file processing needs independent scaling) | Same language as frontend = one team, one deploy pipeline, easy to defer the "microservices" decision per brief §38 ("if a decision can be deferred, defer it"). |
| Database | PostgreSQL | Relational integrity matters here — entitlements, usage counters, and campaign→link→analytics relationships are genuinely relational, not document-shaped. |
| Analytics event storage | Postgres table to start; revisit a column-store (ClickHouse) only if/when event volume makes aggregate queries slow | Avoids introducing a second database before it's needed (§38, §39 — don't overbuild). |
| Cache / rate limiting / queues | Redis | Backs redirect-lookup caching, rate limiting (link abuse, upload abuse), and a simple job queue for image conversion. |
| Object storage | S3-compatible bucket with short-lived signed URLs | Required for file processing retention/deletion policy (§19); never store uploads in the app server's filesystem. |
| Background jobs | Lightweight queue worker (BullMQ on Redis, or serverless functions) for image conversion | Keeps conversion off the request/response path so large batches don't block the API. |
| CDN / edge | Cloudflare (or equivalent) in front of everything, redirect route resolved at the edge where possible | Matches §2b's isolation goal and §35's performance requirement. |
| Auth | Session-based auth with anonymous-session support (a signed anonymous cookie tracks not-yet-registered link ownership until signup) | Implements §20's "use first, sign up later" flow concretely. |

Nothing here is exotic; the goal is boring, maintainable, and cheap to run, matching §38's evaluation criteria.

---

## 6. Shared Analytics Engine

One event pipeline for every trackable product, as mandated in §16:

```
AnalyticsEvent
├── subject_type   ("link" | "qr" | "campaign")
├── subject_id
├── event_type     ("redirect_click" | "qr_scan" | ...)
├── occurred_at
├── geo, device, browser, os, referrer
└── metadata (jsonb, product-specific extras)
```

`links`, `qr`, and (later) any new trackable product write to this one table via the `analytics` service; they never own their own tracking logic. Aggregation queries (scans over time, top geography, device split) are written once against `subject_type`/`subject_id` and reused by both the Link detail view and the Campaign rollup view.

---

## 7. Entitlement System

Deliberately data-driven rather than hard-coded, per §12/§22:

```
Entitlement(plan_id, feature_key, limit_value)
Usage(account_id, feature_key, period, count)
```

A feature check is always: *look up the plan's limit for `feature_key`, compare against current-period `Usage`, allow/deny.* Raising a free-tier limit, adding a new paid feature, or introducing a team plan later becomes a data change, not a code change — directly enabling §12's "do not hard-code arbitrary limits."

Anonymous users get a session-scoped `Usage` row (keyed to the anonymous cookie, not an Account) so free limits still apply before signup.

---

## 8. File Processing Architecture

```
Upload → Validate (MIME + size + magic-byte check) → Store (object storage, signed URL)
       → Queue → Process (worker) → Output stored → Download link issued
       → Automatic deletion after retention window (default: short, configurable)
```

Applies to Image Tools now; designed so PDFs/documents can plug into the same `File` + `ConversionJob` model later without new tables (§19's explicit requirement). Validation happens server-side even though the actual pixel transformation can run client-side (Canvas API) for common formats to save infrastructure cost — client-side conversion is a legitimate optimization *within* this architecture, not a reason to skip server-side validation and retention rules.

---

## 9. SEO Architecture

Every `Tool` row drives its page's metadata rather than metadata being hand-written per file:

- Title, meta description, H1, canonical URL, and FAQ content are fields on `Tool`/`Category`, rendered through one page template (§27's shared framework).
- Structured data (`WebApplication`/`SoftwareApplication` JSON-LD, matching protocol #3) is generated from the same `Tool` record — one code path, guaranteed accuracy, no hand-maintained duplicate data.
- Sitemap is generated from the `Tool`/`Category` tables at build/deploy time, not maintained by hand.
- Long-tail keyword-intent query params (protocol #5) can adjust *displayed* copy client-side, but the canonical `<title>`/meta tags Google actually indexes should be server-rendered per the primary slug — client-side-only title swapping via `URLSearchParams` is invisible to crawlers and would undercut the SEO goal it's meant to serve. Worth deciding explicitly (see Decision #4).

---

## 10. Design System Plan (not built yet — Phase 1)

Two competing palettes currently exist and need reconciling before Phase 1 starts (see Decision #2):

- **Established KaamKit brand** (brief §24): Deep Navy `#0C2248`, Coral `#FE6336`, Yellow `#FDBD43`, Teal `#38BBAC`, Purple `#6934D0`. Wordmark: "Kaam" navy / "Kit" coral, byline "work smart." No octopus.
- **Protocol #1's palette**: deep slate `#050B14`, charcoal `#111C30`, electric cyan-to-blue gradient `#06B6D4 → #3B82F6`, strict dark mode.

These aren't reconcilable as-is — one is a warm, multi-hue, brand-driven system; the other is a cyan dark-mode SaaS-dashboard system. Phase 1 will build tokens (color, type, spacing, radii, shadows), core components, and tool-specific components (upload zone, result cards, QR preview, etc.) per brief §25 — but only once this is settled.

---

## 11. Security Plan

| Area | Approach |
|---|---|
| URL Shortener | Destination URL validated against a blocklist/reputation check before shortening; rate limiting per IP/account; report-abuse mechanism; no open redirect to internal paths. |
| QR | Same destination validation as links (a QR encoding a URL is a link); no execution of arbitrary payloads in Wi-Fi/vCard types beyond spec-valid fields. |
| Files | Strict MIME + magic-byte validation (not just file extension), size caps, processing in an isolated worker (never the main request thread), automatic deletion, no serving of user files from a path that could be mistaken for site-owned content. |
| Accounts | Standard hashed-credential or OAuth auth, session expiry, rate-limited login attempts. |
| Billing | Payment fields never touch application code directly — handled via a PCI-compliant provider's hosted fields/tokenization; GSTIN/VPA format validation (protocol #6) is a client-side UX nicety only, never a substitute for server-side verification, and is scoped to Phase 9. |

---

## 12. Deployment & Environments

- **Environments:** local → staging → production, with the redirect/analytics path exercised in staging before every release (it's the highest-traffic, least-forgiving code path).
- **CI/CD:** run type-checks, lint, and a smoke test against the redirect service on every deploy.
- **Monitoring:** uptime + latency on the redirect path specifically (it's the one piece of infrastructure where downtime is publicly visible as broken shared links), plus error tracking across services.
- **Backups:** daily Postgres backups; object storage lifecycle rules handle file expiry automatically rather than relying on manual cleanup.

---

## 13. Documentation Map

```
/docs
├── product/
├── architecture/         ← this document lives here, updated after each phase
├── design-system/
├── ux/
├── database/
├── api/
├── analytics/
├── security/
├── seo/
├── billing/
└── products/
    ├── url-shortener/
    ├── qr/
    ├── campaigns/
    ├── image-tools/
    ├── calculators/
    ├── generators/
    └── templates/
```

---

## 14. Development Roadmap (recap, unchanged from brief)

Phase 0 (this doc) → Phase 1 Design System → Phase 2 Website Shell → Phase 3 URL Shortener → Phase 4 QR Platform → Phase 5 Image Tools → Phase 6 Calculators → Phase 7 Generators/Templates → Phase 8 SEO/Content Engine → Phase 9 Monetisation → Phase 10 Scale. Each phase ends with a Phase Complete report and a hard stop for approval, per §41.

---

## 15. Risks

1. **Redirect latency at scale** — if short-link traffic spikes (a viral QR/link), the redirect path must stay fast; mitigated by edge caching, but worth load-testing before Phase 3 ships.
2. **File processing cost creep** — image conversion at scale is a real infra cost; client-side Canvas-based conversion for common formats keeps this cheap, but HEIC decoding typically needs a server-side library, so it won't be 100% client-only.
3. **Scope creep into "SaaS dashboard" territory** — §39 explicitly warns against this; the `/app` shell must stay minimal even as more products land in it.
4. **SEO cannibalization** — 10 near-identical converter pages generated from one template risk being seen as thin/duplicate content if the shared framework doesn't give each page genuinely distinct, useful copy.

---

## 16. Decisions Requiring Approval

1. **Backend vs. "client-only" constraint (§0 above).** Confirm the platform includes a real backend (redirects, auth, billing, analytics ingestion) while individual tool *computations* stay client-side where practical. This is blocking — Phase 3 (URL Shortener) cannot be built as a pure static/localStorage page.
2. **Design palette: brand navy/coral/teal/purple system vs. protocol #1's slate/cyan dark-mode system.** Which governs Phase 1?
3. **Short-link routing:** confirm bare-root short codes (`kaamkit.com/x7Kp2`) resolved via edge routing, isolated from the marketing SSR app, as described in §2.
4. **SEO metadata source of truth:** server-rendered per canonical `Tool` slug (recommended) vs. client-side `URLSearchParams`-driven title/description swapping (protocol #5) — these can coexist for supplementary on-page copy, but the crawlable `<title>`/meta tags should not depend on client-side JS alone.
5. **GSTIN/VPA/INR-USD localization (protocol #6):** confirmed deferred to Phase 6 (GST Calculator) and Phase 9 (Billing) rather than built now — please confirm this scheduling is acceptable.
6. **Technology stack (§5):** approve Next.js + Node + Postgres + Redis + S3-compatible storage, or flag a preferred alternative before Phase 1 tooling is set up.

---

*End of Phase 0 document. No UI, code, or artifacts have been built. Awaiting approval before Phase 1.*
