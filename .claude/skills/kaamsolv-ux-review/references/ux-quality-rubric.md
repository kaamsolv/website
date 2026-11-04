# KaamSolv UX Review Quality Rubric

Score each dimension from 0 to 2:
- **0 — Missing, materially unsupported, or misleading**
- **1 — Partially met; meaningful gaps remain**
- **2 — Complete enough for the stated review scope, with evidence and limitations**

| Dimension | A score of 2 requires | Score |
|---|---|---:|
| User/task framing | Primary user, job, entry context and successful outcome are explicit | |
| Repository audit | Relevant implementation and exact paths inspected; no claims based on filenames alone | |
| Design-system fidelity | Current tokens, components, theme and approved decisions checked | |
| Journey coverage | Main user journey reviewed from entry through completion/share/retry | |
| Interaction states | Relevant empty, valid, invalid, loading, success, error and retry states assessed | |
| Visual hierarchy | Findings address task clarity and visual hierarchy, not only personal taste | |
| Forms and validation | Labels, defaults, units, errors, preserved input and recovery assessed where relevant | |
| Responsive behaviour | Actual tested viewports and observed overflow/reflow issues documented | |
| Accessibility | Keyboard, focus, semantics, labels, contrast, non-colour cues, touch and motion considered | |
| Evidence integrity | Observed, code-confirmed, documented and hypothesised claims distinguished | |
| Severity and confidence | Ratings are tied to user impact, evidence and reproduction; no unsupported certainty | |
| Actionability | Recommended changes are concrete, scoped and testable | |
| Design-system reuse | Existing components/tokens are preferred; duplicate systems are not proposed | |
| Share/privacy | Relevant sharing/export flows and risk of exposing sensitive inputs are reviewed | |
| Prioritisation | Blockers and high-impact friction precede cosmetic polish | |
| Validation plan | Acceptance criteria, test method and unverified areas are stated | |

**Maximum:** 32

Suggested interpretation:
- **28–32:** Strong review draft, provided no critical dimension scores 0.
- **23–27:** Useful, but resolve meaningful gaps before using it as a release gate.
- **0–22:** Not decision-ready; improve scope, evidence, or actionability.

A self-score is a checklist, not independent proof of usability or accessibility.

## Critical failure conditions

The review fails regardless of total score if it:
- Claims browser, device, screen-reader, accessibility, performance or interaction tests were run when they were not.
- Recommends a global brand/design-system change without required approval.
- Introduces colours, typography, controls or patterns that conflict with approved design tokens without flagging the conflict.
- Treats a planned/not-deployed feature as live.
- Confuses a code-level risk with a reproduced user-facing issue.
- Recommends sharing personal or financial inputs through URLs or public links without explicit privacy analysis.
- Changes application code during a read-only review.
- Claims WCAG compliance without a sufficient audit.

## Repeatable validation prompts

1. **Live tool review:** "Review the KaamSolv [tool] page for UX and accessibility. Audit the code and approved design system first. State exactly what you tested. Do not modify files."
2. **Screenshot review:** "Review these screenshots for hierarchy, comprehension, responsiveness and design-system fit. Label inferences as hypotheses; do not claim interaction testing."
3. **Pre-release review:** "Review this feature's main happy path and failure states against the requirements and design system. Produce prioritised findings with reproducible evidence and acceptance criteria. Do not fix code."
4. **Competitor-informed improvement:** "Use this competitor research to propose KaamSolv-native UX improvements. Do not copy competitor visuals or make unverified claims."
5. **Accessibility focus:** "Audit this tool's semantic markup, keyboard flow, labels, focus, errors, contrast and reduced motion. Distinguish code inspection from tests that require a browser or assistive technology."

A test passes only if critical failure conditions are met. A polished-looking report or high self-score alone does not validate the skill.
