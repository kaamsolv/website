# KaamSolv — Design system in production

**Status:** Living. Started as the Phase 1 reference (`kaamsolv-design-system.html`),
now being translated into real Next.js/Tailwind code section by section. Updated: Phase 2
(homepage).

This document records decisions that are now **standards for the whole site**, not
one-off homepage choices. The visual language itself (colour, type, spacing, cards,
states) still lives in the Phase 1 reference and `app/design-system/`.

---

## 1. Tokens and theming — unchanged

- Brand hues (`navy`, `coral`, `yellow`, `teal`, `purple`) are literal and constant
  in both themes. Defined in `app/globals.css` under `@theme inline`.
- Semantic roles (`canvas`, `surface`, `raised`, `ink`, `strong`, `muted`, `faint`,
  `hair`, `wash`, `chip`, plus the `*x` accent tint/text pairs) resolve to CSS
  variables that flip per theme. **Use the semantic classes** (`bg-surface`,
  `text-muted`, …), never a raw hex, so a component themes for free.
- `text-faint` is for **icons, placeholders and disabled state only** — it does not
  meet WCAG AA as body text. Real text uses `text-muted` or stronger.
- **Coral and teal as small text** use the semantic accent tokens (`text-coralx-600`, `text-tealx-600`), never the constant hue classes. In the light theme these resolve to the darker text shades (coral `#B93C15`, teal `#1C7468`, both about 5.6:1 on white); in dark to `#FF8F68` and `#4CD9C6`. Brand fills (`coral-500`, `teal-500`) do not change. `test/contrast.test.mts` checks every pairing against `globals.css`.

## 2. Theme selection — how it works now

- Preference is stored in `localStorage['kaamsolv-theme']` as `light` | `dark` |
  `system`. `system` (the default) removes `data-theme` and lets the
  `prefers-color-scheme` media query decide.
- A tiny **blocking inline script in `app/layout.tsx`** applies a stored
  `light`/`dark` choice before first paint, so the theme never flashes.
- `app/_components/theme-toggle.tsx` is the shared control (a 3-way radiogroup).
  It renders `system` on the server and syncs to the stored value on mount, so
  there is no hydration mismatch (`<html suppressHydrationWarning>`).

## 3. Fonts

`next/font/google`, self-hosted at build time — **no runtime request to
`fonts.googleapis.com`**. Families:

| Variable | Family | Weights | Use |
|---|---|---|---|
| `--font-sora` → `font-display` | Sora | 600/700/800 | display + interface headings |
| `--font-inter` → `font-sans` | Inter | 400/500/600/700 | body + UI |
| `--font-caveat` → `font-hand` | Caveat | 600/700 | **marketing flourish only** — sticky-note lines, "Work smart." Not approved for tool UI. |

Because Sora only ships 600–800, headings use `font-semibold`/`font-bold`/
`font-extrabold` — never `font-medium` on a Sora element.

## 4. Layout primitive

`.kk-container` (in `globals.css`) is the one page-width wrapper: `max-width: 75rem`,
auto margins, responsive inline padding (20 → 24 → 32px). Every full-width section's
content aligns to it. Don't reinvent per-section max-widths.

## 5. Page composition rhythm (marketing pages)

Alternate `bg-surface` and the default `bg-canvas`; separate same-background
sections with a single `border-hair` hairline and generous vertical padding
(`py-16 sm:py-20`). Bookend with a strong colour band (`bg-coral-500`) for the
closing call to action. No heavy dividers, no full-bleed gradients.

## 6. Cards — one system

Tool cards **and** category cards use the same shell: `rounded-xl2 border
border-hair bg-surface`, a `h-1` category-colour strip on top, icon tile in the
category's `*x-100 / *x-600` tint pair, Sora-bold name, `text-muted` blurb.
Hover: `-translate-y-0.5` + `shadow-lift`. This replaces the earlier idea of
full-bleed tinted category panels — those go muddy in dark mode.

### 6a. The PDF directory variant (/pdf-tools)

`app/_components/pdf/pdf-tool-card.tsx` (`PdfToolCard`, `PopularCard`, `PdfSoonCard`) uses the card shell above **unchanged**
(rounded-xl2, hairline border, accent strip, tinted icon tile, Sora-bold name, muted blurb, hover lift, coral focus ring,
dashed "Coming soon"). It exists because `ToolCard` is fixed to the catalogue *category*, and every PDF tool is in "Documents"
(one purple, one icon, everywhere). Two deliberate differences:

- **Accent per PDF section**, from the same `ACCENT` map: Organise purple, Compress coral, Convert teal, Secure & Enhance yellow, Scan & Extract navy.
- **One icon per task** (`pdf-icons.tsx`, same 24px / 2px outline language as `icons.tsx`).
- On phones the card lies on its side (icon beside the words) so a 14-tool directory isn't a mile long; from `sm` it stands like `ToolCard`.

Directory layout (round 2): each group is a heading row (icon, title, count, one line) then a full-width card grid (2 across on a tablet, 3 on a desktop, one lying-down card per row on a phone). A short last row stretches to share the row, so there's never a hole. A group with a single tool gets one wide feature card (`PdfFeatureCard`: the catalogue blurb plus the group's plain-words note, nothing extra).

Everything else (section headings, popular row, hero) is composition built from the existing tokens, `kk-container`, `kk-dotgrid` and `kk-rise`.
The page's data comes from the catalogue, so a tool that isn't live there cannot appear as a link (`app/lib/pdf/hub-data.ts`, tested in `test/pdf-hub.test.mts`).
`ToolPageShell` gained two optional slots (`hero`, `afterHero`) for pages with their own top; every other tool page renders exactly as before.

## 6b. UI 2.0: two UI languages (public and application)

One brand (navy and coral, Sora and Inter, the same tokens, light and dark), two frames:

- **Public UI** (home, discovery, tool pages, SEO pages): `MarketingShell` (skip link, header, page, footer; `app/_components/shell/marketing-shell.tsx`) and `ToolPageShell`. Spacious, editorial. `ToolPageShell` takes `stage` for a tool that is really an application (invoice editor, QR generator, PDF tools): a tinted work area and a compact heading, same page and SEO content.
- **Application UI** (signed-in invoice and QR management): `WorkspaceShell` (`shell/workspace-shell.tsx` + `workspace-chrome.tsx`): compact top bar (logo, application name, All tools, theme, Help, account), a sidebar that is a drawer below `lg`, full-width content, no marketing footer. It does not check who you are: each page keeps its own `getCurrentUser` + redirect, `force-dynamic` and `noindex`. `AccountShell` is a thin wrapper over it (`workspace` pages) and keeps its exports; `WorkspaceNav` (entitlement-aware) is the sidebar (`stacked` mode).
- **Applications** (`app/lib/apps.ts`): the few substantial products (Invoice Generator, PDF Bundle, QR Studio) shown larger on the homepage and in the Products menu. Separate from `Tool`; an app shows only while the catalogue says its tools are live.
- **Products menu** (`shell/products-menu.tsx`): an accessible disclosure (click, Escape, outside click; no ARIA menu) with categories, featured products and popular tools plus a search that reuses `searchTools`. Only live tools are links. A phone gets an accordion in the mobile menu. It replaced the "Tools" and "Categories" header links.
- `BTN`, `PRIMARY`, `SECONDARY`, `INPUT` now live in `app/lib/ui-classes.ts` and are re-exported from `account-shell.tsx`.
- **Workspace menu (frozen 2026-11-13):** the sidebar lists **Products** (`app/lib/products.ts`) in four looks: *Pro* (normal row, teal chip, its pages open under it), *Free* (you are inside a product you have not subscribed to: its free pages plus an "Unlock … Pro" line), *Upgrade* (highlighted peach row with a coral chip, opens `/app/products/<slug>`), *Soon* (highlighted, dashed chip, no plan yet). Then Shared, Plans and billing, Account. Pro-only pages stay hidden for free accounts. `/app/products/<slug>` lists what the plan gives and what stays free, with Subscribe going to Plans and billing; a product with no plan has no subscribe button. Invoices and QR codes open in the workspace (`/app/invoices/editor`, `/app/qr/new`); the public pages stay anonymous.
- **QR Pro page** (`/app/products/qr`, `qr-pro-page.tsx`): the one product page with its own layout (the others use the generic page; the "also sold together as a bundle" line is part of the generic page and is untouched). Heading "QR Pro", the top bar still says "QR codes". One memorable visual, the **specimen** (`qr-pro-specimen.tsx`): a static QR code (`https://kaamsolv.com/qr-code-generator`, precomputed in `app/lib/qr/sample-report.ts` and tested against the generator) beside a scan report made from the same square module, with every number labelled *Illustrative sample*. Price and "Subscribe to QR Pro" appear only when `GET /api/billing/status` says payments are configured and the plan has a price (`app/lib/billing/plan-price.ts`); otherwise the page says subscriptions aren't available yet. The free path ("Keep using free QR codes" to `/app/qr`, "Make a free QR code" to `/app/qr/new`) is visible in every state. The copy lives in `app/lib/qr/pro-facts.ts` and omits the anti-abuse ceilings, "no ads", bundle pricing and yearly savings on purpose.
- **Share** (`share-bar.tsx`, `share-tool.tsx`, both on `use-share.ts`): every tool page has the "Pass it on" card after the tool (the QR generator, URL shortener and image converters were missing it). The main application-style tools also get a compact **share row** (WhatsApp in WhatsApp green via `WHATSAPP_BUTTON_COMPACT`, Copy link, and the phone's share sheet where there is one) on the breadcrumb row so it is on the first screen: the `stage` pages (invoice, PDF tools), the QR generator, the URL shortener, the image converters and the image compressor and resizer (`quickShare` on `ToolPageShell`). Short calculators keep just the card. Below `sm` the row is icon-only (still 44px and named).
- **Scrolling chip rows** (`scroll-row.tsx`): the QR type, preset and frame rows wrap from `md`; below it they scroll by touch, mouse wheel and an edge arrow, and Tab brings a chip into view.
- **Polish pass (2026-11-14).** One coral action per screen: the header search is a quiet field (no coral button) and "Suggest a tool" is an outline everywhere except the homepage's first screen. Tool-page headers lose the "Category · Free tool" badge row; the category is a breadcrumb crumb (`Home › Business › Tool`, linking to that group on `/tools`). House promos (`AdSlot`) are a quiet labelled strip on the wash surface, not a gradient billboard. Shared pieces: `Skeleton` (the one loading block), `Notice` (the one "couldn't load" block; same words and role as before, no new actions), `ProductChip` (Pro / Free / Soon, the same label on the hub and in the menu), card variants `CARD` / `CARD_QUIET` / `CARD_FEATURE` in `ui-classes.ts`, and a neutral disabled style (muted fill and text, no faded coral) in `BTN`. Controls that were 36 to 40px grow to 44px on touch screens (`pointer-coarse:` variants) and stay dense with a mouse.
- **Homepage hero.** Search and the headline on the left; on the right a "main products" panel (`home/hero-products.tsx`): Invoice Generator, PDF Bundle and QR Studio, each with its own drawing, a sentence and its action, plus "Explore all products" (to `/tools`). The products are not repeated as chips, quick links or in Popular tools (`appOwnedSlugs()` in `apps.ts`).
- PDF tool pages: `PdfStage` frames the unchanged workspace with a sidebar of the live PDF tools (a disclosure on phones).

## 7. Motion

- One entrance only, on the hero (`.kk-rise`, staggered). Everything else is
  hover/focus feedback and the search popover.
- `prefers-reduced-motion: reduce` removes `.kk-rise` and smooth scrolling
  entirely (`globals.css`). The static layout must stand on its own — it does.

## 8. Search

`app/_components/tool-search.tsx` is the shared tool-finder: a full ARIA combobox
(arrow keys, Enter, Escape; `role="listbox"`/`option`; `aria-activedescendant`).
It reads `app/lib/catalogue.ts` and ranks by match position. Empty field shows the
popular tools rather than nothing. Used in the hero and (after scroll) in the header.

## 9. Catalogue data

`app/lib/catalogue.ts` is the homepage-facing slice of
`docs/kaamsolv-tool-catalogue.md`: 10 locked categories + 60 tools with
`status: 'live' | 'planned'`, keywords, and a `popularRank`. **The homepage never
presents a `planned` tool as usable** — cards carry a "Soon" tag and links land on
the shared `app/not-found.tsx` ("that one's not built yet") until the route exists.
When a tool ships, flip its `status` to `live`.

## 10. Advertising

`app/components/AdSlot.tsx` (from Phase 1) is the only ad surface. One house-ad
placement on the homepage, above the footer, outside every task flow. No third-party
script loads until Ad Manager/consent is actually approved — see the file header.

## 11. Tool pages (flagship tools)

The URL Shortener and QR Code Generator establish the flagship tool-page pattern:

- Server page: `metadata`, breadcrumb, badge, H1, supporting sections, house `AdSlot` below the task flow, related tools, JSON-LD.
- Client island: the interactive tool only (`_components/` under the route).
- Catalogue: flip `status` to `live` when the route works.

QR reference components in `app/design-system/` remain **provisional**; production UI lives at `/qr-code-generator`.

## 12. SEO baseline for a page

Server-rendered `metadata` (title, description, canonical, OpenGraph, Twitter) via
the Metadata API; `viewport` export for `themeColor`/`colorScheme`. Structured data
only when it is accurate — the homepage emits `Organization` + `WebSite` (no
`SearchAction`, because there is no search-results page yet).

---

## 13. Choice controls and buttons

**Use `Segmented` / `Chips` from `app/_components/choice.tsx` for every single
choice.** Never hand-roll a selected state.

- **Segmented** — a joined bar for switching a tool's *mode* (Add / Remove GST,
  Years / Months, Crop / Fit). 2–3 short options.
- **Chips** — separate pills for picking a *value* (GST rates, KB sizes, cases,
  tip %). The selected chip shows a ✓, so selection never relies on colour.
- Selected = `bg-activebg text-activetext` (theme-aware: navy on light,
  near-white on dark). **Never `bg-navy-900` for a selected state** — in dark
  mode it is almost the same colour as unselected (measured 1.1 : 1). With the
  tokens, selected vs unselected is ≈ 14 : 1 in both themes.
- Unselected chips sit on `bg-wash` with a hairline border so they read as
  tappable in dark mode.
- **Hover never changes a selected option.** Each hover colour has a
  `peer-checked:hover:` twin that restores the selected colours (otherwise
  `hover:text-ink` made the selected text the same colour as its background).
- Native radio inputs inside `fieldset` + `legend` (screen readers announce the
  group; arrow keys move). Use `hideLegend` only when a visible label is
  already above.
- Touch targets ≥ 40 px (`h-10` / `min-h-10`).
- Action buttons are pills (`rounded-full`); text fields and selects are
  rounded rectangles (`rounded-lg`).
- QR Studio chips predate this and use the same tokens via `aria-pressed`.

## Open decisions (unchanged from earlier phases)

1. Approve the `font-hand` (Caveat) addition beyond marketing pages, or keep it
   scoped to them.
2. `/documents/` and `/writing/` route segments (from the tool catalogue).
3. "Salary Calculator" vs "Salary / CTC Calculator", "Resume Generator" vs
   "Resume Builder" — one tool each or two.
