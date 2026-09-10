# KaamKit URL Shortener — Product & Architecture

**Status:** In development on the `url-shortener` branch (not merged, not
`live`). Phase 1 (tool page + mock API) complete; persistence and the redirect
are Phase 2a. **Draft — updated each phase.**

This is the single source of truth for the URL Shortener. Platform-wide
decisions live in [`../kaamkit-phase0-architecture.md`](../kaamkit-phase0-architecture.md);
hosting / domain / deploy in [`../infra/deployment.md`](../infra/deployment.md).
This document records what is specific to this product.

> **Infrastructure decisions locked for V1 (2026-09-11):**
> - `kaamkit.com` is live on **Vercel**; **Cloudflare is DNS-only** (not proxied).
> - The short-link redirect for V1 is a **Vercel Edge Route Handler**, **not** a
>   Cloudflare Worker. The Worker is **deferred for later evaluation** (it needs
>   the apex flipped to Cloudflare Proxied — a deliberate later DNS change).
> - Database: **Neon Postgres** (production), **PGlite** (local/test).
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
a normal static Next.js route; the redirect is a dedicated Edge Route Handler at
the domain root with its own runtime and no dependency on the marketing app's
render tree (see §6). Moving the redirect to a Cloudflare Worker later does not
change this contract.

---

## 2. Routes

| Route | Type | Where it runs | Phase |
|---|---|---|---|
| `/url-shortener` | static page + client island | Vercel | 1 |
| `POST /api/shorten` | route handler (JSON) | Vercel (Node) | 1 (mock) → 2a (real) |
| `/{shortCode}` | 302 redirect | **Vercel Edge Route Handler** (`app/[shortCode]/route.ts`, `runtime = 'edge'`) | 2a |
| `/link-unavailable` | static page | Vercel | 2a |
| `/report-link`, `POST /api/report` | abuse report | Vercel | 2a |

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
- **Uniqueness / collisions:** enforced by a `UNIQUE` constraint on
  `links.short_code` (Phase 2a). `POST /api/shorten` regenerates and retries on
  conflict (≤ 5 attempts), then increases the length by one. The database is the
  only arbiter of uniqueness — the app never does a pre-check "is it taken?".
  Birthday-collision probability at length 7 stays below ~1e-6 past a million
  links, and the retry loop makes the system self-healing regardless.

---

## 6. Redirect architecture

### V1 — Vercel Edge (built in Phase 2a)

```
kaamkit.com  →  Cloudflare DNS (grey cloud, resolve only)  →  Vercel
                app/[shortCode]/route.ts   (runtime = 'edge')
                  1. shape / reserved-word guard   → not a code → 404 (let Next 404 render)
                  2. Neon SELECT destination,status,expires_at  WHERE short_code = $1
                  3. active & not expired  → 302 Location: destination
                                             + X-Robots-Tag: noindex
                                             + Cache-Control: no-cache
                     disabled / expired / missing → 302 /link-unavailable?reason=…
                  4. after(() => links.click_count++ , last_clicked_at = now())  ← best-effort
```

- **302** (not 301) — keeps KaamKit in control (disable, edit destination, count).
- `Cache-Control: no-cache` for V1: a disabled link stops resolving immediately.
  (A short `s-maxage` is a later optimisation and pairs with a purge mechanism.)
- `X-Robots-Tag: noindex` on every redirect so short URLs don't get indexed.
- Neon reads use `@neondatabase/serverless` (HTTP; edge-safe). Neon is sited in
  Vercel's function region; a small per-isolate cache absorbs repeat hits.
- The click count is written via `after()` so a slow or failing DB write **never**
  delays or breaks the redirect.

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

Ships with: URL validation (§4), IP rate limiting on `POST /api/shorten`
(DB-backed fixed window; boundary designed to move to an edge/distributed store —
Cloudflare-native evaluated first), CSPRNG codes with a reserved/word blocklist,
`links.status = disabled` takedown path (ops action, no admin UI in V1), a
minimal "Report this link" flow, safe redirect handling (302, `noindex`,
non-informative 404 for unknown codes), and structured logging (destination
**host only**, hashed IP, outcome).

**Not available for V1 (needs a Cloudflare-proxied apex — deferred):** Cloudflare
WAF managed rules, Bot Fight Mode, L7 DDoS mitigation, and CF rate-limiting rules
on `/api/shorten` and short-path enumeration. Until then, protection is
app-level: validation, the DB rate limiter, the reserved-word keyspace, the
disable path, and reporting.

**Reputation screening** (`app/lib/url-reputation.ts`, `screenUrl()` interface):
V1 stub; Google Safe Browsing or equivalent is evaluated and wired in Phase 2a.

**Because the network-layer controls are deferred, the tool stays unlisted and
`status: planned` until Phase 2b.** KaamKit does not point real users at an
anonymous redirect service before the fuller security posture is in place.

---

## 8. Accounts & entitlements — boundary

**No authentication or user system is built here.** KaamKit will have one shared
account system across all tools.

- `links.account_id` (nullable) — reserved FK for the future shared account.
- `links.anon_session_id` (nullable) — value of a signed, httpOnly `kk_sid`
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

## 10. Data model (Phase 2a)

`links` (short_code unique, destination, status, is_custom, account_id?,
anon_session_id?, click_count, last_clicked_at, expires_at?, created_ip_hash?,
timestamps) · `rate_limits` (key, count, reset_at) · `link_reports` (short_code,
link_id?, reason?, reporter_ip_hash?, created_at).

Deferred additive migrations: `campaign_id`, `click_events`, `accounts` /
`entitlements` / `usage`.

---

## 11. Phase log

| Phase | Delivered |
|---|---|
| **1 — Tool page + UX** ✅ | `/url-shortener` static page (SEO, breadcrumb, JSON-LD `WebApplication` + `BreadcrumbList`, FAQ, related tools, house AdSlot); `ShortenForm` client island with every state; shared `CopyButton` + `Breadcrumb`; `app/lib/{url-validation,short-code,reserved-routes}.ts`; `POST /api/shorten` **mock** (real validation + code-gen, no persistence, in-memory rate limiter, `?simulate=` for QA); zero-dep `node --test` suite. Commit `3ce516f` on `url-shortener`. |
| **2a — Persistence + shorten API + redirect** | Neon + Drizzle schema/migrations; real `POST /api/shorten` (persist, DB rate limit, collision-retry, `screenUrl()` stub / Safe Browsing, `kk_sid` cookie); **`app/[shortCode]/route.ts` Vercel Edge redirect** + `after()` click count; `/link-unavailable`; abuse report; `robots.ts` + `sitemap.ts`; `.env.example`; unit tests. *pending* |
| **2b — Security hardening + go-live** | Cloudflare-native protection where possible without proxying; wire remaining screening; load-check the redirect; **flip catalogue `status` → `live` + surface on the production homepage** (existing design, no redesign). Optionally begin the Cloudflare Worker evaluation. *pending* |
| 3 — Account integration | *pending (shared platform)* |
| 4 — Analytics | *pending* |
| 5 — Monetisation | *pending* |

### Phase 1 mock — what is NOT real yet

- `POST /api/shorten` does **not persist** and short links do **not redirect**.
- The in-memory rate limiter resets on reload and is not shared across instances.
- `?simulate=` (API) and `?sim=` (page) force response states for QA — both
  removed in Phase 2a.
- Catalogue `status` stays `planned` and the homepage does not feature the tool.
  **Revised:** the flip + homepage surfacing happens at the **end of Phase 2b**
  (after security hardening), not Phase 2a — the domain is live and public, so
  the tool is not exposed to real users until the fuller posture is in place.
- The `url-shortener` branch is **not merged to `main`**. It should be pushed to
  `origin` so Vercel builds a **Preview Deployment** for review.
