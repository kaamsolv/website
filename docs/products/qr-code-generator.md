# KaamKit QR Code Generator — Product & Architecture

**Status:** Phase 1 (static QR) · **Route:** `/qr-code-generator` · **Branch:** `feature/qr-code`

Platform-wide decisions live in [`../kaamkit-phase0-architecture.md`](../kaamkit-phase0-architecture.md) and [`../DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md). This document is the product source of truth for the QR generator.

---

## 1. What it is

A **static** QR code maker: choose a type, fill in fields, see a live preview, optionally customise, download PNG or SVG. No account, no server-side encoding, no tracking.

**Core promise:** choose → customise (optional) → download → done.

---

## 2. Phase 1 scope (built)

### QR types

| Type | Encoded as |
|---|---|
| URL | Normalised `https://…` or `http://…` (exact destination — **not shortened**) |
| Text | Plain text |
| Wi-Fi | `WIFI:T:…;S:…;P:…;H:…;;` |
| Email | `mailto:` with optional subject/body |
| Phone | `tel:+…` |
| WhatsApp | `https://wa.me/{digits}` with optional `?text=` |
| vCard | `VERSION:3.0` contact card |

Default type: **URL**.

### Customisation

- Foreground / background colour (presets + custom picker)
- Transparent background (PNG/SVG)
- Download size: 256 / 512 / 1024 px
- Error correction: L / M / Q / H (default M; **forced H when a logo is present**)
- Optional logo upload (PNG/JPG/WEBP, max 500 KB; logo in PNG only)

### Downloads & share

- Download PNG (with logo when set)
- Download SVG (QR matrix only — no logo overlay)
- Copy encoded text
- Web Share API for PNG where supported

### Privacy

All encoding runs **in the browser**. Payloads (including Wi-Fi passwords) are **not** sent to KaamKit or third-party APIs and are **not** logged.

---

## 3. Explicitly deferred (not Phase 1)

- Dynamic / tracked QR codes
- URL shortening inside the QR tool
- Scan analytics, campaigns, accounts
- Saved QR history, cloud storage
- Database / Neon / API routes for QR
- Patterns, dot shapes, frames, gradients, templates
- Category pages as a dependency

---

## 4. Architecture — separation for future dynamic QR

```
User fields (per type)
    → canonicalPayload()     // validation + standard string (framework-free)
    → resolveEncodeTarget()  // Phase 1: identity; later: tracking URL
    → render (qrcode lib)    // SVG / canvas PNG
    → style (colours, EC, size, logo)
```

| Layer | Location | Phase 1 | Later |
|---|---|---|---|
| Payload types | `app/lib/qr/types.ts` | User field shapes | + `dynamic` mode flag |
| Validation | `app/lib/qr/validate.ts` | Per-type rules | Unchanged |
| Canonical string | `app/lib/qr/encode.ts` | WIFI/mailto/vCard/etc. | Unchanged |
| Encode target | `encode.ts` `resolveEncodeTarget()` | Same as canonical | KaamKit short URL |
| Renderer | `app/lib/qr/render.ts` | `qrcode` → canvas/SVG | Unchanged |
| Style | `app/lib/qr/style.ts` | Colours, EC, size | Unchanged |
| UI | `app/qr-code-generator/` | React client island | + “Make trackable” when product exists |

The UI and renderer should **not** need a rewrite when dynamic QR ships — only `resolveEncodeTarget()` and optional UI to opt into tracking.

---

## 5. Library

**`qrcode`** (soldair/node-qrcode) — lightweight, framework-independent encoder. Used from `render.ts` only; React components do not import it directly.

Not used: `qr-code-styling`, multiple QR libraries, external QR APIs.

---

## 6. Tool page structure

Matches other KaamKit flagship tools:

1. Site header  
2. Breadcrumb (Home → tool — **no** `/categories/business` dependency)  
3. Badge, H1, one-line intro  
4. Generator card (inputs left, preview right on desktop)  
5. How it works  
6. Good to know  
7. FAQ  
8. House `AdSlot` (outside task flow)  
9. Related tools  
10. Footer  
11. JSON-LD: `WebApplication` + `BreadcrumbList`

SEO: server `metadata` (title, description, canonical, OpenGraph, Twitter).

---

## 7. Catalogue

`app/lib/catalogue.ts` — `QR Code Generator` → `status: 'live'`, `url: '/qr-code-generator'`.

---

## 8. Known limitations (Phase 1)

- SVG download does not embed the logo (PNG does).
- vCard is v3.0, basic fields only.
- No scan analytics or edit-after-print for static codes.
- Contrast warnings are advisory; user can still pick low-contrast colours.

---

## 9. Future direction (not built)

When dynamic QR lands (shared with URL Shortener infrastructure per Phase 0):

1. `resolveEncodeTarget()` returns `https://kaamkit.com/{code}` instead of the raw URL.
2. Optional `QrCode` row + `link_id` in Postgres.
3. Scan events via the shared analytics/redirect path.

Until then, the static tool remains fully client-side.
