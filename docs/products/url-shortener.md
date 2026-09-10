# KaamKit URL Shortener — Product & Architecture

**Status:** In development. Phase 1 (tool page + UX) complete; backend and edge
redirect not built. **Draft — updated each phase.**

This is the single source of truth for the URL Shortener. Cross-KaamKit
decisions also land in `docs/kaamkit-phase0-architecture.md`; this document does
not duplicate the platform architecture, it records what is specific to this
product.

---

## 1. What it is

Turn a long URL into a short, shareable `kaamkit.com/{shortCode}` link.

- Public tool page: **`/url-shortener`**
- Short link: **`kaamkit.com/{shortCode}`** (e.g. `kaamkit.com/x7Kp2`)
- Core promise: **paste → shorten → copy → done**, no account required.
- First live KaamKit tool (Work category).

The tool page and the redirect path are **separate concerns** and, from Phase 2b,
run on separate infrastructure (see §6).

---

## 2. Routes

| Route | Type | Where it runs | Phase |
|---|---|---|---|
| `/url-shortener` | static page + client island | Vercel | 1 |
| `POST /api/shorten` | route handler (JSON) | Vercel | 1 (mock) → 2a (real) |
| `/{shortCode}` | 302 redirect | **Cloudflare Worker** (2b); Vercel dev/preview adapter | 2a / 2b |
| `/link-unavailable` | static page | Vercel | 2a |
| `/report-link`, `POST /api/report` | abuse report | Vercel | 2a |

**Reserved routes.** `app/lib/reserved-routes.ts` lists every top-level app path
segment plus framework/asset paths and impersonation-risk words. Generated codes
are checked against it (and regenerated on a hit); the Cloudflare Worker uses it
to decide pass-through vs. redirect. **Rule: add every new top-level route here.**

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

Framework-free; moves to `packages/link-core` in Phase 2a.

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

## 6. Redirect architecture (Cloudflare + Vercel + Neon)

*Design; built in Phase 2b. Documented before deployment per the decision log.*

```
kaamkit.com  →  Cloudflare (DNS · proxy · WAF · DDoS · rate-limit rules)
                Worker route  kaamkit.com/*
                  ├─ pass-through (default, fast path)  → Vercel origin (Next.js app)
                  └─ single-segment, non-reserved  →  resolve short code
                       Cloudflare Cache API  ─hit→ 302
                                    └─miss→ Neon SELECT → 302 → cache.put (s-maxage≈60)
                       not found / disabled / expired → 302 /link-unavailable
                       ctx.waitUntil( best-effort click_count++ )  ← never blocks
```

- **302** (not 301) — keeps KaamKit in control (disable, edit destination, count).
- Redirect responses carry `X-Robots-Tag: noindex` and are not CDN-cached beyond
  a short TTL, so a disabled link stops resolving within ~60 s (immediate via a
  Cloudflare cache purge for urgent takedowns).
- Worker reads Neon directly in V1 (no Workers KV) via `@neondatabase/serverless`
  through a scoped `kk_edge` role (`SELECT` + `click_count` `UPDATE` only).
- Local / Vercel-preview: `app/[shortCode]/route.ts` is a thin adapter over the
  shared resolver, **guarded to non-production**. Production redirects are the
  Worker only.

---

## 7. Security (V1)

Ships with: URL validation (§4), IP rate limiting on `POST /api/shorten`
(DB-backed fixed window; boundary designed to move to an edge/distributed store —
Cloudflare-native evaluated first), CSPRNG codes with a reserved/word blocklist,
`links.status = disabled` takedown path (ops action, no admin UI in V1), a
minimal "Report this link" flow, safe redirect handling (302, `noindex`,
non-informative 404 for unknown codes), and structured logging (destination
**host only**, hashed IP, outcome).

Cloudflare adds WAF managed rules, Bot Fight Mode, DDoS protection, and
rate-limiting rules for `/api/shorten` and short-path enumeration.

**Reputation screening** (`app/lib/url-reputation.ts`, `screenUrl()` interface):
V1 stub; Google Safe Browsing or equivalent is evaluated and wired in Phase 2a.
**KaamKit does not launch an unrestricted anonymous redirect service.**

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
path (`ctx.waitUntil` / `after()`). No PII, no cookies on the redirect path, no
third-party scripts. Analytics failure never blocks a redirect.

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
| **1 — Tool page + UX** | `/url-shortener` static page (SEO, breadcrumb, JSON-LD `WebApplication` + `BreadcrumbList`, FAQ, related tools, house AdSlot); `ShortenForm` client island with every state; shared `CopyButton` + `Breadcrumb`; `app/lib/{url-validation,short-code,reserved-routes}.ts`; `POST /api/shorten` **mock** (real validation + code-gen, no persistence, in-memory rate limiter, `?simulate=` for QA); zero-dep `node --test` suite. |
| 2a — Persistence + shorten API | *pending* |
| 2b — Cloudflare edge redirect | *pending* |
| 3 — Account integration | *pending (shared platform)* |
| 4 — Analytics | *pending* |
| 5 — Monetisation | *pending* |

### Phase 1 mock — what is NOT real yet

- `POST /api/shorten` does **not persist** and short links do **not redirect**.
- The in-memory rate limiter resets on reload and is not shared across instances.
- `?simulate=` (API) and `?sim=` (page) force response states for QA — both
  removed in Phase 2a.
- Catalogue `status` stays `planned` and the homepage does not feature the tool
  yet (flip + surface at the end of Phase 2a, per the decision log).
