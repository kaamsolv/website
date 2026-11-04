# KaamSolv Engineering Quality Rubric

Score each dimension from 0 to 2:
- **0 — Missing, broken, unsafe, or misleading**
- **1 — Partially met; meaningful gaps remain**
- **2 — Sufficiently met for the task scope, with evidence**

| Dimension | A score of 2 requires | Score |
|---|---|---:|
| Scope and repository understanding | Relevant instructions, actual implementation and constraints inspected | |
| Architecture fit | Existing server/client boundaries, conventions and modules respected | |
| Design-system consistency | Approved tokens, components, themes and patterns reused appropriately | |
| User journey completeness | Main task works from entry through useful result and appropriate finish/recovery | |
| Correctness | Domain logic, validation, assumptions and edge cases are handled | |
| Error and recovery states | Relevant failures are clear, recoverable and preserve user input where practical | |
| Accessibility | Semantic structure, labels, keyboard, focus, contrast and motion considered and tested as feasible | |
| Responsive quality | Relevant viewport layouts checked; no known clipping/overflow regressions | |
| Security and privacy | Input boundaries, sensitive data, secrets, sharing and third-party flows considered | |
| Performance | Client cost, dependencies, expensive work and resource limits considered proportionately | |
| SEO/catalogue correctness | Applicable metadata, canonical, sitemap and live/planned status handled accurately | |
| Test quality | Relevant tests added/updated and actual results reported truthfully | |
| Maintainability | Minimal coherent diff, reusable logic, readable types, no unnecessary dependencies | |
| Scope discipline | No unrelated refactors, undocumented behaviour changes or prohibited actions | |
| Verification transparency | Passed, failed, unrun and blocked checks clearly distinguished | |
| Completion communication | Changed files, rationale, risks and next steps reported clearly | |

**Maximum:** 32

Suggested interpretation:
- **28–32:** Strong change candidate, provided no critical dimension scores 0.
- **23–27:** Review gaps before merge or release.
- **0–22:** Not ready; address correctness, safety, tests or architecture first.

A self-score is a checklist, not independent proof of quality.

## Critical failure conditions

Regardless of total score, the change is not ready if it:
- Leaks secrets or sensitive user data.
- Breaks the core user journey or silently corrupts user output.
- Makes unsupported financial/legal/health correctness claims.
- Claims tests passed when they were not run.
- Suppresses or bypasses failing checks without an explained, approved reason.
- Violates explicit read-only or no-deploy instructions.
- Introduces a global design-system change without approval.
- Discards unrelated user changes or includes unrelated modifications.
- Marks an incomplete tool as live or indexable as a working product.

## Review prompts

1. "Implement this approved UX brief in the existing KaamSolv architecture. Read project instructions and design system first, preserve unrelated changes, add appropriate tests, and do not commit or deploy."
2. "Review this diff for correctness, accessibility, privacy, performance and design-system consistency. Do not modify files; list evidence-backed blockers first."
3. "Implement this calculator using isolated calculation logic and tests for boundaries, rounding, and invalid inputs. Verify domain rules from authoritative sources and flag unresolved rules."
4. "Implement this file conversion flow with input constraints, progress, errors, retry, safe output handling and cleanup. Reuse existing patterns and report untested paths."

A polished interface or passing build alone does not establish engineering quality.
