# KaamSolv

**A digital toolbox for everyday problems.** Small, useful web tools that solve
one thing quickly. Live at **[kaamsolv.com](https://kaamsolv.com)**.

Product & brand brief: [`KAAMSOLV-BRIEF.md`](KAAMSOLV-BRIEF.md).
Decision log: [`DECISIONS.md`](DECISIONS.md).

---

## Status

| Piece | State |
|---|---|
| Design system | Built — standards in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) |
| Homepage | **Live** |
| QR Code Generator | **Live** — [`products/qr-code-generator.md`](products/qr-code-generator.md) |
| Image converters (10) | **Live** — [`products/image-kit.md`](products/image-kit.md) |
| URL Shortener | **Live** — [`products/url-shortener.md`](products/url-shortener.md) |
| Everything else in the catalogue | Planned — [`kaamsolv-tool-catalogue.md`](kaamsolv-tool-catalogue.md) |

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4**, compiled at build time (PostCSS plugin, CSS-first `@theme`).
  No `cdn.tailwindcss.com`. Fonts self-hosted via `next/font`.
- **Cloudflare Workers** via OpenNext — worker `kaamsolv`, custom domains
  `kaamsolv.com` + `www`.
- **Neon Postgres** (Singapore) for the URL Shortener; **PGlite** for local/test.

Hosting, domain, secrets, deploy & migration procedure:
[`infra/deployment.md`](infra/deployment.md).

## Repository & branches

- Repo: **`github.com/kaamsolv/website`**. `main` is production.
- Feature work happens on branches, then merges to `main`. Deploying is a
  separate, deliberate step (`npm run cf:deploy`).

## Running it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run typecheck  # tsc --noEmit
npm test           # node --test suite (.mts files under test/)
npm run cf:preview # production Worker locally (localhost:8787)
```

Local development needs **no** database configured — the absence of
`DATABASE_URL` selects the PGlite driver (`.pglite/`).

## Documentation

| File | What it is |
|---|---|
| [`KAAMSOLV-BRIEF.md`](KAAMSOLV-BRIEF.md) | Master product / brand / engineering brief |
| [`DECISIONS.md`](DECISIONS.md) | Dated decision log (rebrand, hosting, launches) |
| [`kaamsolv-phase0-architecture.md`](kaamsolv-phase0-architecture.md) | Platform architecture rationale |
| [`infra/deployment.md`](infra/deployment.md) | Hosting, domain, secrets, deploy & migrations |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Production design-system standards |
| [`kaamsolv-tool-catalogue.md`](kaamsolv-tool-catalogue.md) | The tool catalogue, locked categories, build order |
| [`products/`](products/) | Per-product specs (QR, image kit, URL Shortener) |
| [`kaamsolv-design-system.html`](kaamsolv-design-system.html) | Original visual reference prototype (not production code) |

## Development process

Phase by phase: `Plan → Inspect → Implement → Test → Document → Report →
Approve → Commit → Next`. Each phase stops for approval before the next.
