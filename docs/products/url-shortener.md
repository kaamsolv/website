# KaamKit URL Shortener — Product & Architecture

**Status:** In development on the `url-shortener` branch (not merged, not
`live`). Phase 1 (tool page + mock API) complete. **Phase 2a (Neon persistence +
real shorten API + redirect) implemented — pending review.** **Draft — updated
each phase.**

This is the single source of truth for the URL Shortener. Platform-wide
decisions live in [`../kaamkit-phase0-architecture.md`](../kaamkit-phase0-architecture.md);
hosting / domain / deploy in [`../infra/deployment.md`](../infra/deployment.md).
This document records what is specific to this product.

> **Infrastructure decisions locked for V1 (2026-09-11):**
> - `kaamkit.com` is live on **Vercel**; **Cloudflare is DNS-only** (not proxied).
> - The short-link redirect for V1 is a **Vercel Route Handler at the domain
>   root** (`app/[shortCode]/route.ts`), **not** a Cloudflare Worker. The Worker
>   is **deferred for later evaluation** (it needs the apex flipped to Cloudflare
>   Proxied — a deliberate later DNS change).
> - **Runtime note (Phase 2a):** this was specced as `runtime = 'edge'`. Next.js
>   16 **deprecates the Edge runtime** and instructs removing the `runtime`
>   export, so the redirect route runs on the **default Node runtime** (Vercel
>   Fluid compute). Neon is still reached over HTTP (`@neondatabase/serverless`),
>   so the lookup is a single fast round trip. The route stays isolated by its
>   own segment + the shared reserved-word guard — the architecture is unchanged.
> - Database: **Neon Postgres** (production/preview via `DATABASE_URL`), **PGlite**
>   (local dev + tests; selected automatically when `DATABASE_URL` is unset).
> - The tool stays **unlisted and `status: planned`** until Phase 2b security
>   hardening is complete.

---

## 1. What it is

Turn a long URL into a short, shareable `kaamkit.com/{shortCode}` link.

- Public tool page: **`/url-shortener`**
- Short link: **`kaamkit.com/{shortCode}`** (e.g. `kaamkit.com/x7Kp2`)
- Core promise: **paste → shorten → copy → done**, no account required.
- First KaamKit tool with a backend (Work category). Not yet listed publicly.

The tool page and the redirect path are **separate concerns**: the tool page is
a normal static Next.js route; the redirect is a dedicated Route Handler at the
domain root (`app/[shortCode]/route.ts`) with no dependency on the marketing
app's render tree (see §6). Moving the redirect to a Cloudflare Worker later does
not change this contract.

---

## 2. Routes

| Route | Type | Where it runs | Phase |
|---|---|---|---|
| `/url-shortener` | static page + client island | Vercel | 1 |
| `POST /api/shorten` | route handler (JSON) | Vercel (Node) | 1 (mock) → **2a (real, done)** |
| `/{shortCode}` | 302 redirect | **Vercel Route Handler** (`app/[shortCode]/route.ts`, Node runtime — see runtime note above) | **2a (done)** |
| `/link-unavailable` | dynamic page (`?reason=disabled\|expired`) | Vercel | **2a (done)** |
| `/report-link`, `POST /api/report` | abuse report | Vercel | 2a (deferred within 2a — see §11) |

Next.js static routes take precedence over the dynamic `[shortCode]` segment, so
a real page (`/url-shortener`, `/about`, …) is never shadowed by a short code.

**Reserved routes.** `app/lib/reserved-routes.ts` lists every top-level app path
segment plus framework/asset paths and impersonation-risk words. Generated codes
are checked against it (and regenerated on a hit); it is the second guard for the
redirect handler and is written framework-free so a future Cloudflare Worker can
reuse it. **Rule: add every new top-level route here.**

---

## 3. UX — states (Phase 1, built and QA'd)

| State | Behaviour |
|---|---|
| Empty | Labelled `type="url"` input, "Shorten URL" button disabled until there's input. |
| Submitting | Button → spinner + "Shortening…", input disabled, `aria-busy` on the form. |
| Success | Teal result card: "Your short link is ready. Bas." · read-only input with the full `https://kaamkit.com/…` URL (click/focus selects all) · **Copy** button (Clipboard API + hidden-textarea fallback) · **Shorten another** (resets, refocuses input) · note: "Saved links and click stats are coming soon." Focus moves to the result heading. |
| Invalid | Input border turns danger, inline `role="alert"` message from `messageForReason()`, focus returns to input. |
| Rate limited | Calm yellow banner, `role="alert"`: "You've made quite a few requests. Try again in a little while." |
| Error / network | Danger banner, `role="alert"`: "We couldn't shorten that link. Please try again." |
| Disabled / expired link (on visiting a short link) | `/link-unavailable`: "This link is no longer available." + report link. *(Phase 2a)* |

Supporting content on the page: breadcrumb (Home → Work → Shorten a URL),
"Three steps", 5-item FAQ (native `<details>`), one house `AdSlot` (outside the
tool flow), related Work tools.

QR code and "Open link" actions are intentionally **not** in Phase 1 — added
later, behind progressive disclosure, without competing with Copy.

---

## 4. URL validation (`app/lib/url-validation.ts`)

Framework-free (no `next/*`, no DOM). Stays in `app/lib/` for V1; extract to a
shared `packages/link-core` only if/when a Cloudflare Worker needs to import it.

- Scheme allow-list: `http:` / `https:` only.
- Adds `https://` **only** to a scheme-less bare domain (`example.com/path`) —
  never to ambiguous or scheme-bearing input, so `javascript:…` cannot be
  smuggled through.
- Rejects: embedded credentials (`user:pass@`), hostname without a dot,
  `localhost` / loopback / RFC-1918 / link-local / `.local` / cloud-metadata IP,
  control chars or whitespace, length > 2048, and shortening one of our own
  short links (loop).
- Light normalisation: lowercase host, drop default ports. Path/query/hash kept
  as given.
- **Known limitation:** validation is not reputation screening. Real
  malware/phishing screening (Google Safe Browsing or equivalent) is evaluated
  and wired in Phase 2a — see §7.

---

## 5. Short-code strategy (`app/lib/short-code.ts`)

- **Alphabet:** Base62 (`0-9A-Za-z`). Links are pasted, not typed, so ambiguous
  glyphs are not excluded.
- **Generation:** Web Crypto CSPRNG with rejection sampling (unbiased — a raw
  `byte % 62` would skew toward the first 8 symbols). Random ⇒ sequential IDs are
  never exposed, trivial enumeration is impractical.
- **Length:** default 7 (`62^7 ≈ 3.5e12`). **Not an architectural constant** —
  the generator clamps to `[4, 32]` and the caller can grow it.
- **Uniqueness / collisions:** enforced by a `UNIQUE` index on
  `links.short_code` (`links_short_code_key`). `createShortLink()` in
  [`db/links.ts`](../../db/links.ts) inserts, and on a Postgres unique-violation
  (`23505`) regenerates and retries, widening the code length by one every few
  attempts. The database is the only arbiter of uniqueness — the app never does a
  pre-check "is it taken?". Reserved words are filtered *before* the insert so a
  code the redirect route would refuse is never persisted. Birthday-collision
  probability at length 7 stays below ~1e-6 past a million links; the retry loop
  makes the system self-healing regardless. Covered by `test/db-links.test.mts`.

---

## 6. Redirect architecture

### V1 — Vercel Route Handler, Node runtime (built in Phase 2a)

```
kaamkit.com  →  Cloudflare DNS (grey cloud, resolve only)  →  Vercel
                app/[shortCode]/route.ts   (Node runtime, dynamic = 'force-dynamic')
                  1. shape / reserved-word guard   → not a code → notFound() (404, non-informative)
                  2. resolveShortLink(db, code):  Neon SELECT id,destination,status,expires_at
                     WHERE short_code = $1
                  3. active & not expired  → 302 Location: destination
                                             + X-Robots-Tag: noindex
                                             + Cache-Control: no-store
                     disabled  → 302 /link-unavailable?reason=disabled
                     expired   → 302 /link-unavailable?reason=expired
                     missing   → notFound() (404)
                  4. after(() => recordClick(db, id))   → click_count++, last_clicked_at = now()
                                                          best-effort, off the response path
```

- **Runtime:** Node, not Edge. The Edge runtime is deprecated in Next.js 16
  (`node_modules/next/dist/docs/.../route-segment-config/runtime.md` — "Remove
  the `runtime` export"). `@neondatabase/serverless` is HTTP-based, so the lookup
  is still one fast round trip on Vercel Fluid. If/when the Cloudflare Worker
  lands, the redirect moves off Vercel entirely — the Node-vs-Edge distinction on
  Vercel stops mattering.
- **302** (not 301) — keeps KaamKit in control (disable, edit destination, count).
- `Cache-Control: no-store`: a disabled link stops resolving immediately.
  (A short `s-maxage` is a later optimisation and pairs with a purge mechanism.)
- `X-Robots-Tag: noindex` on every redirect so short URLs don't get indexed.
- **Unknown code → 404**, not `/link-unavailable` (§7: non-informative — don't
  confirm or deny that a code was ever issued). `/link-unavailable` is only for a
  link that exists but is disabled or expired.
- The click count is written via `after()` so a slow or failing DB write **never**
  delays or breaks the redirect; `recordClick()` also swallows its own errors and
  no-ops for a link that is no longer active.

### Deferred — Cloudflare Worker (later evaluation)

The long-term home for this path is a **Cloudflare Worker** on a Cloudflare-
**proxied** `kaamkit.com` — for an edge cache (Cloudflare Cache API / Workers
KV), true isolation from the Vercel app, and Cloudflare WAF / Bot Fight / rate-
limiting on the redirect. It is **not** part of V1 because:

1. `kaamkit.com` is DNS-only today; a Worker route only runs on proxied traffic.
2. Flipping the apex to Proxied is a deliberate production DNS change on a live
   domain (needs SSL "Full (strict)", subdomain testing, a rollback plan).

When it lands: the Worker imports the same resolver logic (extracted to
`packages/link-core`), reads Neon through a scoped `kk_edge` role
(`SELECT` + `click_count` `UPDATE` only), and `app/[shortCode]/route.ts` is
removed from production (kept for local / preview).

---

## 7. Security (V1)

Ships with: URL validation (§4), IP rate limiting on `POST /api/shorten`, CSPRNG
codes with a reserved-word blocklist, `links.status = 'disabled'` takedown path
(ops action — `UPDATE links SET status='disabled'`, no admin UI in V1), safe
redirect handling (302, `noindex`, `no-store`, non-informative 404 for unknown
codes), and a hashed creator IP on each link (`created_ip_hash` —
`SHA-256(ip + KK_IP_HASH_SALT)`, null when no salt is set; the raw IP is never
stored).

**Rate limiter — current state (Phase 2a).** Still the Phase 1 **in-memory
fixed-window** limiter (12/min/IP) in `app/api/shorten/route.ts`. It resets on
redeploy and is not shared across instances. Moving it to a shared/DB-backed
store (the `rate_limits` table in §10) is **deferred within Phase 2a** — it was
not required to land persistence and is better done alongside the Phase 2b
network-layer work. The boundary (one `rateLimit(ip)` call) is unchanged and
swappable.

**Deferred within Phase 2a** (documented here so scope is explicit; none were
required to make shortening real, and the tool stays unlisted until 2b anyway):
DB-backed rate limiting, the `link_reports` table + `/report-link` /
`POST /api/report` flow, the signed `kk_sid` anonymous-session cookie, and
`screenUrl()` / Safe Browsing reputation screening. `structured logging` beyond
the stored IP hash is also still to come.

**Not available for V1 (needs a Cloudflare-proxied apex — deferred):** Cloudflare
WAF managed rules, Bot Fight Mode, L7 DDoS mitigation, and CF rate-limiting rules
on `/api/shorten` and short-path enumeration. Until then, protection is
app-level: validation, the DB rate limiter, the reserved-word keyspace, the
disable path, and reporting.

**Reputation screening** (`screenUrl()` interface, planned `app/lib/url-reputation.ts`):
not built yet. Google Safe Browsing or equivalent is evaluated and wired in
Phase 2a/2b — see "Deferred within Phase 2a" above.

**Because the network-layer controls are deferred, the tool stays unlisted and
`status: planned` until Phase 2b.** KaamKit does not point real users at an
anonymous redirect service before the fuller security posture is in place.

---

## 8. Accounts & entitlements — boundary

**No authentication or user system is built here.** KaamKit will have one shared
account system across all tools.

- `links.account_id` (nullable `uuid`, no FK yet) — real column as of Phase 2a,
  **never written in V1**. Reserved for the future shared account.
- `links.anon_session_id` (nullable `text`) — real column as of Phase 2a,
  **never written in V1**. Will hold the value of a signed, httpOnly `kk_sid`
  cookie. **A convenience mechanism for browser-scoped recent-link history
  only — never proof of ownership or authorization.**
- Contract the future platform must provide: server-side
  `getCurrentAccount(request)`. A later claim flow migrates `anon_session_id`
  links to `account_id`.

Monetisation (free vs. paid limits) is a later phase behind a clean entitlement
boundary. **No billing without explicit approval.**

---

## 9. Analytics — boundary

V1: best-effort, non-blocking `links.click_count` increment from the redirect
path via Next's `after()` (Vercel); `ctx.waitUntil()` if/when the redirect moves
to a Cloudflare Worker. No PII, no cookies on the redirect path, no third-party
scripts. Analytics failure never blocks a redirect.

Deferred: `click_events` table (timestamp, referrer host, coarse country, device
class) and the shared KaamKit analytics engine that URL + QR both feed.

---

## 10. Data model

### Built in Phase 2a — [`db/schema.ts`](../../db/schema.ts), migration `0000_powerful_masque.sql`

**`links`** — the only table. Drizzle ORM, dialect `postgresql`.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` default |
| `short_code` | `text` | **unique** (`links_short_code_key`) — the redirect lookup key |
| `destination` | `text` | normalised output of `validateDestinationUrl()` |
| `status` | `link_status` enum (`active` \| `disabled`) | default `active`; `expired` is derived from `expires_at`, not stored |
| `is_custom` | `boolean` | default `false` — always false in V1 (user slugs are Phase 3) |
| `account_id` | `uuid` null | **reserved**, unwritten in 2a. No FK yet (no `accounts` table). Indexed. |
| `anon_session_id` | `text` null | **reserved** for the future signed `kk_sid` cookie (§8). Unwritten in 2a. Indexed. |
| `click_count` | `bigint` (number mode) | default `0`; bumped by `recordClick()` via `after()` |
| `last_clicked_at` | `timestamptz` null | set alongside `click_count` |
| `expires_at` | `timestamptz` null | past → `/link-unavailable?reason=expired`. No UI to set it in 2a. |
| `created_ip_hash` | `text` null | `SHA-256(ip + KK_IP_HASH_SALT)`; null when no salt. Never the raw IP. |
| `created_at` / `updated_at` | `timestamptz` | `now()` defaults |

Migrations: `npm run db:generate` (schema → SQL, no DB needed) →
`npm run db:migrate` ([`db/migrate.mts`](../../db/migrate.mts) — Neon when
`DATABASE_URL` is set, else local PGlite). Production migrations are a deliberate
manual step, never part of the Vercel build (see `../infra/deployment.md` §7).

### Deferred additive migrations

`rate_limits` (key, count, reset_at) and `link_reports` (short_code, link_id?,
reason?, reporter_ip_hash?, created_at) — see §7, deferred within Phase 2a.
Later: `campaign_id`, `click_events`, `accounts` / `entitlements` / `usage`.

---

## 11. Phase log

| Phase | Delivered |
|---|---|
| **1 — Tool page + UX** ✅ | `/url-shortener` static page (SEO, breadcrumb, JSON-LD `WebApplication` + `BreadcrumbList`, FAQ, related tools, house AdSlot); `ShortenForm` client island with every state; shared `CopyButton` + `Breadcrumb`; `app/lib/{url-validation,short-code,reserved-routes}.ts`; `POST /api/shorten` **mock** (real validation + code-gen, no persistence, in-memory rate limiter, `?simulate=` for QA); zero-dep `node --test` suite. Commit `3ce516f` on `url-shortener`. |
| **2a — Persistence + shorten API + redirect** ✅ *(implemented — pending review)* | **Delivered:** Drizzle schema ([`db/schema.ts`](../../db/schema.ts)) + migration `0000` + `drizzle.config.ts` + `db:generate` / `db:migrate` scripts; driver selection ([`db/client.ts`](../../db/client.ts): Neon-HTTP when `DATABASE_URL` set, else PGlite); data layer ([`db/links.ts`](../../db/links.ts): `createShortLink` w/ collision-retry, `resolveShortLink`, `recordClick`); real `POST /api/shorten` (persists, drops `mock`/`?simulate=`, stores hashed creator IP); `app/[shortCode]/route.ts` redirect (Node runtime — see runtime note; `after()` click count; 404 for unknown/reserved, `/link-unavailable` for disabled/expired); `/link-unavailable` page; `.env.example`; PGlite test suite (`test/db-links.test.mts`, `test/helpers/test-db.mts`). **Deferred within 2a** (see §7): DB-backed rate limiting + `rate_limits`, `link_reports` + `/report-link`, `kk_sid` cookie, `screenUrl()`/Safe Browsing, `robots.ts` / `sitemap.ts`. |
| **2b — Security hardening + go-live** | Cloudflare-native protection where possible without proxying; wire remaining screening; load-check the redirect; **flip catalogue `status` → `live` + surface on the production homepage** (existing design, no redesign). Optionally begin the Cloudflare Worker evaluation. *pending* |
| 3 — Account integration | *pending (shared platform)* |
| 4 — Analytics | *pending* |
| 5 — Monetisation | *pending* |

### After Phase 2a — what is real, what is still not

**Real now:** `POST /api/shorten` persists to Postgres (Neon in prod/preview,
PGlite locally); `kaamkit.com/{code}` redirects from the database; disabled and
expired links resolve to `/link-unavailable`; clicks are counted best-effort.
`?simulate=` (API) and `?sim=` (page) are removed, as is the `mock` response flag.

**Still not real / not built:**

- The rate limiter is still in-memory (resets on redeploy, not shared across
  instances) — see §7.
- No account/history, no `kk_sid` cookie, no analytics beyond `click_count`.
- No reputation screening, no `/report-link` flow.
- Catalogue `status` stays `planned` and the homepage does not feature the tool.
  The flip + homepage surfacing happens at the **end of Phase 2b** (after
  security hardening) — the domain is live and public, so the tool is not exposed
  to real users until the fuller posture is in place.
- The `url-shortener` branch is **not merged to `main`**. It should be pushed to
  `origin` so Vercel builds a **Preview Deployment** for review — after
  `DATABASE_URL` is confirmed on the Preview environment and the migration is
  applied to the Neon dev branch (`npm run db:migrate`).
