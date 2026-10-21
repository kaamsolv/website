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
