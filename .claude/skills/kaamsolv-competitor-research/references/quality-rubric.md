# Competitor Research Quality Rubric

Score each dimension from 0 to 2.

- **0 — Missing or unsupported**
- **1 — Partially met; gaps or weak evidence remain**
- **2 — Clearly met with relevant evidence**

| Dimension | What a score of 2 requires | Score |
|---|---|---:|
| Decision framing | Clear user job, audience, decision and assumptions | |
| Competitor selection | Relevant direct, adjacent and specialist options; sample size justified | |
| First-hand inspection | Actual workflows inspected where access permits; limitations disclosed | |
| Evidence and citations | Material claims have direct, traceable sources and access dates where available | |
| Evidence labelling | Observations, source-stated claims, user reports and hypotheses are distinct | |
| Comparison quality | Criteria reflect this tool's job; unknown is not mistaken for absent | |
| Differentiation | Concrete, user-valued advantage rather than generic "better UI" | |
| Sharing/export | Appropriate sharing considered with privacy-safe handling | |
| Effort and maintenance | Initial build and ongoing upkeep both assessed | |
| KaamSolv fit | Existing docs/components/decisions considered; duplication avoided | |
| Risks and uncertainty | Correctness, privacy, changing rules and evidence gaps disclosed | |
| Actionability | Clear build/improve/validate/defer/reject recommendation and next step | |

**Maximum:** 24

Suggested interpretation:
- **21–24:** Ready to inform a product decision, provided no critical dimension scores 0.
- **16–20:** Useful draft; address weak dimensions before committing to a build.
- **0–15:** Insufficient; improve research framing, evidence or analysis.

A high total does not override a critical failure. The report must not invent features, pricing, traffic, search volume, user sentiment or browser testing. Any unsupported material claim should be corrected even if the numerical score is otherwise high.

## Test prompts for the skill author

Use these to check whether the skill triggers appropriately and follows the method.

1. **New tool:** "Research the best PPF calculators for Indian users and recommend whether KaamSolv should build one. Do not write code."
2. **Existing product improvement:** "Compare KaamSolv's invoice generator with leading alternatives and find the three highest-value improvements, with evidence. Do not change files."
3. **Narrow competitor claim:** "Is Competitor X's free plan better than KaamSolv's for exporting results? Verify current public evidence and clearly mark anything you cannot test."

## Pass/fail checks

A test passes only if the response:
- Uses project documentation and inspects existing KaamSolv implementation when relevant.
- Searches actual products and cites direct sources.
- Distinguishes observed behaviour from marketing claims and hypotheses.
- Discloses blocked or unavailable product access.
- Uses Unknown/not verified rather than inferring absence.
- Gives a concrete recommendation and explains trade-offs.
- Does not start implementation or modify application code.
