# KaamKit

**A digital toolbox for everyday problems.** Small, useful web tools that solve
one thing quickly. Live at **[kaamkit.com](https://kaamkit.com)**.

Product & brand brief: [`KAAMKIT-BRIEF.md`](KAAMKIT-BRIEF.md).

---

## Status

| Piece | State |
|---|---|
| Design system | Built — standards in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) |
| Homepage | **Live in production** at `kaamkit.com` |
| URL Shortener | **Phase 1** (tool page + mock API) on the `url-shortener` branch — not yet merged, not yet listed. See [`products/url-shortener.md`](products/url-shortener.md) |
| Everything else in the catalogue | Planned — [`kaamkit-tool-catalogue.md`](kaamkit-tool-catalogue.md) |

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4**, compiled at build time (PostCSS plugin, CSS-first `@theme`).
  No `cdn.tailwindcss.com`. Fonts self-hosted via `next/font` — no runtime call to
  `fonts.googleapis.com`.
- **Neon Postgres** for persistent data (added in URL Shortener Phase 2a).
  **PGlite** for local/test.
- Deployed on **Vercel** (project `Kaamkit`); **Cloudflare** is authoritative for
  DNS (DNS-only today — not proxied).

Hosting, domain, environments, deploy procedure: [`infra/deployment.md`](infra/deployment.md).

## Repository & branches

- Repo: **`github.com/kaamkitdigital/Website`**.
- **`main` is the production branch** — a push to `main` deploys to
  `kaamkit.com`. Do not commit to `main` directly; branch, open a PR, review,
  merge.
- Every non-`main` branch gets a **Vercel Preview Deployment** — that URL is the
  staging environment.

## Running it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run typecheck  # tsc --noEmit
npm test           # zero-dependency node --test suite (.mts files under test/)
npm run build      # production build
```

Local development needs **no** database configured — the absence of
`DATABASE_URL` selects the PGlite driver.

## Documentation

| File | What it is |
|---|---|
| [`KAAMKIT-BRIEF.md`](KAAMKIT-BRIEF.md) | Master product / brand / engineering brief (input) |
| [`kaamkit-phase0-architecture.md`](kaamkit-phase0-architecture.md) | Platform architecture rationale + resolved decisions |
| [`infra/deployment.md`](infra/deployment.md) | Hosting, domain, DNS, environments, deploy & migration procedure |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Production design-system standards (tokens, theming, components) |
| [`kaamkit-tool-catalogue.md`](kaamkit-tool-catalogue.md) | The 60-tool catalogue, locked categories, build order |
| [`products/url-shortener.md`](products/url-shortener.md) | URL Shortener product spec + architecture + phase log |
| [`kaamkit-design-system.html`](kaamkit-design-system.html) | Original visual reference prototype (not production code) |

## Development process

Phase by phase, per the brief: `Plan → Inspect → Implement → Test → Document →
Report → Approve → Commit → Next`. Each phase stops for approval before the next.
Detailed roadmap in `kaamkit-phase0-architecture.md` §14.
