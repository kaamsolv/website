# KaamKit — Deployment & Infrastructure

**Updated:** 2026-09-11 · **Owner doc:** this file is the source of truth for how
KaamKit is hosted, deployed, and wired to its domain. Architecture rationale
lives in `../kaamkit-phase0-architecture.md`; product specifics in
`../products/`.

---

## 1. Current state at a glance

| Concern | Reality today |
|---|---|
| Source repo | **`github.com/kaamkitdigital/Website`** |
| Production branch | **`main`** — every push deploys to production |
| Preview / staging | **Vercel Preview Deployments** — every other branch / PR gets its own URL |
| Hosting | **Vercel**, project **`Kaamkit`** (Next.js 16, App Router) |
| Primary domain | **`kaamkit.com`** (apex) — live, serving the KaamKit homepage |
| Secondary | **`www.kaamkit.com`** — configured and working |
| DNS authority | **Cloudflare** (Cloudflare is authoritative for the `kaamkit.com` zone) |
| Cloudflare proxy | **DNS-only (grey cloud)** for the Vercel web records — Cloudflare answers DNS only; requests go straight to Vercel |
| TLS | Terminated at **Vercel** |
| Apex record | Cloudflare CNAME (flattened) → the **Vercel-provided target** |
| Production database | **Neon Postgres** — **provisioned (URL Shortener Phase 2a)**. `DATABASE_URL` set on Vercel **Production + Preview**. Drizzle ORM + `@neondatabase/serverless` (HTTP). |
| Local / test database | **PGlite** (`@electric-sql/pglite`, dev dependency) — real Postgres in WASM, exact schema parity with Neon. Selected automatically when `DATABASE_URL` is unset; local store at `.pglite/` (git-ignored). |

### Deferred infrastructure (not in V1)

| Item | Status | Notes |
|---|---|---|
| Cloudflare Worker (edge redirect) | **Deferred — later evaluation** | Would require flipping the apex to Cloudflare **Proxied**. V1 short-link redirects run on a **Vercel Route Handler (Node runtime)** instead (see §5). |
| Cloudflare proxy / WAF / Bot Fight / rate-limiting rules | **Deferred** | Not in the request path while records are DNS-only. Revisit with the Worker. |
| Redis (Upstash or self-hosted) | **Deferred from V1** | Rate-limiting is DB-backed for V1 behind a swappable interface. |
| S3-compatible object storage | **Deferred until Image Tools (Phase 5)** | Not needed by the homepage or URL Shortener. |
| ClickHouse / column store for analytics | **Deferred** | Postgres table first; revisit only if aggregate queries slow down. |
| Dedicated `staging` environment | **Not needed** | Vercel Preview Deployments serve this role. |

---

## 2. Repository & branch model

- One repo: `kaamkitdigital/Website`. One Next.js app.
- `main` is protected-by-convention: **do not commit directly**; feature work
  happens on branches (`homepage-claude`, `url-shortener`, …) and merges to
  `main` after review.
- Local development uses **git worktrees** (one directory per branch) so several
  branches can be checked out at once. See `../kaamkit-phase0-architecture.md`
  §"Worktrees".
- Merging a branch to `main` = shipping to production. There is no separate
  release step.

---

## 3. Environments

| Environment | Trigger | Host | Database | Purpose |
|---|---|---|---|---|
| **local** | `npm run dev` | localhost:3000 | PGlite (file or in-memory) | day-to-day development, `npm test` |
| **preview** | push any non-`main` branch | `*.vercel.app` (per branch) | Neon **dev branch** (Phase 2a) | review a change on a real URL before merge; QA |
| **production** | push / merge to `main` | `kaamkit.com` | Neon **primary** (Phase 2a) | live site |

Vercel builds every push. A preview URL is posted on the commit / PR.

---

## 4. Domain & DNS

```
kaamkit.com        Cloudflare DNS (grey cloud)  →  Vercel  →  Next.js app
www.kaamkit.com    Cloudflare DNS (grey cloud)  →  Vercel  →  redirect to apex
kaamkit.com/{code} Cloudflare DNS (grey cloud)  →  Vercel Route Handler (Node)  →  302 to destination
```

- **Canonical host: `kaamkit.com` (apex).** `www` redirects to it (configured in
  Vercel). App code uses `https://kaamkit.com` as the canonical base
  (`app/layout.tsx` `metadataBase`; `NEXT_PUBLIC_SITE_URL` where an override is
  useful).
- **Do not change these DNS records without a plan.** The site is live. Any
  change to proxy status or targets is a production change: test on a throwaway
  subdomain first, lower the TTL ahead of time, and have a rollback ready.
- Moving to Cloudflare **Proxied** (orange cloud) is a prerequisite for the
  Cloudflare Worker, WAF, and CF rate-limiting rules. It also requires SSL/TLS
  mode **Full (strict)** on the Cloudflare side or Vercel will redirect-loop.
  This is a deliberate later decision, not a V1 step.

---

## 5. URL Shortener redirect — V1

`kaamkit.com/{shortCode}` is served by a **Vercel Route Handler**
(`app/[shortCode]/route.ts`) — **not** a Cloudflare Worker in V1.

- **Runtime: Node, not Edge.** It was specced as `runtime = 'edge'`; Next.js 16
  deprecates the Edge runtime and instructs removing the `runtime` export
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`).
  `@neondatabase/serverless` talks to Neon over HTTP, so the lookup stays a
  single fast round trip on Vercel Fluid compute. The route is still isolated by
  its own segment; the Node-vs-Edge choice only matters while the redirect lives
  on Vercel.
- Next.js static routes (`/url-shortener`, `/about`, …) take precedence over the
  dynamic `[shortCode]` segment; a reserved-segment list
  (`app/lib/reserved-routes.ts`) is the second guard and is shared with the
  future Worker.
- The handler looks the code up in Neon (`db/links.ts`), returns `302` for an
  active link, `notFound()` (404) for an unknown or reserved code, redirects to
  `/link-unavailable?reason=disabled|expired` for a link that exists but can't be
  followed, and records the click **best-effort** via `after()` so analytics
  never block the redirect.
- The Cloudflare Worker remains the intended long-term home for this path (edge
  cache, isolation from the marketing app, CF WAF). It is deferred until (a)
  there is a reason to move it and (b) the apex is proxied through Cloudflare.

---

## 6. Environment variables

Set in the Vercel project (`Kaamkit`) → Settings → Environment Variables, scoped
per environment. `.env.local` (git-ignored) mirrors them for local dev; a
committed `.env.example` documents the full set (added in Phase 2a).

| Variable | Environments | Status | Purpose |
|---|---|---|---|
| `DATABASE_URL` | preview, production | **wired (2a)** | Neon pooled connection string (per-env: dev branch vs primary). Its **absence** selects the PGlite driver. Server-only — never exposed to the client. |
| `KK_IP_HASH_SALT` | preview, production | **read (2a)** | salt for the hashed creator IP on new links (`SHA-256(ip + salt)`). If unset, `created_ip_hash` is null. |
| `NEXT_PUBLIC_SITE_URL` | (optional) all | read (1) | canonical base for generated short links; defaults to `https://kaamkit.com` |
| `KK_ANON_COOKIE_SECRET` | preview, production | reserved | HMAC key for the signed `kk_sid` recent-links cookie — not read yet |
| `SAFE_BROWSING_API_KEY` | production (optional) | reserved | enables reputation screening — not read yet |

Local dev needs **nothing** — no `DATABASE_URL` selects PGlite (`.pglite/`), and
`db/migrate.mts` hand-loads `.env.local` / `.env` for standalone runs. A
committed [`.env.example`](../../.env.example) documents the full set.

---

## 7. Database migrations (Phase 2a onward)

- Schema: Drizzle ORM ([`db/schema.ts`](../../db/schema.ts)), dialect
  `postgresql`. Config: [`drizzle.config.ts`](../../drizzle.config.ts).
  Migrations live in `db/migrations/` (SQL + `meta/`), committed.
- `npm run db:generate` — `drizzle-kit generate`; diffs `db/schema.ts` against
  the last snapshot and writes a new SQL migration. **No DB connection needed.**
- `npm run db:migrate` — runs [`db/migrate.mts`](../../db/migrate.mts): applies
  pending migrations to Neon when `DATABASE_URL` is set, else to local PGlite
  (`.pglite/`). Uses the Drizzle migrator (`__drizzle_migrations` bookkeeping).
- **Production migrations are a manual, deliberate step** run against the Neon
  primary before or during the deploy that needs them — not part of the Vercel
  build. For a Preview, apply to the Neon **dev branch** first.
- Phase 2a shipped one migration: `0000_powerful_masque.sql` — creates the
  `link_status` enum and the `links` table (see `products/url-shortener.md` §10).

---

## 8. Deploy procedure

1. Branch from `main`, build, `npm run typecheck && npm test && npm run build`.
2. Push the branch → Vercel posts a Preview URL. QA there.
3. If the change needs a schema change: run `npm run db:migrate` against the
   Neon **dev branch** and verify on the preview.
4. Open a PR → review.
5. Merge to `main`. If a migration is needed in production, run
   `npm run db:migrate` against the Neon **primary** as part of the release.
6. Vercel deploys `main` to `kaamkit.com`.

**Rollback:** Vercel → Deployments → promote a previous production deployment
(instant). A schema migration is *not* auto-rolled-back — write reversible
migrations and keep a down path.

---

## 9. CI (recommended, not yet set up)

A GitHub Actions workflow on push / PR running `npm run typecheck`, `npm test`,
`npm run build`. Vercel already blocks a deploy on a failed build; the Action
adds the type-check and unit tests as a gate before merge.

---

## 10. What is NOT automated / manual today

- Neon branch creation and connection strings (base DB provisioned; `DATABASE_URL`
  set on Production + Preview).
- Setting Vercel environment variables.
- Production database migrations (`npm run db:migrate` against the Neon primary).
- Any DNS or Cloudflare change.
- Cache purges (none needed while DNS-only / no CDN in path).
