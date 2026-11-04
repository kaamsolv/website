---
name: kaamsolv-frontend-engineering
description: Implement, refactor, test, and review KaamSolv frontend features in the existing repository using its actual architecture, design system, accessibility standards, and deployment constraints. Use when building or improving a tool/page, translating an approved UX plan into code, fixing frontend bugs, or preparing a change for review. Follow the user's requested scope; inspect first and never deploy unless explicitly asked.
---

# KaamSolv Frontend Engineering

## Mission

Ship dependable, polished KaamSolv features that make everyday tasks feel simple. The implementation should be correct, accessible, responsive, maintainable, fast, privacy-aware, and consistent with the existing product.

Product principle: **Find → Do → Done.** Prefer a small, complete, tested workflow over a broad collection of half-working features.

This skill is for implementation and engineering quality. It complements:
- `kaamsolv-competitor-research`: whether and why to build.
- `kaamsolv-ux-review`: whether the experience is clear and usable.
- This skill: how to implement the approved scope safely and reliably.

Do not run all three automatically if the task is small. Use the relevant skills and user instructions.

## 1. Establish scope and inspect before editing

1. Read `CLAUDE.md`, `AGENTS.md`, package scripts, and any repository-specific instructions that exist. Follow their precedence and constraints. Do not duplicate or override project-wide guidance here.
2. Read `docs/DESIGN-SYSTEM.md`, relevant product briefs under `docs/products/`, the tool catalogue, and relevant approved decisions. Verify actual paths before relying on them.
3. Inspect the target route and related client/server components, shared components, utilities, types, tests, migrations, and adjacent tools with similar behaviour.
4. Identify the actual framework/runtime, package manager, scripts, deployment adapter, and supported APIs from the repository. Do not rely on stale assumptions.
5. Check git status and the user's current changes before editing. Preserve unrelated work. Never reset, checkout over, discard, or overwrite user changes to make the task easier.
6. State the scope, relevant existing patterns, risks, and validation plan briefly when the task is substantial.
7. If a requirement is ambiguous and materially affects architecture, privacy, correctness, or product behaviour, ask one focused question. Otherwise make a conservative assumption and state it.

Do not create a second implementation of a feature that already exists. Prefer reuse when it is a good fit, but do not force a shared abstraction for a one-off pattern without a clear benefit.

## 2. Follow the real architecture

- Keep server and client responsibilities separated in accordance with the existing App Router architecture. Use Server Components by default; add client boundaries only where state, event handlers, browser APIs, or client-only libraries require them.
- Keep interactive client islands focused. Do not turn a whole page into a Client Component just because one small area is interactive.
- Reuse existing utility modules, schema validation, shared controls, error handling, and design patterns. Do not duplicate business logic inside UI components.
- Follow existing TypeScript strictness, import conventions, file naming, route conventions, and module boundaries.
- Do not introduce a new state-management library, UI framework, form library, icon pack, date library, or other dependency unless the benefit is concrete and justified. Prefer existing dependencies and platform APIs.
- Avoid premature abstraction and giant components. Extract a component when it improves readability, reuse, testability, or a clear domain boundary.
- Do not alter deployment configuration, database schema, authentication, billing, analytics, consent, or security boundaries unless the task explicitly requires it.

## 3. Treat the design system as a contract

Read `docs/DESIGN-SYSTEM.md` and inspect actual production patterns before styling.

Known project standards to verify against current docs/code:
- Semantic theme-aware classes and CSS variables; avoid arbitrary raw hex values.
- `text-faint` is for icons, placeholders and disabled states, not body text.
- Sora for interface/display headings, Inter for body/UI, and Caveat only for approved marketing flourishes.
- Use `.kk-container` for page-width alignment.
- Reuse shared card, button, field, alert, focus, theme and motion patterns.
- Use `Segmented` / `Chips` from `app/_components/choice.tsx` for appropriate single-choice controls rather than creating competing selected-state patterns.
- Respect the theme toggle, hydration behaviour, keyboard interaction and reduced-motion support.
- Existing flagship tool pages may establish server-page/client-island patterns; verify the target route rather than blindly copying.
- Follow the existing metadata, canonical, OpenGraph, structured-data and catalogue conventions when adding a route.

These examples are not a substitute for reading current docs. If docs and code disagree, determine whether the difference is an intentional newer decision; flag unresolved conflicts rather than silently redefining the system. Do not redesign the global brand or tokens as part of an unrelated tool change.

## 4. Implement the user journey end to end

Before coding, define the happy path and meaningful failure paths. At minimum, the implemented feature should make clear:
- What the user can do and what input is required.
- How to start, change or cancel the action.
- What happens during processing.
- What a successful result looks like.
- How to correct an error, retry, reset, download, copy, print or share as applicable.

Handle applicable states deliberately:
- Empty and initial state.
- Partial and valid input.
- Invalid input and boundary cases.
- Loading/processing and progress.
- Success, failure and retry.
- Disabled, unavailable or unsupported cases.
- Small-screen and light/dark variants.

For file-processing tools, consider file type/size limits, MIME/extension validation, empty files, corrupted files, multiple files, duplicate selection, progress, cancellation, memory usage, download naming, and cleanup of object URLs or temporary resources where relevant.

For calculators, keep calculation logic separate from presentation where practical; make units, assumptions, rounding and output meanings clear; and test edge cases. UI polish is not evidence of numerical correctness.

For generators, validate output format, escaping, deterministic behaviour where expected, and copy/download paths. For converters, test representative inputs, invalid/corrupt files, output integrity, and failure recovery.

## 5. Correctness, security and privacy

- Validate and normalise untrusted input at the appropriate boundary. Do not rely only on client-side validation for security-sensitive operations.
- Avoid `any` and unsafe type assertions unless necessary and contained with a clear reason. Do not suppress TypeScript, lint, or test failures just to make checks pass.
- Do not use `eval`, unsafe HTML injection, shell execution with untrusted input, or ad hoc parsing for complex formats.
- Protect against path traversal, injection, SSRF, malicious uploads, oversized inputs, and resource exhaustion when relevant to the feature.
- Keep secrets server-side. Never expose credentials or private keys in client code, logs, URLs, analytics, or error messages.
- Treat salary, tax, invoice, customer, document and uploaded-file data as potentially sensitive. Do not add tracking or send data to a third party without explicit product approval and an appropriate privacy review.
- Share only what the user expects. Do not put sensitive inputs or results in query strings or public share URLs by default.
- For financial, tax, legal, health or other consequential logic, identify authoritative rule sources, jurisdiction and effective date; isolate policy assumptions; add boundary tests; and flag unresolved interpretation. Do not claim compliance or accuracy without verification.
- Preserve established consent-first analytics and URL-sanitisation conventions. Do not add event tracking by default or track sensitive values.

## 6. Accessibility and responsive quality

- Use semantic HTML, accessible names, explicit labels, correct heading order and appropriate native controls.
- Ensure keyboard operation, visible focus, logical focus order, appropriate status/error announcements, and non-colour-only indicators.
- Maintain adequate contrast using approved semantic tokens; do not use `text-faint` for normal text.
- Respect reduced-motion preferences and avoid motion that blocks task completion.
- Ensure controls have usable touch targets and responsive layouts do not cause horizontal overflow or clip important content.
- Use appropriate accessible names for icon-only buttons; icons should not be the only means of communicating a critical state.
- Do not claim WCAG conformance merely because these practices were considered.

## 7. Performance and reliability

- Avoid unnecessary client-side JavaScript, oversized dependencies, duplicate work, avoidable re-renders, and expensive synchronous processing on the main thread.
- Lazy-load or dynamically import heavy client-only features where consistent with the architecture and beneficial.
- For large files or CPU-intensive work, consider memory bounds, progress feedback, cancellation, worker support if already established, and realistic device limits.
- Avoid layout shift and prevent repeated submissions where duplicate actions could cause harm.
- Handle network, storage, browser capability, API and runtime failures with useful recovery messages.
- Do not add caching, retries, concurrency or background processing without understanding consistency and failure implications.
- Do not claim performance improved without measurements; report code-level reasoning separately from measured results.

## 8. SEO and discoverability for public tools

When adding or changing public, indexable routes:
- Follow existing server-rendered metadata and canonical URL conventions.
- Add accurate title, description, OpenGraph/Twitter metadata and breadcrumbs where appropriate.
- Add structured data only when accurate and appropriate; never fabricate reviews, ratings, prices, FAQs or product claims.
- Update the tool catalogue and sitemap conventions where required by the repository.
- Ensure planned tools are not presented as live until the complete route works.
- Avoid thin, repetitive SEO copy that distracts from the actual tool. The tool should remain the primary experience.
- Respect noindex rules for internal workspaces, private routes and user-specific pages.

Not every change needs SEO work; apply this section only when route discoverability is in scope.

## 9. Testing and verification

Inspect package scripts and existing tests before selecting commands. Use the repository's package manager and established tools. Run the most relevant targeted checks first, then broader checks when feasible.

Where applicable:
- Unit-test pure calculations and transformations, including boundaries and rounding.
- Test validation, state transitions, errors, and recovery.
- Add or update component/integration tests for user-visible behaviour.
- Add or update Playwright/E2E tests for critical user journeys if the project has that infrastructure and the change warrants it.
- Verify keyboard interactions, responsive states and theme behaviour using available tools.
- Run type checking, linting, relevant tests, and build checks as appropriate and permitted.
- Inspect the final diff for accidental scope creep, secrets, generated files, duplicated logic and unrelated formatting changes.

Never say a test passed unless it actually ran and passed. Distinguish:
- **Ran and passed**
- **Ran and failed**
- **Not run** (with reason)
- **Manually inspected only**
- **Blocked by environment/dependency/access**

If execution is prohibited by the user, do not run commands that violate that constraint. If a test is unavailable, provide the exact remaining validation needed.

## 10. Change discipline

- Make the smallest coherent change that fulfils the approved request.
- Do not reformat or refactor unrelated code.
- Do not change product behaviour, copy, analytics, dependencies, schema or shared components outside scope without explaining why.
- Never modify `CLAUDE.md`, secrets, environment files, lockfiles, generated assets or deployment settings unless explicitly required and approved.
- Do not commit, push, open a PR, merge, or deploy unless the user asks for that action. Creating or editing files is not permission to publish.
- If the task is explicitly read-only, remain read-only.
- If the user asks for GitHub branch work, follow the requested branch and review workflow, and keep `main` untouched unless the user explicitly approves a merge.

## 11. Required implementation response

At completion, report:
1. **What changed:** files and behaviour, with paths.
2. **Why:** connection to the user job and approved design.
3. **Validation:** commands actually run and their exact outcomes.
4. **Known gaps:** tests not run, limitations, assumptions and risks.
5. **Next step:** any required review, user decision, or deployment action.

Follow [references/implementation-checklist.md](references/implementation-checklist.md) for non-trivial changes and use [references/engineering-quality-rubric.md](references/engineering-quality-rubric.md) for self-review.

The checklist is a quality gate, not permission to expand scope. Do not inflate the report or score to conceal unresolved failures.
