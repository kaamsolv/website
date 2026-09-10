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
| Production database | **Neon Postgres** — *not yet provisioned; added in URL Shortener Phase 2a* |
| Local / test database | **PGlite** (`@electric-sql/pglite`, dev dependency) — real Postgres in WASM, exact schema parity with Neon |

### Deferred infrastructure (not in V1)

| Item | Status | Notes |
|---|---|---|
| Cloudflare Worker (edge redirect) | **Deferred — later evaluation** | Would require flipping the apex to Cloudflare **Proxied**. V1 short-link redirects run on **Vercel Edge** instead (see §5). |
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
kaamkit.com/{code} Cloudflare DNS (grey cloud)  →  Vercel Edge Route Handler  →  302 to destination
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

`kaamkit.com/{shortCode}` is served by a **Vercel Edge Route Handler**
(`app/[shortCode]/route.ts`, `runtime = 'edge'`) — **not** a Cloudflare Worker
in V1.

- Next.js static routes (`/url-shortener`, `/about`, …) take precedence over the
  dynamic `[shortCode]` segment; a reserved-segment list
  (`app/lib/reserved-routes.ts`) is the second guard and is shared with the
  future Worker.
- The handler looks the code up in Neon, returns `302` for an active link,
  redirects to `/link-unavailable` otherwise, and records the click
  **best-effort** via `after()` so analytics never block the redirect.
- The Cloudflare Worker remains the intended long-term home for this path (edge
  cache, isolation from the marketing app, CF WAF). It is deferred until (a)
  there is a reason to move it and (b) the apex is proxied through Cloudflare.

---

## 6. Environment variables

Set in the Vercel project (`Kaamkit`) → Settings → Environment Variables, scoped
per environment. `.env.local` (git-ignored) mirrors them for local dev; a
committed `.env.example` documents the full set (added in Phase 2a).

| Variable | Environments | Added | Purpose |
|---|---|---|---|
| `DATABASE_URL` | preview, production | Phase 2a | Neon pooled connection string (per-env: dev branch vs primary) |
| `KK_ANON_COOKIE_SECRET` | preview, production | Phase 2a | HMAC key for the signed `kk_sid` recent-links cookie |
| `KK_IP_HASH_SALT` | preview, production | Phase 2a | salt for hashed-IP rate-limit keys / abuse forensics |
| `NEXT_PUBLIC_SITE_URL` | (optional) all | Phase 2a | canonical base override; defaults to `https://kaamkit.com` |
| `SAFE_BROWSING_API_KEY` | production (optional) | Phase 2a | enables reputation screening; stub passes through if unset |

Local dev needs **no** `DATABASE_URL` — its absence selects the PGlite driver.

---

## 7. Database migrations (Phase 2a onward)

- Schema: Drizzle ORM (`db/schema.ts`). Migrations generated with
  `drizzle-kit` into `db/migrations/`.
- `npm run db:generate` — create a migration from a schema change.
- `npm run db:migrate` — apply pending migrations to the DB named by
  `DATABASE_URL` (or PGlite locally).
- **Production migrations are a manual, deliberate step** run against the Neon
  primary before or during the deploy that needs them — not part of the Vercel
  build.

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

- Neon provisioning and connection strings.
- Setting Vercel environment variables.
- Production database migrations.
- Any DNS or Cloudflare change.
- Cache purges (none needed while DNS-only / no CDN in path).
