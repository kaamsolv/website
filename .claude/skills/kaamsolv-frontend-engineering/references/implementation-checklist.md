# KaamSolv Implementation Checklist

Use for non-trivial changes. Tailor it to the task; mark irrelevant items N/A rather than adding unnecessary work.

## Before implementation
- [ ] Read `CLAUDE.md`, `AGENTS.md` and relevant repository instructions.
- [ ] Read the current design system and relevant product/decision documentation.
- [ ] Inspect target route, related components, shared utilities, tests and neighbouring implementations.
- [ ] Check git status and preserve all existing user changes.
- [ ] Confirm task scope, user journey, acceptance criteria and prohibited actions.
- [ ] Identify correctness, privacy, security, accessibility and maintenance risks.
- [ ] Plan the smallest coherent implementation and targeted verification.

## Design and architecture
- [ ] Reuse established tokens and components where suitable.
- [ ] Preserve server/client boundaries and keep client islands focused.
- [ ] Keep domain logic out of presentation code where practical.
- [ ] Avoid unnecessary dependencies, duplicate components and premature abstractions.
- [ ] Handle empty, valid, invalid, loading, success, error and retry states as relevant.
- [ ] Verify responsive layout, theme behaviour, keyboard interaction and reduced motion.
- [ ] Ensure share/export behaviour does not unexpectedly expose private data.
- [ ] Keep SEO, catalogue and sitemap status accurate for public routes when relevant.

## Correctness and safety
- [ ] Validate inputs and boundary conditions at the appropriate layer.
- [ ] Test calculation/transformation logic independently where practical.
- [ ] Verify applicable rules against authoritative sources when the domain requires it.
- [ ] Review file handling, resource limits, cleanup and malformed input where relevant.
- [ ] Preserve secrets, consent, analytics sanitisation and data boundaries.
- [ ] Provide recoverable errors without losing user input unnecessarily.

## Verification
- [ ] Inspect package scripts and existing test setup before running checks.
- [ ] Run targeted tests first.
- [ ] Run type/lint/build checks where relevant and permitted.
- [ ] Test important happy and failure paths.
- [ ] Review keyboard, responsive and theme behaviour where possible.
- [ ] Inspect final diff for unrelated edits, secrets, duplication and scope creep.
- [ ] Record checks that were not run and why.

## Completion
- [ ] Summarise changed files and user-visible behaviour.
- [ ] Report validation honestly with exact outcomes.
- [ ] List unresolved issues, assumptions and follow-up work.
- [ ] Do not commit, push, merge or deploy unless explicitly authorised.
