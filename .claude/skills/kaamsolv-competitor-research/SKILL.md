---
name: kaamsolv-competitor-research
description: Evidence-led competitor and opportunity research for choosing a new KaamSolv utility or improving an existing one. Use before product prioritisation, feature planning, or deciding whether to build, improve, validate, defer, or reject a tool. Research and recommendation only; do not implement unless separately asked.
---

# KaamSolv Competitor Research

## Mission

Help KaamSolv choose useful product opportunities and build a credible reason for users to choose its tools. Research must inform a decision, not produce a long list of competitors or features to copy.

A strong report separates three questions:
1. **Opportunity:** Is the user problem important and is there credible evidence of demand?
2. **Right to win:** Can KaamSolv offer a meaningfully better, simpler, more trustworthy, or more useful experience?
3. **Execution:** Can we deliver and maintain that advantage at a reasonable cost and risk?

Do not confuse high demand with low effort, or easy implementation with a strong market opportunity.

## 1. Read the repository before forming a recommendation

1. Read `CLAUDE.md` and follow it as the project-wide source of truth. Do not copy its general instructions into this skill or override its rules.
2. Read the relevant catalogue, decision records, product briefs, design-system documentation, and any current implementation notes. Use files that actually exist; do not assume a named document exists.
3. Inspect the repository's current routes and implementation for the candidate and adjacent tools. Search for calculation utilities, validation, shared components, charts, sliders, exports, sharing, metadata/SEO, FAQs, and tests as relevant.
4. Verify whether a proposed tool already exists, is partial, is duplicated by another tool, or is only mentioned in documentation. Cite exact repository paths and explain what was inspected.
5. Prefer reuse of established components and patterns when they fit. Do not recommend rewriting working architecture simply to match a competitor.
6. If the repository or a needed source cannot be accessed, disclose that limitation. Never claim an audit was completed based only on a filename or prior summary.

The repository audit is mandatory even for a broad "what should we build next?" request. If multiple candidates are under consideration, inspect each candidate enough to identify duplication and realistic reuse.

## 2. Frame the decision

State:
- The user group and job to be done.
- The decision being made: new tool, upgrade, bundle, further validation, defer, or reject.
- Geography and relevant local context (for example, Indian tax rules).
- Known constraints: development effort, maintenance, correctness, privacy, dependencies, distribution, and current architecture.
- Assumptions that affect the result.

Ask a clarifying question only when a missing answer could materially change the recommendation. Otherwise state the assumption and proceed.

## 3. Discover a balanced competitor set

Use available web search and browser capabilities. For a meaningful market, aim to shortlist 5–8 relevant products, not 5–8 merely famous brands. Fewer is acceptable when the category is narrow or evidence is limited.

Include a justified mix of:
- Direct competitors solving the same user job.
- Strong products from adjacent markets or regions.
- Specialist products that excel at a specific workflow.
- Substitutes such as spreadsheets, operating-system features, or established platforms when they genuinely compete for the same job.
- India-specific products and workflows when relevant.

Do not use SEO listicles as the main evidence. Use user discussions and reviews where useful, but treat anecdotes as anecdotal rather than representative.

Record the research date and discovery approach. Do not describe the search as exhaustive unless the scope genuinely supports that claim.

## 4. Inspect actual products and workflows

For the most relevant competitors, try to inspect the actual product rather than relying only on landing pages. Where safe and accessible, use synthetic inputs and test a representative happy path and meaningful edge case.

Inspect category-relevant dimensions such as:
- How quickly a first-time user understands what to do.
- Inputs, defaults, validation, units, assumptions, and error recovery.
- Output quality, explanation, visual hierarchy, and next steps.
- Mobile/responsive experience when it can be observed.
- Copy, share, export, download, save, and print behaviour.
- Account requirements, paywalls, pricing, and free-tier limits.
- Trust signals, privacy implications, accessibility, and performance indicators that can actually be observed.

Use the evidence labels consistently:
- **Observed:** directly tested or viewed in the product.
- **Source-stated:** claimed in official product documentation, marketing, or pricing.
- **User-reported:** stated by an identifiable review or discussion source; not necessarily representative.
- **Hypothesis:** an interpretation or opportunity that needs validation.

For each leading competitor, state whether its product was actually exercised, only visually inspected, or reviewed through public descriptions. If blocked, say so. Never label a feature as tested if it was inferred from marketing copy, a search snippet, a screenshot, or a review.

Do not submit real personal, financial, confidential, or customer data to competitor sites. Use synthetic examples. Do not bypass access controls, paywalls, rate limits, or technical restrictions.

## 5. Use evidence honestly

For every material external claim:
- Include a direct URL and access date where available.
- Prefer official product pages, documentation, pricing, and relevant government or regulator sources for product/rule claims.
- Use independent sources for market context and original review/discussion sources for user-reported pain points.
- Cite claims near where they appear, not only in a bibliography.
- Distinguish current facts from estimates, opinions, and hypotheses.
- Disclose stale, conflicting, incomplete, or inaccessible evidence.

Never invent or imply verification of search volume, traffic, market share, conversion rates, ratings, pricing, feature support, user sentiment, financial rules, or competitor behaviour. Do not treat missing evidence as proof that a feature is absent.

If reliable keyword/search-volume data is unavailable, say so. You may use clearly labelled qualitative proxies (search-result presence, public product activity, recurring use-case evidence, community discussions), but do not convert them into numeric demand claims.

## 6. Evaluate opportunity separately from execution

Assess each serious candidate on two distinct dimensions.

### A. Opportunity evidence
- User problem frequency and consequence.
- Demand evidence and confidence.
- Fit for the intended geography and audience.
- Competitive intensity and available unmet needs.
- Acquisition/discovery potential.
- Repeat use, sharing, retention, and cross-discovery potential.
- Portfolio role: traffic/acquisition, repeat use, trust/authority, conversion, or direct revenue.

### B. Execution and risk
- Initial build effort with a rationale grounded in the current repository.
- Ongoing maintenance burden, including changing rules, APIs, formats, and dependencies.
- Reuse of existing components and calculation logic.
- Correctness, financial/legal, privacy, security, accessibility, and operational risks.
- Time to a useful v1 and what must be excluded.
- Cost of keeping the tool accurate and reliable over time.

Rate each dimension as Low / Medium / High only with an explanation. Add confidence (High / Medium / Low) and explain what evidence supports it. Do not invent precise scores or numeric estimates when the evidence cannot support them.

If a weighted score helps compare candidates, show the criteria and weights, explain why they fit the decision, and retain the underlying evidence. Do not let a score conceal major uncertainty or turn weak evidence into false precision.

## 7. Compare user experience using relevant criteria

Build a compact matrix for the shortlisted candidates. Tailor the criteria to the category instead of forcing every tool into one generic rubric.

Possible dimensions:
- Core job completion and output quality.
- Input friction and helpful defaults.
- Differentiation or value-add.
- Share/export.
- Mobile usability.
- Trust/privacy.
- Pricing or usage limitations.
- Evidence confidence.

Use Yes / Partial / No / Unknown-not-verified only when appropriate and evidence-backed. Unknown is not No. Include a short evidence note for important comparisons.

## 8. Find a KaamSolv-specific reason to win

Separate potential features into:
- **Table stakes:** expected capabilities needed to be credible.
- **Experience improvements:** make the core job easier, clearer, faster, or more trustworthy.
- **Differentiators:** a specific, defensible user benefit.
- **Potential distractions:** features that add complexity without enough user value.

Do not settle for generic recommendations such as "modern UI", "AI-powered", "more features", or "easy to use". Explain the actual interaction, output, workflow, or trust improvement and why it matters to the target user.

Consider sharing as a product behaviour, not a checkbox. Select the sharing method that fits the job: copy result, clean shareable scenario, downloadable output, native share, WhatsApp, or another justified method. Inspect the existing ShareTool and relevant utilities before recommending a duplicate. Do not expose sensitive data in URLs or shared results; explain what is and is not shared.

Do not assume every tool must monetise directly. Consider its role in the wider portfolio and potential for discovery, repeat use, sharing, trust, cross-discovery, and revenue.

## 9. Apply extra care to regulated or changing calculations

For tax, salary, investments, loans, benefits, and other financially consequential tools:
- Verify current applicable rules with authoritative primary sources, preferably government departments, regulators, or official scheme documentation.
- Record the applicable tax/financial year, effective date, rate assumptions, eligibility boundaries, and source freshness where relevant.
- Separate arithmetic from policy assumptions and clearly disclose assumptions in the proposed UI.
- Identify edge cases, rounding rules, input validation, and representative tests needed before release.
- Do not claim the tool is accurate or compliant until its rules and outputs have been tested.
- Avoid personalised financial, legal, or tax advice unless specifically in scope and properly supported.
- Estimate the recurring work required to keep rules current. If rules cannot be verified, recommend validation before implementation rather than guessing.

## 10. Make one clear recommendation

Choose exactly one:
- **Build next**
- **Improve an existing tool**
- **Validate further before building**
- **Defer**
- **Do not build**

Rank the best three candidates where the user asks for a shortlist. Explain why the winner beats the alternatives and what evidence could change the decision.

For the winner, describe:
- Target user and core job.
- Minimum useful v1 and the happy path (KaamSolv's Find → Do → Done principle).
- One or two concrete value-add features.
- UI/UX improvements tied to observed competitor friction or user needs.
- Sharing/export approach and privacy constraints.
- Existing repository components and logic to reuse.
- Initial effort and ongoing maintenance.
- Risks, unknowns, and what to exclude from v1.
- Cheapest next validation step and measurable success criteria.

Do not start implementation or edit repository files unless the user separately requests it. Research and recommendation are the default.

## Required output and self-check

Follow [references/research-report-template.md](references/research-report-template.md) and score the result with [references/quality-rubric.md](references/quality-rubric.md).

Before presenting the report, verify:
- The repository audit is real and cites paths inspected.
- Existing tools and overlapping functionality were checked for each candidate.
- Demand and execution effort are evaluated separately.
- Material external claims have sources and evidence labels.
- Leading competitors' inspection limits are explicit.
- The recommendation is specific, differentiated, and proportionate to the evidence.
- No invented metrics or unverified claims are presented as facts.
- Risks, ongoing maintenance, and unknowns are included.
- No code or repository files were changed.

A self-assigned rubric score is a checklist, not independent proof of quality. Justify every score briefly, mark any critical dimension scoring 0, and state unresolved gaps. Do not inflate the score to make the report look complete.

## Skill validation protocol

When asked to test or improve this skill:
1. Use a real, decision-relevant task and the same repository context.
2. Check whether the output satisfies every mandatory section and evidence requirement.
3. Identify concrete failure examples, not just general impressions.
4. Fix the smallest set of instructions that addresses the observed failures.
5. Re-run the same or equivalent test and compare quality, evidence coverage, and recommendation changes.
6. Do not claim the skill is validated solely because Claude followed the format or gave itself a high score.
