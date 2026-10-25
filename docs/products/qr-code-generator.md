# KaamSolv QR Code Generator — Product & Architecture

**Status:** Phase 1 + 1.5 + 2 (QR Studio) · **Route:** `/qr-code-generator` · **Branch:** `feature/qr-code`

Platform-wide decisions live in [`../kaamsolv-phase0-architecture.md`](../kaamsolv-phase0-architecture.md) and [`../DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md). This document is the product source of truth for the QR generator.

---

## 1. What it is

A **static** QR code maker with **QR Studio** styling: choose a type, fill in fields, optionally style with presets and frames, preview, download. No account, no server-side encoding, no tracking.

**Optional tracking (2026-10-25):** signed-in users can save a link-type code as a *tracked* QR that counts scans — see [`qr-tracking.md`](./qr-tracking.md). Everything below is unchanged for the free, no-account path.

**Core promise:** choose → style (optional) → download → done.

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

---

## 2.5. Phase 1.5 scope (built)

Additional **static** QR types on the same `/qr-code-generator` page. No new catalogue entry, no per-type SEO pages.

### New QR types

| Type | Encoded as |
|---|---|
| SMS | `sms:+…` with optional `?body=` |
| Location | RFC 5870 `geo:lat,lng` (optional `?q=` label) |
| Event | iCalendar `VEVENT` (floating local datetimes) |
| Social | Direct HTTPS profile/page URL (platform is UI context only) |
| PDF / File | Direct HTTPS file URL (label is UI-only, not in QR) |
| UPI Payment | `upi://pay?pa=…&cu=INR` with optional `pn`, `am`, `tn` |

### Phase 1.5 notes

- **Location:** client-side coordinate entry; optional Google Maps link parsing to fill lat/lng. No geocoding API.
- **Event:** `datetime-local` values encoded as entered — no silent timezone shifts.
- **Social:** Instagram, Facebook, LinkedIn, X/Twitter, YouTube — URL validated, not scraped.
- **PDF / File:** URL only — no upload, proxy, or server inspection.
- **UPI:** generic NPCI-style URI; KaamSolv does not process or verify payments.

Payload helpers live in `app/lib/qr/payloads/` (`sms.ts`, `location.ts`, `event.ts`, `social.ts`, `file.ts`, `upi.ts`) and are wired through `canonicalPayload()` in `encode.ts`.

### Privacy (Phase 1 / 1.5)

All encoding runs **in the browser**. Payloads (including Wi-Fi passwords) are **not** sent to KaamSolv or third-party APIs and are **not** logged.

---

## 3. Phase 2 scope — QR Studio (built)

Visual design layer on top of the static QR generator. **Design only** — presets do not change QR payload or type.

### Design model (`QrDesign`)

| Field | Options |
|---|---|
| Module shape | Square, Rounded, Dots |
| Eye / finder shape | Square, Rounded |
| Colours | Solid fg/bg, transparent background |
| Logo | Optional, centered, S / M / L |
| Frame | None, Border, Scan Me, Pay Here, View Menu, Visit Website, WhatsApp Us |
| CTA text | Editable on CTA frames only (max 24 chars) |
| Error correction | L / M / Q / H — **forced H when logo present** |
| Quiet zone | Minimum 4 modules (not user-shrinkable) |

### Presets (design configurations)

Classic · Minimal · Business · Payment · WhatsApp · Restaurant

Presets apply colours, module/eye shapes, and frame defaults. They do **not** switch QR type (e.g. Payment preset does not convert a URL to UPI).

### Exports

| Format | Notes |
|---|---|
| PNG | Full artboard — modules, logo, frame, CTA |
| SVG | Same visual parity as PNG |
| JPG | Transparency flattened to white, quality ~0.92 |
| High-res | 256 / 512 / 1024 / 2048 / 4096 px (4096 capped on mobile) |
| Print | Lightweight print view — no PDF dependency |

Also: copy encoded text, Web Share (PNG) where supported.

### Scanability

`scanabilityReport(matrix, design)` returns blocks and warnings. Hard blocks prevent preview/export for unsafe combinations (contrast, invalid colours, excessive logo, quiet zone). Warnings cover transparent backgrounds, dot modules, small export sizes, long CTA text.

### Architecture (Phase 2 pipeline)

```
QR Content (QrPayload)
    → canonicalPayload()
    → resolveEncodeTarget()     // identity today; tracking URL later
    → createMatrix()            // qrcode package — matrix only
    → QrDesign + scanability
    → KaamSolv compositor        // canvas + SVG from same layout
    → PNG / SVG / JPG / Print
```

| Layer | Location |
|---|---|
| Content / encode | `encode.ts`, `payloads/*`, `validate.ts` |
| Matrix | `matrix.ts` |
| Design | `design.ts`, `presets.ts`, `frames.ts` |
| Scanability | `scanability.ts` |
| Compositor | `compositor/*` |
| Export | `export.ts`, `render.ts` (client facade) |
| UI | `qr-studio.tsx`, `qr-preview.tsx`, `qr-download.tsx` |

`resolveEncodeTarget()` is unchanged in concept. Dynamic QR later only swaps the string passed to `createMatrix()`.

---

## 4. Explicitly deferred (not Phase 2)

- ~~Dynamic / tracked QR codes~~ — first slice built (2026-10-25): [`qr-tracking.md`](./qr-tracking.md)
- Campaigns, UTM tags, scan breakdowns, editing a destination, CSV export (later releases)
- ~~Accounts, saved QR history, database / API routes~~ — tracked codes only, see above
- Gradients on QR data modules
- Independent eye colours
- Downloadable PDF (print view instead)
- Template marketplace, user-uploaded frames
- AI QR generation, bulk QR

---

## 5. Library

**`qrcode`** (soldair/node-qrcode) — matrix generation via `QRCode.create()`. Visual output is drawn by the KaamSolv compositor, not `qrcode`'s built-in renderer.

Not used: `qr-code-styling`, `jspdf`, external QR APIs.

---

## 6. Tool page structure

Matches other KaamSolv flagship tools:

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

## 8. Known limitations

- **Phone testing in `npm run dev`:** Next.js 16 blocks dev JS from LAN IPs unless the PC’s IP is listed in `next.config.mjs` → `allowedDevOrigins`. Update the IP after DHCP changes and restart the dev server. For a closer-to-production check, use `npm run build` + `npm run start`.
- vCard is v3.0, basic fields only.
- Event QR uses floating local times — calendar apps may interpret timezone differently.
- UPI QR compatibility varies slightly by payment app; amount formatting uses two decimal places.
- File/PDF QR type requires a publicly accessible URL — KaamSolv does not host files.
- Dot-style modules may scan less reliably on some devices — test before print.
- No scan analytics or edit-after-print for static codes.
- Print uses the browser print dialog — not a downloadable PDF file.

---

## 9. Future direction (not built)

Built as the first slice (see [`qr-tracking.md`](./qr-tracking.md)):

1. `resolveEncodeTarget(canonical, trackedUrl?)` returns `https://kaamsolv.com/{code}` for a saved tracked code, the raw payload otherwise.
2. `qr_codes` row + `link_id` in Postgres.
3. Scan events via the shared redirect and click path.

Still to come: campaigns, UTM, breakdowns, editing a destination, export. The static tool remains fully client-side and needs no account.
