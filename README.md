# KaamSolv — Phase 1 design system (production build)

This replaces the CDN-based prototype (`kaamsolv-design-system.html`) with a real
Next.js project where **Tailwind CSS is installed and compiled at build time**.
Nothing in this app calls `cdn.tailwindcss.com`, and fonts are self-hosted via
`next/font` instead of a runtime request to `fonts.googleapis.com`. No visual
design changed — every token, class name, and component behaves the same as
the prototype approved in Phase 1.

## Stack

- **Next.js 16** (App Router)
- **Tailwind CSS v4**, wired in as a PostCSS plugin (`@tailwindcss/postcss`) —
  this is the current recommended setup for new projects; v4 replaced the old
  `tailwind.config.js` approach with CSS-first configuration.
- **React 19**
- **TypeScript**

## Project structure

```
kaamsolv-app/
├── package.json
├── postcss.config.mjs        ← wires Tailwind into the build, no CDN
├── next.config.mjs
├── tsconfig.json
└── app/
    ├── layout.tsx             ← self-hosted Sora + Inter via next/font
    ├── globals.css            ← @import "tailwindcss" + all design tokens
    └── page.tsx                ← the Phase 1 design system, ported to JSX
```

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build     # produces a static compiled CSS file — no runtime CDN call
npm run start      # production server
```

Open the Network tab while running `npm run build && npm run start`: there is
no request to `cdn.tailwindcss.com` or `fonts.googleapis.com`. All CSS ships
as one compiled, minified file from your own domain.

## What changed vs. the CDN prototype — and what didn't

**Changed (tooling only):**
- Tailwind config moved from an inline `<script>tailwind.config = {...}</script>`
  to `app/globals.css`'s `@theme inline { ... }` block. Same token names, same
  values.
- Google Fonts `<link>` tags replaced by `next/font/google` in `app/layout.tsx`
  (same two families, same weights — now self-hosted).
- The prototype's `<style>` block moved into `app/globals.css`, below the
  theme block — same rules, same selectors.
- The prototype's `<script>` (vanilla DOM logic for theming, tabs, modal,
  toasts, drag-and-drop, the QR type picker, etc.) moved into a single
  `useEffect` in `app/page.tsx`, unchanged in behavior — it's the same
  `document.getElementById` / `addEventListener` code, just running inside a
  React component's lifecycle instead of a raw `<script>` tag.
- One pre-existing bug fixed in passing: the example modal used the Tailwind
  class `z-70`, which isn't a real utility (Tailwind's default scale stops at
  `z-50`) — it compiled to nothing in both the old CDN build and this one.
  Changed to `z-[70]` so the modal actually stacks above the sticky header.
  This is a correctness fix, not a design change — the intent was always for
  the modal to sit on top.

**Not changed:**
- Every color token, hex value, spacing scale, radius, shadow, and font choice.
- Every component's markup, classes, and interactive behavior.
- The light/dark/system theme mechanism (still CSS-variable-driven via
  `data-theme` on `<html>`, not Tailwind's `dark:` variant — this app never
  used `dark:` classes, so there was nothing to migrate there).

## Still open from Phase 1

This message only covered the build-tooling swap. Two decisions from the
last Phase 1 report are still awaiting your call and are unrelated to this
change:
1. Approve the `/documents/` and `/writing/` route segments in the tool
   catalogue.
2. Resolve whether "Salary Calculator" vs. "Salary/CTC Calculator" and
   "Resume Generator" vs. "Resume Builder" are the same tool or genuinely
   different ones.

## Next step

Once you're happy this renders identically to the CDN prototype, this is
ready to sit under Phase 2 (Website Shell) as the actual codebase, rather
than a throwaway reference file.
