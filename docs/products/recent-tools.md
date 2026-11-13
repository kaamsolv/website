# Recent and most-used tools

**Status (2026-11-14):** Part A (kept on the device) is **live** (committed as `e6986a4` on `main` and deployed 2026-11-14, version `92c417af`). Part B (a copy on the account for signed-in people) is **not built** and waits for the affiliate branch's migration. Decision record: [`../DECISIONS.md`](../DECISIONS.md).

## What it is

A person who has used a tool before sees it again, so they can pick up where they left off. No sign-in is needed and nothing is sent anywhere.

- **The bar** (`app/_components/recent/recent-bar.tsx`): a slim strip directly under the header, full width, one line (44px; 52px on touch). It scrolls away with the page. Left: a **Recent ⌄** button. Middle: chips (icon plus what you did, "Make an invoice"; up to 12). Right: **✕**.
  - **Where it shows:** the home page and `/tools` only (`BAR_ROUTES`). Never inside a tool, the signed-in workspace, sign-in or legal pages. Only for a device that has used a tool; a first visit looks exactly as before.
  - **Scrolling:** the chips stay on one line and scroll sideways when they do not fit: touch swipe, mouse wheel, small round arrow buttons for a mouse only, and Tab (each chip is a link that scrolls into view). A soft fade marks an edge that has more behind it. The page itself never scrolls sideways.
  - **The switch** opens a small panel: Recent or Most used (offered once any tool has 3 uses) and **Clear recent tools**. Escape or a click outside closes it.
  - **The ✕** hides the bar while you work elsewhere (a tab-only flag in session storage). **Every visit to the home page brings it back**, reload included.
  - **No jump:** a small script before first paint (`RECENT_BAR_SCRIPT`, in `app/layout.tsx` beside the theme script) marks the page `data-recent="1"` when the bar will show, so its space is reserved (`.recent-slot` in `globals.css`); if the guess is wrong the space closes up.
- **Search box:** with an empty field, "Recent" (up to three) comes first, then "Try one of these" fills to six. Typing still searches the whole catalogue.
- **Not built yet:** a "Your tools" row in the signed-in workspace menu (Part B).

## What is kept, and how

`app/lib/recent-tools.ts` (plain functions) and the hook `app/_components/recent/use-recent-tools.ts`.

- Local storage key `kaamsolv-recent-tools`: `{"v":1,"tools":[{"s":slug,"t":lastOpenedMs,"n":uses}]}`. A tool's catalogue name, when, and how many separate times. **Never** what was typed, uploaded or made.
- **Not a cookie.** The pre-built pages are served from Cloudflare without reading cookies, and the privacy page promises no cookies unless you sign in or accept analytics. Local storage keeps both true and costs nothing.
- Only **live catalogue tools** are kept or shown; anything else in storage is dropped on read. Unreadable, wrong-version or hostile stored data gives an empty list, never an error. Blocked or full storage does nothing, quietly.
- A **use** is a separate visit: opening the same tool again within 10 minutes moves it to the front but does not count again. **Most used** needs 3 uses. The list holds up to 80 tools (more than are live).
- It does **not** depend on the analytics choice: it is a convenience in the visitor's own browser.
- Recorded by `ToolOpen` (`app/_components/tool-open.tsx`), which every public tool page already mounts (the shared tool frame, QR, URL shortener, image tools), and by `RecentFromPath` in `WorkspaceShell` for `/app/invoices*` and `/app/qr*`.
- The privacy page lists it among the things kept on the device and mentions the Clear button.
- Shared pieces touched: `ScrollRow` gained `always` (one line that scrolls at every width, mouse-only arrows, edge fade; the default behaviour used by the QR type row is unchanged); `SiteHeader` renders the bar after the header; `ToolSearch` shows Recent.

## Part B: signed in, across devices (not built)

The same list saved on the account so it follows a person to another phone or laptop, and shown as "Your tools" in the workspace menu. Needs one small table (or one JSON column on a per-user row), two endpoints (read, and a merge-newest write that is rate-limited), merging the device list in on sign-in, a Clear that clears the account copy too, and a privacy-page line about the account copy. It adds a database migration, so it must be sequenced **after** `feat/affiliate-phase1` (which adds `0018`): take `0019`, and apply it on production with the atomic runner and a restore point (`infra/deployment.md`). Store the same fields only: slug, last, uses.

## Tests

`test/recent-tools.test.mts` (19: parsing, caps, uses, ordering, wording across midnight, workspace paths, blocked storage, the bar's routes, the closed flag, and the pre-paint script run against a stand-in page) and `tests/e2e/recent-tools.spec.ts` (25): first visit unchanged and no cookie; the bar fills newest first with action labels and sits directly under the header; home and `/tools` only; one visit is one use; the switch panel (Escape, outside click, Most used, Clear); the ✕ and the home page bringing it back; 12 tools scroll by arrow, wheel and keyboard on one line; no layout jump; Recent in the search box with the keyboard; corrupt, hostile and blocked storage; signed-in workspace pages count; the privacy text; and 375 / 360 / 320 px in light and dark with real touch emulation (52px bar, 44px targets, panel and close button on screen, no sideways scroll).
