# Tracked QR codes

**Status:** live (first slice, deployed 2026-10-25). The static QR studio
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

## QR workspace (built 2026-10-26, not deployed)

`/app/qr` is now a small workspace. Pro parts are checked with the existing
`can()` keys **on the server** (a free account's responses omit them) and are
hidden — never a teaser or an upgrade button. The 25 Oct split stands.

| Page | Everyone (free account) | QR Pro (`qr_pro`, hidden until payments) |
|---|---|---|
| **Dashboard** `/app/qr` | Codes, active, paused, scans **all time**, scans **this month**, a 7 / 30-day chart, top codes, newest, recent activity | Campaigns count, the 90-day range, "Start a campaign" |
| **All QR codes** `/app/qr/codes` | Search, filters (status, type, made), sort, 25 per page; Open, **Download** PNG, **Duplicate**, Pause / Resume, confirmed Delete | Campaign filter and labels |
| **Scan analytics** `/app/qr/analytics` | Totals, trend (7 / 30 days), scans by code, last scan | 90 days; country, device, referring site (`qr_breakdowns`); campaign filter and scans by campaign (`qr_campaigns`) |
| **Campaigns** `/app/qr/campaigns[/id]` | — | Create, edit, delete; assign codes; totals (`qr_campaigns`) |
| **Reports & exports** `/app/qr/exports` | — | CSV of codes or of scans (`qr_export`) |

- **One definition of a scan:** a `click_events` row with `device_class <> 'bot'`.
  That is what `recordClick` adds to `links.click_count`, and neither is written
  while a code is paused — so the all-time total and any date range agree (a
  unit test asserts it). Counts are scans, **not unique visitors**; a code's
  history starts the day it was saved; "all time", "this month" and "last N
  days" are labelled everywhere. We record time, approximate country (from the
  network), device type and referring site — **no OS, city, IP or identifier**.
- **Limits:** every row in the library is a tracked (dynamic) code, so
  `qr_dynamic` (free: 3) counts exactly the stored library, and pausing doesn't
  free a slot. The 2,000 cap is a separate anti-abuse ceiling (matters only for
  `qr_pro`). **Duplicate** goes through the same save path: same rate limit,
  same `qr_dynamic` limit, and the destination is **worked out and Web
  Risk-screened again** (`app/lib/qr/destination.ts`, shared with Save); the
  original is untouched.
- **A campaign only groups codes** (`qr_codes.campaign_id`, SET NULL). Assigning,
  moving, renaming or deleting one never changes a destination, status or scan;
  a code can be in one campaign; ownership of both is checked in one statement.
  Names are unique per account (any case); 50 campaigns max. Campaign totals sum
  each code once.
- **Queries:** `GET /api/qr/stats` runs a handful of grouped queries bounded by
  the range and the user's links (no per-code lookups, no full history); the
  list and filtering use the one list the server returns.
- **CSV:** codes or scans, formula-safe cells, your rows only, bots left out,
  scans capped at 50,000 (413 with a "pick a shorter range" message). No IP.
- Migration `0009_qr_campaigns.sql` (additive; rollback in `infra/deployment.md`).

## Not built (decided)

Folders / collections, brand presets, QR settings, UTM tags, editing a
destination after printing, an OS breakdown (needs a privacy-policy change),
saving a logo with a code, scheduled reports, unique-visitor counts, city-level
location, pruning old scans, custom domains, bulk QR, QR landing pages.

## Code map

| Path | Role |
|---|---|
| `app/lib/qr/tracking.ts` | Trackable kinds, name / payload / design cleaning (logo dropped), time zone check, hard cap |
| `app/lib/qr/encode.ts` | `resolveEncodeTarget(canonical, trackedUrl?)` — the one place the short link is swapped in |
| `db/qr.ts` | Create (single statement), list, get, rename, pause, delete, daily scans |
| `app/api/qr/**` | The routes above |
| `app/qr-code-generator/_components/track-panel.tsx` | The studio panel |
| `app/lib/qr/campaigns.ts`, `app/lib/qr/destination.ts` | Campaign rules and ranges; the destination check Save and Duplicate share |
| `db/qr-stats.ts`, `db/qr-campaigns.ts` | Scan statistics and exports; campaigns |
| `app/api/qr/{stats,campaigns,export}/…`, `app/api/qr/[id]/duplicate` | The workspace routes |
| `app/_components/qr-account/` + `app/app/qr/**` | The dashboard, All QR codes, campaigns, analytics, exports, the detail page, the chart |
| `test/qr-tracking.test.mts`, `test/qr-workspace.test.mts`, `tests/e2e/qr-tracking.spec.ts`, `tests/e2e/qr-workspace.spec.ts` | Tests |
