# Competitor Research Quality Rubric

Score each dimension from 0 to 2.

- **0 — Missing, materially unsupported, or misleading**
- **1 — Partially met; evidence or reasoning has meaningful gaps**
- **2 — Clearly met with relevant evidence and transparent limitations**

| Dimension | A score of 2 requires | Score |
|---|---|---:|
| Decision framing | User job, audience, decision, geography, constraints, and assumptions are clear | |
| Repository audit | Existing routes/implementation are inspected; relevant exact paths cited; duplicates identified | |
| Competitor selection | Relevant direct, adjacent, specialist, or substitute products; selection rationale is clear | |
| Product inspection | Leading products tested or visually inspected where accessible; inspection level disclosed | |
| Evidence and citations | Material claims have direct traceable sources and access dates where available | |
| Evidence labelling | Observations, official claims, user reports, and hypotheses are distinguished | |
| Demand integrity | Measured demand is separated from qualitative proxies; no fabricated metrics or unsupported demand ranking | |
| Comparison quality | Category-relevant criteria; unknown is not mistaken for absent; evidence notes support important comparisons | |
| Opportunity vs execution | User opportunity and implementation effort/maintenance are assessed separately | |
| Differentiation | Concrete user-valued advantage, linked to evidence or explicitly labelled hypothesis | |
| Sharing and privacy | Sharing/export fits the user job; sensitive data and URL leakage are considered | |
| Build and maintenance | Initial effort, ongoing upkeep, reuse, and operational burden are considered | |
| Risks and correctness | Relevant accuracy, regulatory, privacy, security, and changing-rule risks are handled honestly | |
| KaamSolv fit | Existing design/architecture/product decisions are respected; duplication is avoided | |
| Actionability | One clear decision, alternatives explained, v1 boundaries and next validation step included | |
| Transparency | Access limitations, unknowns, confidence, and what could change the recommendation are stated | |

**Maximum:** 32

Suggested interpretation:
- **28–32:** Strong decision-support draft, provided no critical dimension scores 0.
- **23–27:** Useful but address material gaps before committing to implementation.
- **0–22:** Not decision-ready; improve research, repository verification, or reasoning.

A score is not a statistical measure of truth and does not independently validate the report. A self-assigned score is only a checklist. Where possible, a reviewer should check the cited sources and repository paths independently.

## Critical failure conditions

Regardless of total score, the report fails if it:
- Invents search volume, traffic, prices, ratings, competitor features, user sentiment, or financial rules.
- Claims a competitor workflow was tested when it was not.
- Claims the repository was audited without identifying implementation paths inspected.
- Treats unknown evidence as proof that a feature is absent.
- Recommends a financial or regulated calculation as ready to launch without identifying authoritative rule sources and correctness tests.
- Modifies application code or deploys when the task is research-only.

## Repeatable skill validation

Use the same task and constraints before and after changing the skill. Compare:
1. Whether the repository audit found the same real implementations and relevant paths.
2. Number and quality of source-backed competitor claims.
3. Which competitors were actually inspected versus described from marketing material.
4. Whether demand evidence and build effort are separated.
5. Whether the final recommendation and trade-offs are better supported.
6. Whether unknowns and critical risks are surfaced.
7. Whether the report is decision-useful without unnecessary length.

## Test prompts

1. **New tool:** "Research PPF calculators for Indian users and recommend whether KaamSolv should build one. Do not write code."
2. **Existing tool:** "Compare KaamSolv's invoice generator with relevant alternatives and recommend three evidence-backed improvements. Do not change files."
3. **Demand versus effort:** "Compare the next-tool candidates by opportunity, differentiation, build effort, and maintenance. Do not invent search volumes."
4. **Specific feature claim:** "Is Competitor X's free plan better than KaamSolv's for exporting results? Verify current public evidence and clearly mark anything you cannot test."

Every test must pass the critical failure conditions above. Do not call the skill validated solely because the output is polished or its self-score is high.
