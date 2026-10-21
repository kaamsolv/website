# KaamSolv URL Shortener — Product & Architecture

**Status: LIVE on [kaamsolv.com/url-shortener](https://kaamsolv.com/url-shortener)
since 2026-10-21** — Cloudflare Workers + Neon (Singapore), listed first in the
homepage's Popular tools. Phases 1–2b.2 complete (log in §11). Click stats UI,
accounts and link management are later phases. **Draft — updated each phase.**

This is the single source of truth for the URL Shortener. Platform-wide
decisions live in [`../kaamsolv-phase0-architecture.md`](../kaamsolv-phase0-architecture.md);
hosting / domain / deploy in [`../infra/deployment.md`](../infra/deployment.md).
This document records what is specific to this product.

> **Infrastructure decisions locked for V1 (2026-09-11):**
> - `kaamsolv.com` is live on **Vercel**; **Cloudflare is DNS-only** (not proxied).
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
> - The tool stays **unlisted and `status: planned`** until the production release
>   (see §11) — i.e. until the Phase 2b security
>   hardening is complete.

---

## 1. What it is

Turn a long URL into a short, shareable `kaamsolv.com/{shortCode}` link.

- Public tool page: **`/url-shortener`**
- Short link: **`kaamsolv.com/{shortCode}`** (e.g. `kaamsolv.com/x7Kp2`)
- Core promise: **paste → shorten → copy → done**, no account required.
- First KaamSolv tool with a backend (Work category). Not yet listed publicly.

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
| `POST /api/shorten` | route handler (JSON) | Vercel (Node) | 1 (mock) → **2a (real, done)**; optional `expiresIn` in **2b.1**; shared rate limit, destination policy, Web Risk, `400 blocked_url` in **2b.2** |
| `/{shortCode}` | 302 redirect | **Vercel Route Handler** (`app/[shortCode]/route.ts`, Node runtime — see runtime note above) | **2a (done)**; click events in **2b.1** |
| `/link-unavailable` | dynamic page (`?reason=disabled\|expired`) | Vercel | **2a (done)** |
| `/report-link` | static page + client form island, `noindex` | Vercel | **2b.2 (done)** |
| `POST /api/report` | route handler (JSON) → `202` / `400` / `429` | Vercel (Node) | **2b.2 (done)** — see §7 |

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
| Empty | Labelled `type="url"` input, "Shorten URL" button disabled until there's input. Below the help text, a labelled **"Link expires"** `<select>` (*Never* · *After 1 day* · *After 7 days* · *After 30 days*), defaulting to *Never* so the paste → shorten path is unchanged. *(2b.1)* The choice persists across "Shorten another". |
| Submitting | Button → spinner + "Shortening…", input disabled, `aria-busy` on the form. |
| Success | Teal result card: "Your short link is ready. Bas." · read-only input with the full `https://kaamsolv.com/…` URL (click/focus selects all) · **Copy** button (Clipboard API + hidden-textarea fallback) · "Goes to …" · **expiry line** with a clock icon — "Expires 18 Sept 2026, 1:49 pm" (a `<time>` element, `en-IN` format, viewer's timezone) or "Never expires" *(2b.1)* · **Shorten another** (resets, refocuses input) · note: "Saved links and click stats are coming soon." (still true: clicks are recorded but not shown — see §9). Focus moves to the result heading. |
| Invalid | Input border turns danger, inline `role="alert"` message from `messageForReason()`, focus returns to input. The same state carries the 2b.2 `blocked_url` messages (another shortener / flagged as harmful). |
| Rate limited | Calm yellow banner, `role="alert"`: "You've made quite a few requests. Try again in a little while." |
| Error / network | Danger banner, `role="alert"`: "We couldn't shorten that link. Please try again." |
| Disabled / expired link (on visiting a short link) | `/link-unavailable?reason=disabled` → "This link has been turned off."; `?reason=expired` → "This link has expired."; + "Report a problem" → `/report-link` (works since 2b.2). *(Phase 2a)* |
| Report a link *(2b.2)* | `/report-link`: flagship tool-page pattern (breadcrumb Home → Shorten a URL → Report a link, H1, one line, form card). Fields: short link · reason (5 radio cards, 44 px targets, `fieldset`/`legend`) · optional details with a `0 / 500` counter · hidden honeypot. States: idle · submitting ("Sending…") · invalid (per field, focus moves to it) · rate-limited (yellow banner) · error · success (teal card "Thanks — we'll take a look." + "Report another link"). Linked from a new FAQ item "What if a short link looks harmful?". QA'd light/dark, mobile/desktop. |

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
- Validation is structural, not reputational. Since 2b.2 it is followed by the
  **destination policy** (other URL shorteners refused) and **Google Web Risk**
  screening — see §7.

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
kaamsolv.com  →  Cloudflare DNS (grey cloud, resolve only)  →  Vercel
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
                  4. click = clickMetaFromRequest(method, headers)      ← null for HEAD / prefetch
                     if (click) after(() => recordClick(db, id, click)) ← best-effort, off the
                        one statement: click_events INSERT               response path (2b.1)
                        + click_count++ / last_clicked_at (humans only)
```

- **Runtime:** Node, not Edge. The Edge runtime is deprecated in Next.js 16
  (`node_modules/next/dist/docs/.../route-segment-config/runtime.md` — "Remove
  the `runtime` export"). `@neondatabase/serverless` is HTTP-based, so the lookup
  is still one fast round trip on Vercel Fluid. If/when the Cloudflare Worker
  lands, the redirect moves off Vercel entirely — the Node-vs-Edge distinction on
  Vercel stops mattering.
- **302** (not 301) — keeps KaamSolv in control (disable, edit destination, count).
- `Cache-Control: no-store`: a disabled link stops resolving immediately.
  (A short `s-maxage` is a later optimisation and pairs with a purge mechanism.)
- `X-Robots-Tag: noindex` on every redirect so short URLs don't get indexed.
- **Unknown code → 404**, not `/link-unavailable` (§7: non-informative — don't
  confirm or deny that a code was ever issued). `/link-unavailable` is only for a
  link that exists but is disabled or expired.
- Clicks are written via `after()` so a slow or failing DB write **never** delays
  or breaks the redirect. `recordClick()` never throws — it logs the cause
  (`[redirect] click not recorded: …`, root cause first) and no-ops for a link
  that was disabled or expired between the lookup and the write. See §9.
- **`HEAD` is not a click.** Next.js answers `HEAD` by running the `GET` handler
  (`next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js`),
  and link unfurlers probe with `HEAD`. Phase 2a counted those; 2b.1 doesn't. The
  redirect response itself is unchanged — `HEAD` still gets the 302.

### Deferred — Cloudflare Worker (later evaluation)

The long-term home for this path is a **Cloudflare Worker** on a Cloudflare-
**proxied** `kaamsolv.com` — for an edge cache (Cloudflare Cache API / Workers
KV), true isolation from the Vercel app, and Cloudflare WAF / Bot Fight / rate-
limiting on the redirect. It is **not** part of V1 because:

1. `kaamsolv.com` is DNS-only today; a Worker route only runs on proxied traffic.
2. Flipping the apex to Proxied is a deliberate production DNS change on a live
   domain (needs SSL "Full (strict)", subdomain testing, a rollback plan).

When it lands: the Worker imports the same resolver logic (extracted to
`packages/link-core`), reads Neon through a scoped `kk_edge` role
(`SELECT` + `click_count` `UPDATE` only), and `app/[shortCode]/route.ts` is
removed from production (kept for local / preview).

---

## 7. Security (V1)

**In place after Phase 2b.2**, in the order a create request meets them
(`POST /api/shorten`): **shared rate limit → URL validation (§4) →
destination policy → expiry preset → Web Risk screening → insert.** Plus CSPRNG
codes with a reserved-word keyspace, safe redirect handling (302, `noindex`,
`no-store`, non-informative 404 for unknown codes), abuse reporting, and the
operator takedown path. Callers are identified only by a salted hash
(`app/lib/ip-hash.ts` — `SHA-256(ip + KK_IP_HASH_SALT)`); a raw IP is never
stored or logged.

### Rate limiting — shared, database-backed (2b.2)

Replaces the Phase 1 in-memory limiter (per-instance, reset on every deploy).
Counts live in Postgres (`rate_limits`, §10) so they hold across instances and
restarts — verified by restarting the server mid-window and still getting `429`.
No Redis (deferred).

| Action | Limits per caller | Key shape |
|---|---|---|
| create a link | 12 / minute **and** 100 / day | `url-shortener:create:1m:<hash>`, `…:1d:<hash>` |
| report a link | 5 / hour | `url-shortener:report:1h:<hash>` |

- The numbers live in one place — `ANONYMOUS_LIMITS` in
  [`app/lib/rate-limit.ts`](../../app/lib/rate-limit.ts) — the seed of the future
  entitlement boundary (Phase 0 §7), not literals in route handlers.
- One atomic upsert per request (`INSERT … ON CONFLICT DO UPDATE … RETURNING`,
  [`db/rate-limits.ts`](../../db/rate-limits.ts)); concurrent requests count
  exactly (tested with 25 parallel calls). Any exceeded window blocks, and
  `Retry-After` reports the latest reset.
- Expired windows are pruned opportunistically (~1% of requests, via `after()`).
- **`KK_IP_HASH_SALT` is required on Vercel.** Missing → the request fails with
  an actionable server log (same pattern as `DATABASE_URL`); locally a fixed dev
  salt is used. See `../infra/deployment.md` §6.
- Keys carry a `scope` so a future product (e.g. dynamic QR creation) can reuse
  the limiter without sharing counters.

### Destination policy — other URL shorteners are refused (2b.2)

[`app/lib/destination-policy.ts`](../../app/lib/destination-policy.ts). A chain
(kaamsolv.com → bit.ly → ?) hides the real destination from screening and from
the person clicking, and the inner link can be repointed later. ~30 **open,
general-purpose** shorteners are blocked, including subdomains (bit.ly,
tinyurl.com, t.co, lnkd.in, is.gd, rb.gy …). First-party short domains that
only lead to their own site are allowed (youtu.be, amzn.to, wa.me, fb.me).
Response: `400 blocked_url` — "That's a link from another shortener. Paste the
full destination link instead."

### Reputation screening — Google Web Risk (2b.2)

[`app/lib/url-reputation.ts`](../../app/lib/url-reputation.ts) — Lookup API,
`GET https://webrisk.googleapis.com/v1/uris:search`, threat types `MALWARE`,
`SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`, 1.5 s timeout, no SDK.

- **Why Web Risk:** Google's Safe Browsing API is licensed for non-commercial
  use only and directs commercial users to Web Risk.
- **Cost (verified 2026-09-11):** free up to 100,000 lookups/month, then
  $0.50 / 1,000. One lookup per link *created* — redirects never call it.
- **Setup (not done yet — owner action):** Google Cloud project with **billing
  enabled**, Web Risk API enabled, an API key (restrict it to the Web Risk API),
  stored as `WEB_RISK_API_KEY` on Vercel.
- **Match** → `400 blocked_url` — "We can't shorten this link — it's been
  flagged as potentially harmful." Logged with the destination **host** and
  threat types only.
- **Fail open** (approved decision): timeout, HTTP error, network error, or no
  key configured → the link is created, the reason is logged
  (`not screened (http_400): host=…`), and `links.screened_at` stays **null** so
  those links can be re-screened later. Verified live against Google with a
  deliberately invalid key.
- **Privacy:** the Lookup API sends the full destination URL to Google.
- **Secrets:** the key travels in the query string; `redactSecrets()`
  (`app/lib/log-error.ts`) scrubs `key=` / `token=` parameters as well as
  Postgres URLs before anything is logged. Verified: the key never appeared in
  server logs.
- `screened_at` is set only on a clean result; `npm run link:status` shows it.
- Links created before 2b.2 have `screened_at = null`. Nothing re-screens them
  yet (deferred).

### Abuse reporting (2b.2)

`/report-link` (form) → `POST /api/report` → `link_reports` (§10).

- Anyone can report a short link — pasted as a full URL, `kaamsolv.com/code`, or
  just the code. Reasons: phishing · malware · spam · illegal · other; optional
  details (≤ 500 chars).
- **No enumeration:** a well-formed report gets the same `202 { ok: true }`
  whether or not the code exists; it's only stored if the link exists.
- **Reports never disable a link.** Otherwise anyone could take down a
  legitimate link by reporting it. An operator reviews reports and decides.
- **Spam controls:** 5 reports/hour per caller, a hidden honeypot field (a
  filled honeypot also gets `202` and stores nothing), length caps. No CAPTCHA
  (another third-party service — deferred).
- **Hostile input:** details are stripped of control characters — including the
  ESC of ANSI sequences, since reports are read in a terminal — capped in the app
  *and* by a database `CHECK`, never echoed back, never rendered as HTML.
- Only links on `kaamsolv.com` (or the serving host, for Preview/local) are
  accepted — `bit.ly/abc1234` isn't mistaken for a KaamSolv code.

### Operator tools (2b.1 + 2b.2)

```
npm run link:reports [-- N]                       newest reports across all links (read-only)
npm run link:status -- <code>                     status, expiry, clicks, events, screened, reports
npm run link:status -- <code> disable             dry run — changes nothing
npm run link:status -- <code> disable --confirm   take it down
npm run link:status -- <code> enable  --confirm   restore it
```

Both act on whatever `DATABASE_URL` points at (loaded from `.env.local`) and
print that target's **host** first — never the credentials — so a production
takedown is a deliberate act. Neither is a web endpoint: links are anonymous, so
there is no way yet to prove who owns one. A change takes effect on the next
request (redirects are `no-store`). **Disabled beats expired**; re-enabling never
resurrects an expired link.

### Other controls (2b.1)

- **Expiry:** presets only (never / 1 / 7 / 30 days), computed server-side;
  anything else → `400 invalid_expiry`; not editable after creation.
- **Click data minimisation:** see §9 — enforced in the app and by database
  `CHECK` constraints.

### Still not in place

- **Cloudflare network controls** (WAF, Bot Fight Mode, L7 DDoS, CF rate-limit
  rules, protection against short-path enumeration) — need a Cloudflare-proxied
  apex, a deliberate later DNS change. Until then protection is app-level: the
  controls above.
- Re-screening of unscreened links; CAPTCHA; email alerts for reports; a
  `/{code}+` destination preview page; the signed `kk_sid` cookie.

**The tool stays unlisted and `status: planned` until the production release**
(see §11): merge to `main`, production migrations, `KK_IP_HASH_SALT` and
`WEB_RISK_API_KEY` set on Production, then the catalogue flip.

---

## 8. Accounts & entitlements — boundary

**No authentication or user system is built here.** KaamSolv will have one shared
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

## 9. Analytics

### Built in 2b.1 — click events

Every click on an active, unexpired link writes one `click_events` row, off the
redirect path via Next's `after()` (`ctx.waitUntil()` if/when the redirect moves
to a Cloudflare Worker). No cookies on the redirect path, no third-party
scripts. Analytics failure never blocks a redirect.

**Captured — exactly the fields designed for this phase, nothing else:**

| field | source | stored as |
|---|---|---|
| when | database clock | `occurred_at timestamptz` |
| referrer host | `Referer` header, http(s) only | hostname only, lower-cased, ≤ 253 chars — e.g. `web.whatsapp.com` |
| country | Vercel's `x-vercel-ip-country` header | ISO-3166 alpha-2 (`IN`), else null. Absent locally. |
| device class | `User-Agent`, bucketed | `desktop` \| `mobile` \| `tablet` \| `bot` \| `unknown` |

**Not captured:** IP address, the raw User-Agent, the full referrer URL (paths
and query strings can carry personal data), city/region (Vercel sends those
headers; they are never read), cookies or any identifier. The `CHECK`
constraints (`country ~ '^[A-Z]{2}$'`, `char_length(referrer_host) <= 253`)
enforce the shape in the database, so an app-layer bug can't widen what's kept.

**What counts as a click** (`app/lib/click-meta.ts`):

- `HEAD` requests and browser prefetch/prerender (`Sec-Purpose` / `Purpose`
  headers) are **not recorded at all**.
- Bots — link-preview fetchers (Slack, WhatsApp, Telegram, Discord, LinkedIn,
  Twitter/X, Facebook), crawlers and scripted clients (`curl`, `python-requests`,
  headless Chrome…) — are **recorded** with `device_class = 'bot'` but **do not
  increment `click_count`**. `click_count` means *people* who clicked; pasting a
  link into a chat makes the app fetch it without anyone clicking. In-app
  browsers (Facebook `FBAN`, Instagram, `LinkedInApp`) are people and count.
- Bot detection is a User-Agent heuristic, not a guarantee. Known gaps: iPadOS
  13+ Safari reports a Mac UA → `desktop`; a determined script can spoof a
  browser UA.

**How it's written.** One SQL statement, one round trip: a data-modifying CTE
bumps `click_count` / `last_clicked_at` (humans only) and inserts the event,
both conditional on the link still being active and unexpired. Atomic — the
counter and the event log can't drift apart. Covered by
`test/db-clicks.test.mts` (18 tests) and `test/click-meta.test.mts` (13).

**Not built (deliberately):** any way to *view* stats. The data is readable by
operators (`npm run link:status -- <code>` shows the human count and an
event breakdown by device class). A creator-facing stats view needs a way to
prove link ownership, which needs accounts (§8) — so the result card still says
"click stats are coming soon".

**Open questions for a later phase:** a retention policy for `click_events`
(none today — rows are kept until the link is deleted, which cascades); and
volume control, since a bot hammering a link grows the table (it can't inflate
`click_count`).

### Deferred

The shared KaamSolv analytics engine that URL + QR both feed (Phase 0 §6), and
aggregate/reporting queries. The `click_events` schema is compatible with that:
it's per-link, append-only and indexed on `(link_id, occurred_at)`.

---

## 10. Data model

### Built in Phase 2a — [`db/schema.ts`](../../db/schema.ts), migration `0000_powerful_masque.sql`

**`links`** — one row per short link. Drizzle ORM, dialect `postgresql`.
Unchanged by 2b.1.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` default |
| `short_code` | `text` | **unique** (`links_short_code_key`) — the redirect lookup key |
| `destination` | `text` | normalised output of `validateDestinationUrl()` |
| `status` | `link_status` enum (`active` \| `disabled`) | default `active`; `expired` is derived from `expires_at`, not stored |
| `is_custom` | `boolean` | default `false` — always false in V1 (user slugs are Phase 3) |
| `account_id` | `uuid` null | **reserved**, unwritten in 2a. No FK yet (no `accounts` table). Indexed. |
| `anon_session_id` | `text` null | **reserved** for the future signed `kk_sid` cookie (§8). Unwritten in 2a. Indexed. |
| `click_count` | `bigint` (number mode) | default `0`; **human** clicks only — bumped by `recordClick()` via `after()` (§9) |
| `last_clicked_at` | `timestamptz` null | last *human* click, set alongside `click_count` |
| `expires_at` | `timestamptz` null | past → `/link-unavailable?reason=expired`. Set at creation from a preset (2b.1); not editable. |
| `created_ip_hash` | `text` null | `SHA-256(ip + KK_IP_HASH_SALT)`; null when no salt. Never the raw IP. |
| `created_at` / `updated_at` | `timestamptz` | `now()` defaults |

### Built in Phase 2b.1 — migration `0001_aberrant_medusa.sql`

Purely additive: a new enum and table. `links` is untouched, so code from
Phase 2a keeps working against a migrated database.

**`click_events`** — one row per recorded click (§9).

| column | type | notes |
|---|---|---|
| `id` | `bigint` PK | `GENERATED ALWAYS AS IDENTITY` — compact for an append-only log |
| `link_id` | `uuid` | FK → `links.id`, **`ON DELETE CASCADE`** |
| `occurred_at` | `timestamptz` | `now()` default |
| `referrer_host` | `text` null | `CHECK char_length ≤ 253` |
| `country` | `text` null | `CHECK ~ '^[A-Z]{2}$'` |
| `device_class` | `device_class` enum (`desktop` \| `mobile` \| `tablet` \| `bot` \| `unknown`) | default `unknown` |

Index: `click_events_link_id_occurred_at_idx` on `(link_id, occurred_at)` — the
per-link time-series access path. Every query in `db/links.ts` is a Drizzle
builder or a `sql` template with bound parameters; no string-built SQL.

**Applied to:** Neon `development` (2026-09-11). **Not** applied to Neon
production — that happens with the production release.

Migrations: `npm run db:generate` (schema → SQL, no DB needed) →
`npm run db:migrate` ([`db/migrate.mts`](../../db/migrate.mts) — Neon when
`DATABASE_URL` is set, else local PGlite; prints the target **host** before
applying). Production migrations are a deliberate manual step, never part of
the Vercel build (see `../infra/deployment.md` §7).

### Built in Phase 2b.2 — migration `0002_yellow_arachne.sql`

Purely additive: a new enum, two tables, and one nullable column (`ADD COLUMN`
of a nullable column doesn't rewrite `links`). Code from 2a/2b.1 keeps working
against a migrated database.

**`links.screened_at`** — `timestamptz` null. Set when Web Risk cleared the
destination; null = not screened (fail-open, unconfigured, or pre-2b.2). §7.

**`rate_limits`** — shared fixed-window counters (§7).

| column | type | notes |
|---|---|---|
| `key` | `text` PK | `<scope>:<action>:<window>:<salted ip hash>` — never a raw IP |
| `count` | `integer` | requests in the current window |
| `reset_at` | `timestamptz` | window end; index `rate_limits_reset_at_idx` for pruning |

**`link_reports`** — abuse reports (§7).

| column | type | notes |
|---|---|---|
| `id` | `bigint` PK | identity |
| `link_id` | `uuid` | FK → `links.id`, **`ON DELETE CASCADE`** |
| `reason` | `report_reason` enum (`phishing` \| `malware` \| `spam` \| `illegal` \| `other`) | |
| `details` | `text` null | sanitised in the app; `CHECK char_length ≤ 500` |
| `reporter_ip_hash` | `text` null | salted hash, never the IP |
| `created_at` | `timestamptz` | `now()` |

Indexes: `(link_id, created_at)` for a link's reports; `(created_at)` for the
newest-first operator listing. Reports for unknown codes are never stored — an
`INSERT … SELECT FROM links WHERE short_code = $1` inserts zero rows.

**Applied to:** Neon `development` (2026-09-11). **Not** applied to Neon
production.

### Deferred additive migrations

`campaign_id`, `accounts` / `entitlements` / `usage`. No QR tables in this
schema: dynamic QR will add its own table referencing `links.id` when it lands.

---

## 11. Phase log

| Phase | Delivered |
|---|---|
| **1 — Tool page + UX** ✅ | `/url-shortener` static page (SEO, breadcrumb, JSON-LD `WebApplication` + `BreadcrumbList`, FAQ, related tools, house AdSlot); `ShortenForm` client island with every state; shared `CopyButton` + `Breadcrumb`; `app/lib/{url-validation,short-code,reserved-routes}.ts`; `POST /api/shorten` **mock** (real validation + code-gen, no persistence, in-memory rate limiter, `?simulate=` for QA); zero-dep `node --test` suite. Commit `3ce516f` on `url-shortener`. |
| **2a — Persistence + shorten API + redirect** ✅ *(commits `e7b3d4d` → `2c6a1df`; verified on Vercel Preview + Neon development 2026-09-11)* | **Delivered:** Drizzle schema ([`db/schema.ts`](../../db/schema.ts)) + migration `0000` + `drizzle.config.ts` + `db:generate` / `db:migrate` scripts; driver selection ([`db/client.ts`](../../db/client.ts): Neon-HTTP when `DATABASE_URL` set, else PGlite); data layer ([`db/links.ts`](../../db/links.ts): `createShortLink` w/ collision-retry, `resolveShortLink`, `recordClick`); real `POST /api/shorten` (persists, drops `mock`/`?simulate=`, stores hashed creator IP); `app/[shortCode]/route.ts` redirect (Node runtime — see runtime note; `after()` click count; 404 for unknown/reserved, `/link-unavailable` for disabled/expired); `/link-unavailable` page; `.env.example`; PGlite test suite (`test/db-links.test.mts`, `test/helpers/test-db.mts`). **Deferred within 2a** (see §7): DB-backed rate limiting + `rate_limits`, `link_reports` + `/report-link`, `kk_sid` cookie, `screenUrl()`/Safe Browsing, `robots.ts` / `sitemap.ts`. |
| **2b.1 — Click analytics + link controls** ✅ *(commit `2c19495`)* | **Delivered:** `click_events` table + `device_class` enum (migration `0001`, additive, applied to Neon development only); `app/lib/click-meta.ts` (device class / referrer host / country, `HEAD` + prefetch excluded); `recordClick()` rewritten as one atomic CTE — event row always, `click_count` for humans only (§9); redirect passes click metadata into `after()`; optional expiry presets (`app/lib/link-expiry.ts`) on `POST /api/shorten` (`expiresIn` → `expiresAt`, backward compatible) and in the form (**"Link expires"** select) + result card; FAQ copy updated; operator takedown tool `npm run link:status` (`db/link-status.mts`, dry-run by default) with `setLinkStatus` / `getLinkByCode` / `getClickBreakdown`; shared `db/load-env.mts`; tests `click-meta` (13), `link-expiry` (6), `db-clicks` (18). **Not built, by design:** any stats UI, any anonymous link-management mechanism, auth. |
| **2b.2 — Abuse protection & launch readiness** ✅ *(implemented — pending review)* | **Step 0:** merged `main` (`22b16e3`, QR Generator) into `url-shortener` — 3 additive conflicts resolved by keeping both sides (`icons.tsx` union; `package.json` union incl. main's `tsx --test` runner and `0.0.0.0` dev host; lockfile regenerated); no QR file edited; all QR tests pass on the merged tree. **Delivered:** shared DB rate limiting (`rate_limits`, `app/lib/rate-limit.ts` `ANONYMOUS_LIMITS`, `db/rate-limits.ts`); salted IP hashing with `KK_IP_HASH_SALT` required on Vercel (`app/lib/ip-hash.ts`); destination policy blocking open URL shorteners (`app/lib/destination-policy.ts`); Google Web Risk screening, fail-open (`app/lib/url-reputation.ts`, `links.screened_at`); abuse reporting (`/report-link`, `POST /api/report`, `link_reports`, `db/reports.ts`, `app/lib/report.ts`); `redactSecrets()` now scrubs query-string API keys; operator `npm run link:reports` + reports/screening in `link:status` (and both exit cleanly on Windows); migration `0002`; new FAQ item. Tests: `abuse-policy` (14), `url-reputation` (8), `db-abuse` (13). |
| **Cloudflare + KaamSolv merge** ✅ *(2026-10-21)* | Merged into `main` with the Workers runtime changes (`cf-ipcountry` / `cf-connecting-ip`, production detection on any host); renamed to KaamSolv (`kaamsolv.com` own-host checks, copy); image converters moved from a root `[slug]` route to static folders so `app/[shortCode]` can own the root, converter slugs + `kaamkit` added to reserved words, and a test now fails if any top-level route isn't reserved. New Neon project (Singapore), migrations `0000`–`0002` applied, `DATABASE_URL` + `KK_IP_HASH_SALT` set as Worker secrets. Verified locally: shorten/validate/blocked/rate-limit/report/expiry, redirect 302 + `noindex`/`no-store`, click metadata (HEAD + prefetch excluded), mobile + light theme; in the Worker runtime the Neon driver reaches Neon (fake-credential check). |
| **Production release** ✅ *(2026-10-21)* | Deployed `main` (Worker version `87c8d656`); catalogue `status` → `live`, featured first in Popular tools (Percentage Calculator, planned, left the rail). Live checks: created `kaamsolv.com/hmTfloG` (API) and `kaamsolv.com/883xfqy` (form) — both 302 to their destinations with `noindex` + `no-store`; another shortener and an own short link are refused; unknown code → 404. Server-side redirect ≈ 0.3–0.6 s vs ≈ 0.18 s for a static page (Neon lookup; free-plan Neon sleeps when idle, so the first click after a quiet spell is slower). `WEB_RISK_API_KEY` not set. Homepage blurb no longer promises click tracking (no stats UI yet). |
| 3 — Account integration | *pending (shared platform)* — unlocks a creator-facing stats view and link management |
| 4 — Analytics | *partly started* — click events are recorded since 2b.1; stats UI, retention and the shared engine are pending |
| 5 — Monetisation | *pending* |

### After Phase 2b.2 — what is real, what is still not

**Real now:** `POST /api/shorten` persists to Postgres (Neon in prod/preview,
PGlite locally), with an optional expiry preset, behind a shared rate limit, a
destination policy and Web Risk screening (fail-open); `kaamsolv.com/{code}`
redirects from the database; disabled and expired links resolve to
`/link-unavailable`; every click writes a minimal `click_events` row and human
clicks move `click_count`; anyone can report a link at `/report-link`; operators
can review reports and disable/re-enable links from the terminal.

**Still not real / not built:**

- **Web Risk isn't switched on anywhere yet.** It needs the owner to create the
  Google Cloud project, enable billing and the API, and set `WEB_RISK_API_KEY` on
  Vercel. Until then every link is created unscreened (fail-open) and logged.
- **`KK_IP_HASH_SALT` must be set on Vercel Preview before this branch's next
  Preview deploy** — without it, shortening and reporting fail there by design.
- No account/history, no `kk_sid` cookie, no way for a creator to see stats or
  manage a link.
- No retention policy or volume control for `click_events` (§9); no re-screening
  of unscreened links; no CAPTCHA; no report notifications.
- On Preview, the result card shows `https://kaamsolv.com/{code}` because
  `NEXT_PUBLIC_SITE_URL` isn't set for Preview; that host doesn't serve the
  shortener yet. Test redirects on the preview host instead.
- Catalogue `status` stays `planned` and the homepage does not feature the tool
  until the **production release** row above.
- The `url-shortener` branch is **not merged to `main`**. Preview uses the Neon
  `development` branch (`DATABASE_URL`, Preview scope); production uses the Neon
  `production` branch, which has **no tables yet** — migrations `0000`–`0002`
  run there as part of the production release.
