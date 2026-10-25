# Tracked QR codes

**Status:** built, not deployed (first slice, 2026-10-25). The static QR studio
([`qr-code-generator.md`](./qr-code-generator.md)) is unchanged and stays free,
no account. This adds an **optional** step for link-type codes: count the scans.

## What it is

A tracked QR encodes `kaamsolv.com/{code}` — a short link the signed-in user
owns — instead of the destination itself. A scan is a click on that link, so the
[URL Shortener](./url-shortener.md)'s redirect, click recording and bot filtering
are reused as they are. The destination never changes in this release.

**Trackable types:** Website (URL), WhatsApp (`https://wa.me/…`), Social, and
PDF/File link — the four whose QR content is an https link. Location is a
`geo:` URI, and Text / Wi-Fi / Email / Phone / SMS / Contact / Event / UPI are
not web links: a phone reads them directly, so there is nothing to redirect.

## What a user gets

| Where | What |
|---|---|
| Studio, signed out | "Sign in (it's free) to count scans." The QR works the same. |
| Studio, signed in | A **Count scans** panel: name it → **Save tracked QR**. The QR now holds the short link; preview and PNG / SVG / JPG / print are unchanged. Editing the link afterwards drops the tracking ("You changed the link — save again"), so a code never points somewhere it wasn't saved for. |
| `/app/qr` | My QR codes: name, type, scans, Paused, short link, "N of 3 tracked". Pause / resume / delete. |
| `/app/qr/:id` | The QR (download again), total scans, last scan, 30-day chart (days cut in the visitor's time zone, default Asia/Kolkata), where it goes, rename, pause, delete. |

**Free account: 3 tracked codes.** The limit counts codes (pausing doesn't free
a slot, deleting does). `qr_pro` (no limit) exists as a plan but nothing sells or
mentions it yet — grant by hand: `npm run account:grant -- <email> qr_pro --confirm`.

**A printed code never dies.** The redirect never looks at plans or
entitlements: losing a plan, or being over the free limit, leaves every saved
code redirecting and listed. Only *new* codes are limited. Deleting a code
deletes its link (its printed copies then show "not found") and its scans.

## Data (migration 0008, additive)

- `links.account_id` → FK to `auth_users` ON DELETE CASCADE (the column existed
  and was never written, so every earlier link is null/anonymous and untouched).
  Deleting an account now also removes its tracked links, QR rows and scans.
- `qr_codes`: `user_id`, `link_id` (unique, cascade), `name` (1–80), `kind`
  (url / whatsapp / social / file), `payload` + `design` jsonb (≤ 64,000 chars
  together). **The design never includes the logo** (up to 500 KB); the QR's
  content is identical without it.
- Seed: `free_account` → `qr_dynamic` limit 3; new plan `qr_pro` → unlimited.
  Account-wide hard cap 2,000 codes (anti-abuse, never shown).
- **Rollback** (Neon, only if reverting): see `infra/deployment.md`.

## Server

- `POST /api/qr` — signed in, same-origin, per-user rate limit (10/min, 100/day).
  The **destination is worked out on the server** from the cleaned payload (never
  taken from the request) and goes through the shortener's pipeline: URL
  validation → other-shortener refusal → Google Web Risk (fails open, like the
  shortener). One SQL statement checks the limit and inserts the link and the QR
  row (Neon over HTTP has no transactions), so a refused save leaves no orphan
  link. **Limit caveat:** two saves in the very same instant could each see room
  under Postgres's default isolation, so a free account can overshoot by a
  request; the rate limit bounds it and the hard cap is the ceiling (same pattern
  as saved invoices).
- `GET /api/qr`, `GET /api/qr/:id` (with `?tz=`), `PUT` (rename, pause / resume
  only), `DELETE`. Every query is scoped to the signed-in user; another user's id
  is a plain 404.
- Scans per day: `click_events` for the link, `device_class <> 'bot'`, cut with
  `AT TIME ZONE` (zone validated; fallback Asia/Kolkata), zero-filled. The total
  is `links.click_count`. Scans are **people who scanned, not unique visitors**
  (no IP, cookie or identifier is kept — see the privacy page).

## Not in this release (decided 2026-10-25)

Campaigns, UTM tags, breakdowns (country / device / OS / referrer), editing a
destination after printing, CSV export, a visible Pro tier, saving a logo with
the code, and the `click_events.os` column (it needs a privacy-policy change).
Also not built: pruning old scans, custom domains, bulk QR, QR landing pages.

## Code map

| Path | Role |
|---|---|
| `app/lib/qr/tracking.ts` | Trackable kinds, name / payload / design cleaning (logo dropped), time zone check, hard cap |
| `app/lib/qr/encode.ts` | `resolveEncodeTarget(canonical, trackedUrl?)` — the one place the short link is swapped in |
| `db/qr.ts` | Create (single statement), list, get, rename, pause, delete, daily scans |
| `app/api/qr/**` | The routes above |
| `app/qr-code-generator/_components/track-panel.tsx` | The studio panel |
| `app/_components/qr-account/` + `app/app/qr/**` | My QR codes, the detail page, the chart |
| `test/qr-tracking.test.mts`, `tests/e2e/qr-tracking.spec.ts` | Tests |
