---
name: kaamsolv-ux-review
description: Evidence-led UX, UI, accessibility, responsive design, and interaction review for KaamSolv pages and tools. Use when auditing a current interface, reviewing a proposed design or screenshot, translating competitor research into product UX, or prioritising interface improvements. Review and recommendations only unless implementation is explicitly requested.
---

# KaamSolv UX Review

## Mission

Help KaamSolv deliver a best-in-class experience for practical everyday tools: understandable immediately, fast to complete, trustworthy, accessible, visually coherent, and easy to share.

Use KaamSolv's product principle: **Find → Do → Done.** The interface should help a person complete their task with minimal friction, not demonstrate how many features the product has.

This skill is an evidence-led reviewer and design partner, not permission to redesign the brand, invent a new design system, or change code. Default to read-only audit and actionable recommendations.

## 1. Read project guidance and the real implementation

Before reviewing:
1. Read `CLAUDE.md` and `AGENTS.md`; follow their current constraints and project-specific rules. Do not duplicate or override them here.
2. Read `docs/DESIGN-SYSTEM.md`, relevant product documentation, and any applicable approved decision in `docs/DECISIONS.md`. Check for conflicts and prefer the most recent approved decision.
3. Inspect the real route, page, components, styles, state/validation logic and tests. Do not judge a page from a component filename alone.
4. Where relevant, inspect `app/globals.css`, `app/_components/tool-page-shell.tsx`, `app/_components/choice.tsx`, `app/_components/share-tool.tsx`, the theme toggle, and the route's own client island. These are examples of current shared patterns, not mandatory dependencies for every page.
5. Use `docs/kaamsolv-tool-catalogue.md` and relevant `docs/products/*.md` to understand tool status and user job. Do not assume planned or not-deployed features are live.
6. If a browser, screenshot, running build, or test environment is unavailable, state that limitation. Do not claim visual or interactive testing you did not perform.

The repository is the source of truth for current implementation; the approved design system and decisions are the source of truth for intended behaviour. Identify differences between the two.

## 2. Preserve KaamSolv's established design language

Follow the current design system, including:
- Semantic colour tokens for light/dark theme; do not introduce arbitrary hex values or generic SaaS palettes.
- Sora for display/interface headings, Inter for body/UI, and Caveat only for approved marketing flourishes.
- The shared `.kk-container` layout wrapper and established spacing rhythm.
- Existing card, button, field, alert, and focus styles where suitable.
- `Segmented` and `Chips` from `app/_components/choice.tsx` for single-choice controls; do not hand-roll competing selected states.
- Existing theme behaviour, keyboard support, reduced-motion support, and shared components.
- Existing tool-page composition, metadata and sharing conventions where the page uses `ToolPageShell`.

Do not treat the QR reference components in `app/design-system/` as final production QR specifications; check the live QR route and product docs.

If a design-system rule appears to conflict with a real usability or accessibility issue, document the conflict and propose a deliberate decision. Do not silently change the design system or brand.

## 3. Review the whole user journey, not just appearance

Start by stating:
- Page/tool and route.
- Primary user and job to be done.
- Entry context (search landing, homepage, internal workspace, shared link).
- What counts as successful completion.
- Devices, themes, states and flows actually reviewed.
- Evidence limitations.

Review these dimensions where relevant:

### A. First impression and comprehension
- Is the page purpose obvious within seconds?
- Does the heading name the task in the user's language?
- Is the primary action clear and visually dominant?
- Are instructions concise, concrete and placed before they are needed?
- Are marketing/SEO sections competing with the task?

### B. Task flow and cognitive load
- Can the user identify the first step without learning the product?
- Are inputs grouped in a meaningful order with sensible defaults and units?
- Are advanced controls progressively disclosed rather than exposed too early?
- Are unnecessary decisions, repeated entry, dead ends, and surprise requirements removed?
- Does the flow support correction, reset, retry, undo or backtracking when appropriate?

### C. Forms, validation and tool states
Inspect all relevant states: empty, partially complete, valid, invalid, loading/processing, progress, success, error, disabled, and retry.
- Labels must remain understandable without relying on placeholder text.
- Errors should explain what is wrong and how to fix it, near the relevant field where possible.
- Do not erase valid user input on failure.
- Loading states must communicate what is happening; avoid false progress or indefinite spinners.
- Success must make the result and next action obvious.
- For file tools, check picker and drag/drop, file constraints, preview, batch behaviour, progress, remove, download, and retry as relevant.
- For calculators, check assumptions, units, rounding, input bounds, empty/zero values, and explanation of outputs.
- Never claim calculation correctness from visual inspection alone; route it to calculation tests or domain validation.

### D. Output and finish
- Is the result easy to scan and understand?
- Are important totals, differences, savings, generated content or output files prominent?
- Are assumptions and limitations visible at the point of use?
- Is there a clear next step: copy, download, print, edit, share, or start again?
- Does the user know whether work was saved, downloaded or shared?

### E. Sharing and growth
- Is sharing useful for this specific job, not just present for decoration?
- Inspect existing `ShareTool` and product-specific share/export features before proposing another generic share panel.
- Recommend WhatsApp, native share, copy link, shareable scenario, downloadable result, or export only when it fits the job.
- Do not expose private inputs, personal/financial details, file names, or sensitive values in URLs, analytics, or share messages without a deliberate, safe design.
- Consider whether the shared destination makes sense for a recipient who has not used KaamSolv before.

### F. Responsive behaviour
Check narrow mobile, tablet and desktop where available.
- No horizontal overflow, clipped controls, tiny tap targets, awkward sticky UI, or excessive scrolling to complete the task.
- Inputs, segmented controls, cards, tables, result panels and action buttons reflow appropriately.
- Preserve task priority on small screens.
- Avoid assumptions about viewport or device not actually tested.

### G. Accessibility and inclusive interaction
Check semantic headings/landmarks, label associations, keyboard-only operation, focus visibility/order, accessible names, status/error announcements, contrast, touch target size, reduced motion, and zoom/reflow where testable.
- Do not use colour as the sole indicator of selected, error, success or category state.
- Use semantic HTML and native controls where appropriate.
- Respect documented contrast caveats: `text-faint` is for icons, placeholders and disabled state, not body text.
- Do not claim WCAG conformance from a quick visual pass. Identify what was tested and what needs automated or assistive-technology verification.

### H. Trust, privacy and performance cues
- Explain costs, limitations, required accounts and data handling before they surprise users.
- Do not recommend fake urgency, dark patterns, deceptive defaults, or obstructive signup walls.
- Look for obvious performance friction, layout shift, unresponsive controls and excessive client-side work only where observable or supported by code evidence.
- Separate a code-level risk from a browser-observed symptom.

### I. Visual hierarchy and craft
- Check alignment, spacing, typography, content density, consistency, states, icon clarity, focus/hover treatment and use of whitespace.
- Distinguish meaningful visual problems from personal taste.
- Avoid recommending decorative motion, gradients, badges or panels unless they improve comprehension or task success.
- Follow the existing one-hero-entrance/reduced-motion principle unless an approved change exists.

## 4. Use evidence labels and severity consistently

Label findings:
- **Observed:** directly seen or reproduced in the running interface.
- **Code-confirmed:** established by inspected source code but not necessarily exercised in browser.
- **Documented:** specified in approved project documentation.
- **Hypothesis:** plausible user issue needing validation.

Do not describe a code inference as a browser test or a visual impression as measured user behaviour. Cite exact file paths and line numbers when available; for browser observations include route, viewport, theme, and steps to reproduce.

Rate severity:
- **P0 — Blocker:** prevents task completion, exposes sensitive data, or creates a serious accessibility/security/correctness risk.
- **P1 — High:** a common path is blocked or a serious confusing/error-prone interaction is likely.
- **P2 — Medium:** meaningful friction, inconsistency, or accessibility/usability gap with a workaround.
- **P3 — Polish:** low-risk refinement with limited impact.

Also rate confidence High / Medium / Low. A severity rating is not evidence; explain the user impact and reproduction/evidence.

## 5. Prioritise improvements by user impact

For every finding, provide:
1. User impact and who is affected.
2. Evidence and how to reproduce.
3. Severity and confidence.
4. Recommended change.
5. Why it fits the existing design system.
6. Implementation scope: small / medium / large, with a brief code-grounded rationale.
7. Acceptance criteria that can be tested.

Separate:
- **Must fix:** blockers, correctness, privacy, accessibility and broken core flow.
- **Should improve:** substantial friction or clarity.
- **Could polish:** aesthetic refinement or lower-impact convenience.

Do not inflate a review with minor cosmetic nits. Lead with the few changes most likely to improve task success. Do not invent conversion impact or quantitative UX metrics.

## 6. Competitor-informed review

If a competitor research report or links are provided, use it as input, but verify any key claims that materially affect design when possible. Separate:
- patterns worth learning from,
- patterns that do not fit KaamSolv,
- opportunities to improve the underlying workflow rather than copy the appearance.

Do not copy competitor text, branding, distinctive layouts, proprietary assets, or exact visual expression. Translate the insight into a KaamSolv-native solution consistent with the existing system.

If competitor research is not provided, do not invent it as a prerequisite for a useful UX review.

## 7. Recommend design before implementation

Default output is a review, not a code change. Provide a proposed revised flow or annotated layout description when useful. If asked for a mockup, state whether it is a wireframe, visual prototype, or production implementation. If the user asks for implementation, follow the repository instructions, use existing patterns, and keep scope explicit.

For each proposed redesign, identify:
- What remains unchanged.
- What changes and why.
- Primary action and content hierarchy.
- Relevant mobile, dark/light and state variations.
- Shared components/tokens to reuse.
- Acceptance criteria and validation plan.

Do not redesign the brand, navigation taxonomy, or global design system unilaterally. Ask before decisions that materially change approved product direction.

## 8. Required output

Follow [references/ux-review-template.md](references/ux-review-template.md) and score against [references/ux-quality-rubric.md](references/ux-quality-rubric.md).

Before presenting:
- Confirm the repository paths and documentation inspected.
- State the routes, viewport sizes, themes and interaction states actually tested.
- Separate observed findings from code-confirmed issues and hypotheses.
- Prioritise the few highest-impact fixes.
- Provide actionable acceptance criteria.
- Respect KaamSolv's current design system and avoid duplicate components.
- State what was not tested.
- Do not modify code unless implementation was explicitly requested.
