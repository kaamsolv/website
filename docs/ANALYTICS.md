# KaamSolv — Analytics (GA4)

Status: built, **not deployed**. Decision: [`DECISIONS.md`](DECISIONS.md) (2026-10-25).
Rule of thumb: **no consent → no Google request, no cookie.** Anything that
changes what is collected must update `app/privacy/page.tsx` in the same change.

## How it works

| Piece | File |
|---|---|
| Loader, page views, outbound clicks, banner, Privacy-page control | `app/_components/analytics.tsx` |
| Consent + event helpers (`trackToolSuccess` …) | `app/lib/analytics.ts` |
| Consent state hook | `app/_components/use-consent.ts` |
| `tool_open` (server pages pass the catalogue slug) | `app/_components/tool-open.tsx` |
| "Live tool" success hook | `app/_components/use-tool-success.ts` |

- `NEXT_PUBLIC_GA_ID` unset (or not `G-…`) → `<Analytics />` renders nothing, every helper is a no-op, no banner.
- Set → banner until the visitor chooses. The choice is stored in `localStorage` key `kaamsolv-analytics` (`granted` / `denied`), not in a cookie.
- On accept: `gtag('consent','default', all denied)` → `update analytics_storage granted` → `config` with `send_page_view:false`, `allow_google_signals:false`, `allow_ad_personalization_signals:false`; then `gtag.js` is added via `next/script`. `ad_storage`, `ad_user_data` and `ad_personalization` are never granted.
- Withdraw (Privacy page): sets `ga-disable-<ID>` and deletes `_ga*` cookies. The already-loaded script stays until the next page load but is switched off.
- Every internal link is currently a plain `<a>` (a full page load), so each page gets its own `page_view`. If `<Link>` navigation is ever added, the `usePathname` effect already sends one `page_view` per route change (tested with `history.pushState`), and re-rendering on the same path sends none.
- Cost: no dependency; a few KB in the bundle. `gtag.js` comes from Google at runtime, only after consent.

## Events

All parameters are fixed labels. `tool_name` = catalogue slug, `tool_category` = category slug.

| Event | When | Parameters |
|---|---|---|
| `page_view` | Each page / route change. Not on `/app/*` (signed-in area). Path only — no query or hash. | `page_location`, `page_path`, `page_title` |
| `tool_open` | Once per tool page load | `tool_name`, `tool_category`, `tool_type`\* |
| `tool_success` | The tool did its job (see below) | `tool_name`, `tool_category`, `tool_type` |
| `tool_error` | A failure the visitor sees | the same, plus `error_type` (a short fixed code such as `convert_failed`, `network`, `rate_limited`, or a PDF error code) |
| `file_download` | A download from a tool page | `tool_name`, `tool_category`, `file_ext` (allow-list: png jpg jpeg webp avif svg pdf zip, else `other`) |
| `outbound_click` | Click on a link to another site | `link_domain` |

\* `tool_type` is `calculator`, `converter`, `generator` or `utility`. On `tool_open` it is sent only for pages that pass it (image converters, QR, shortener); the shared shell doesn't.

**What counts as `tool_success`**

| Tool type | Rule |
|---|---|
| Calculators (8) | First valid answer per page load (`Answer` in `everyday-calculators.tsx`; Salary uses it too), not per keystroke |
| Writing tools (4) | First time the box has text, once per page load |
| Lorem ipsum | Each press of "Generate new text" |
| Image converters (10), Image Compressor | Each finished conversion / compression |
| Resize Image to KB | First image that fits the target, once per page load |
| PDF tools (5) | Each finished job (`run()` in `pdf-workspace.tsx`). Caveat: Compress PDF with "no smaller" still counts as finished |
| QR Code Generator | Each download/save (QR is built live, so a download is the finished job) |
| URL Shortener | Each short link created |
| Invoice Generator | Each PDF made (download or preview) |

**Never sent:** file names or contents, anything typed or calculated, the links people shorten, invoice or account data, raw error messages, query strings, `/app/*` pages.

Not instrumented: `tool_use` (redundant with success + error), the `/pdf-tools` hub page (not a catalogue tool), `/tools`, the account area.

## Cloudflare Web Analytics

Cloudflare auto-injects `static.cloudflareinsights.com/beacon.min.js` (checked on the live site, 2026-10-25), which posts page timings to `/cdn-cgi/rum`. It is cookieless. We keep it and list it on the Privacy page. To stop it: Cloudflare dashboard → Web Analytics → disable for kaamsolv.com.

## Deploy

1. Create the GA4 property and copy the Measurement ID (`G-…`). Leave Google signals off in the property too.
2. `NEXT_PUBLIC_GA_ID` is read at **build** time (Next inlines it). Local deploy: `$env:NEXT_PUBLIC_GA_ID='G-XXXXXXX'; npm.cmd run cf:deploy` (or `.env.production`). Workers Builds: add it as a **build** variable. It is not a Worker secret, and changing it needs a new build.
3. In the GA4 data stream → **Enhanced measurement**, turn off *Page changes based on browser history events*, *Outbound clicks*, *File downloads* and *Scroll* (or the whole toggle). Our own events cover outbound clicks and downloads; leaving them on would double-count, and the history one can send an extra `page_view` that our `send_page_view:false` doesn't stop.
4. Check the bundle gzip stays under the free-plan 3 MB (measured 2,303 KiB with the ID set, 2026-10-25; check with `npx wrangler deploy --dry-run --outdir <dir>`).
5. Open the live site in a private window: the banner shows, and no `googletagmanager` request appears in the Network tab until "Accept analytics".

**Rollback:** redeploy without `NEXT_PUBLIC_GA_ID` (or `wrangler rollback`). The code goes completely inert. The Privacy page still describes analytics, so revert that too if analytics is removed for good.

## Testing

- Automated: `npx playwright test analytics`, run two ways (use `KK_E2E_PORT` if :3000 is taken).
  - Default: analytics off — no banner, no Google requests, no cookies.
  - `KK_E2E_GA_ID=G-E2ETEST1`: the consent flow with `gtag.js` stubbed, so nothing reaches Google. Checks: nothing before a choice; "No thanks" persists; Accept gives one `page_view` per page, the events and parameters, no personal values, outbound domain only; withdrawing clears cookies; the banner at 375 px in light and dark.
- Manual on production (GA4 **Realtime**): accept the banner → you appear with a `page_view`; open a tool → `tool_open`; use it → `tool_success`; download → `file_download`; click an external link → `outbound_click`; reload after choosing "No thanks" → nothing new.
- **DebugView** only shows events sent with `debug_mode`. To use it, install the Google Analytics Debugger Chrome extension (no code change).

## Limits

- Visitors who decline, or who block `googletagmanager.com` with an ad blocker, aren't counted. Expect GA4 to under-count. Cloudflare Web Analytics is cookieless and gives a rougher total.
- India's DPDP Act: consent is asked before Google Analytics runs and can be withdrawn. This is not legal advice; have the Privacy page reviewed.
- Short-link redirects aren't page views and aren't sent to GA; the shortener keeps its own first-party click counts.
- Private browsing or cleared storage loses the saved choice, and the banner shows again.
