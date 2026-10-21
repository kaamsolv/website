# KaamSolv — Deployment & Infrastructure

**Updated:** 2026-10-21 · Source of truth for how KaamSolv is hosted, deployed
and wired to its domain. Decision history: [`../DECISIONS.md`](../DECISIONS.md).

> The `url-shortener` branch carries an older, Vercel-based version of this
> file (`kaamkit.com`). This version supersedes it — keep this one when that
> branch merges `main`, and carry over its Neon / env-var / migration sections.

---

## 1. Current state at a glance

| Concern | Setup |
|---|---|
| Source repo | **`github.com/kaamsolv/website`** (`origin`). Old repo kept as remote `kaamkit-old`. |
| Production branch | `main` |
| Hosting | **Cloudflare Workers**, worker **`kaamsolv`**, Next.js via **OpenNext** (`@opennextjs/cloudflare`) |
| Primary domain | **`kaamsolv.com`** (apex, canonical) — Worker Custom Domain |
| Secondary | **`www.kaamsolv.com`** — Worker Custom Domain, 308 → apex (`next.config.mjs` `redirects`) |
| DNS | Cloudflare zone `kaamsolv.com` (nameservers `bailey` / `cris.ns.cloudflare.com`) |
| TLS | Cloudflare (certificates issued automatically for Custom Domains) |
| Fallback URL | `https://kaamsolv.kaamsolv.workers.dev` (`workers_dev: true`; pages carry the kaamsolv.com canonical) |
| Cloudflare account | `prabhatbhatnagar@gmail.com`'s Account (`wrangler whoami`) |
| Live since | **2026-10-21** — first deploy, version `12640492-b39a-4067-ac04-c1044dfb9bda` |
| Cache | Pre-rendered pages served from Worker static assets (`open-next.config.ts`) — no R2/KV/D1 |
| Database | **Neon Postgres**, project `kaamsolv` (`spring-wave-63290734`), **AWS ap-southeast-1 (Singapore)**, branch `production`, pooled endpoint. Neon account: the kaamsolv Gmail. Migrations `0000`–`0002` applied 2026-10-21. Used only by the URL Shortener (not yet on `main`). |
| Worker secrets | `DATABASE_URL`, `KK_IP_HASH_SALT` — set 2026-10-21 with `db/setup-production.mjs` (`cf-workers-poc` branch). `WEB_RISK_API_KEY` not set: link screening is skipped (fail-open). List names with `npx wrangler secret list`. |

Config files: [`wrangler.jsonc`](../../wrangler.jsonc),
[`open-next.config.ts`](../../open-next.config.ts).

---

## 2. Commands

| Command | Does |
|---|---|
| `npm run dev` | Normal Next.js dev server (localhost:3000) |
| `npm run cf:build` | `next build` + OpenNext bundle → `.open-next/` |
| `npm run cf:preview` | Build, then run the Worker locally in `workerd` (localhost:8787) — closest to production |
| `npm run cf:deploy` | Build and deploy the `kaamsolv` Worker (needs `wrangler login`) |

Local preview note: with Custom Domains in `wrangler.jsonc`, `wrangler dev`
rewrites every request's host to `kaamsolv.com`, so the www redirect can't be
seen at :8787. To test it: `npx wrangler dev --port 8788 --local-upstream www.kaamsolv.com`
after `cf:build`.

---

## 3. First deploy (one-off — done 2026-10-21, steps kept for a rebuild)

1. `npx wrangler login` — sign in with the Cloudflare account that owns the
   `kaamsolv.com` zone. In Windows PowerShell use `npx.cmd wrangler login`:
   the default script policy blocks `npx.ps1`. If the opened browser isn't
   signed in to Cloudflare, paste the printed link into one that is.
2. In the Cloudflare dashboard → `kaamsolv.com` → DNS, make sure there is **no**
   existing `A`/`AAAA`/`CNAME` record for `kaamsolv.com` or `www` (parking
   records block Custom Domains). Delete only placeholder records.
3. `npm run cf:deploy`. Wrangler creates the Worker, both Custom Domains, their
   DNS records and certificates.
4. Check: `https://kaamsolv.com`, `https://kaamsolv.com/qr-code-generator`,
   `https://www.kaamsolv.com/x` → 308 to the apex.
5. Cloudflare → SSL/TLS → Edge Certificates: turn on **Always Use HTTPS**.
   **Pending** — until then `http://kaamsolv.com` serves the page instead of
   redirecting.

Verified live on 2026-10-21: `/`, `/qr-code-generator`, `/icon.svg` → 200;
unknown path → 404; `www.kaamsolv.com/*` → 308 to the apex with path and query.
A local router that cached the apex before its records existed may hand out
only IPv6 answers for a while; check with
`curl --doh-url https://1.1.1.1/dns-query https://kaamsolv.com/`.

## 4. Ongoing deploys

Either run `npm run cf:deploy` from a clean `main`, or connect the repo once in
**Workers & Pages → kaamsolv → Settings → Builds** (Workers Builds):

- Git repository: `kaamsolv/website`, production branch `main`
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

Rollback: Workers & Pages → kaamsolv → Deployments → roll back to a previous
version (instant), or `npx wrangler rollback`.

Before merging to `main`: `npm run typecheck && npm test && npm run cf:build`.

---

## 5. Old domain

`kaamkit.com` was served by Vercel (Cloudflare DNS-only). Not changed by this
setup. Decide separately whether it should 301 to `kaamsolv.com`.

## 6. Not set up yet

- CI (GitHub Actions: typecheck, tests, `cf:build` on PRs).
- Cloudflare WAF / rate-limiting rules (now possible — traffic is proxied).
- Analytics (GA4, Search Console for `kaamsolv.com`).
