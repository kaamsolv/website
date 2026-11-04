---
name: kaamsolv-competitor-research
description: Research and compare real competing products before KaamSolv decides what utility to build or how to improve an existing one. Use when evaluating a new tool idea, planning a feature upgrade, comparing competitors, or looking for evidence-backed differentiation. Do not use this as a substitute for repository implementation or a generic market overview.
---

# KaamSolv Competitor Research

## Purpose

Help the KaamSolv product owner make better build/prioritisation decisions by researching real products, observing actual user journeys where possible, and identifying differentiated improvements that fit KaamSolv's product principles.

The outcome is not a list of features to copy. It is an evidence-backed recommendation for what KaamSolv should build, what it should deliberately not build, and why.

## Read project context first

Before researching:

1. Read the repository's `CLAUDE.md` and follow it as the project-wide source of truth.
2. Read the most relevant documentation in `docs/`, especially `docs/kaamsolv-tool-catalogue.md`, `docs/DECISIONS.md`, and the relevant `docs/products/*.md` file if one exists.
3. Inspect the current implementation and existing related tools when the research concerns an existing or planned KaamSolv utility. Reuse repository knowledge; do not ask the user to repeat information already documented.
4. Preserve the current brand, product, category and technical decisions. Do not recommend replacing established conventions merely to match a competitor.

Do not duplicate project-wide rules from `CLAUDE.md` in the research report. Refer to them where relevant.

## Research procedure

### 1. Define the decision

Establish:
- The user problem and target user(s).
- The core job the tool must complete.
- The decision to support: build, improve, defer, or reject.
- Relevant geography and use context (for example, India-specific tax rules versus a global utility).
- Constraints such as implementation effort, data sensitivity, legal/financial correctness, maintenance burden, and the current KaamSolv architecture.

If a critical input is missing, state a reasonable research assumption and proceed where possible. Ask a question only if the missing information would materially change the research.

### 2. Discover relevant competitors

Use available web search and browser capabilities. Search for a balanced sample where applicable:
- Direct competitors solving the same job.
- High-quality global products.
- India-specific products or workflows where relevant.
- Specialist tools that do one part of the job exceptionally well.
- Open-source alternatives or established platform features when they are meaningful substitutes.

Aim for 5–8 useful candidates when the market supports it; fewer is acceptable for a narrow category. Prefer relevance and evidence quality over a quota. Avoid treating SEO listicles as the primary evidence. Search for user feedback or discussions where useful, and distinguish anecdotal reports from representative evidence.

Record the research date. Do not imply that a search was exhaustive.

### 3. Inspect the products, not just their marketing

For each shortlisted competitor, inspect the actual product or workflow when access permits. Test representative inputs and outputs where safe and practical. Observe:
- First-use clarity and number of steps.
- Input design, defaults, validation, and error recovery.
- Output usefulness, explanation, and presentation.
- Mobile/responsive behaviour when it can be inspected.
- Export, download, copy, save, and share behaviour.
- Account/paywall friction and pricing, if relevant.
- Privacy implications, file handling, and trust signals.
- Accessibility and performance indicators that can actually be observed.

Do not submit real personal, financial, confidential, or customer data to competitor sites. Use synthetic examples. Do not bypass access controls, paywalls, rate limits, or technical restrictions.

If a site blocks access or the tool cannot be exercised, report what was observed from accessible sources and mark the rest as unverified. Never describe a feature as tested when it was only inferred from a landing page, screenshot, search snippet, or review.

### 4. Maintain evidence quality

For every material competitor claim:
- Provide the direct source URL and the date accessed when available.
- Prefer the competitor's own product/docs/pricing page for claims about its capabilities or pricing.
- Use reputable independent sources for market context and original user discussions for anecdotal pain points.
- Label each insight as one of: **Observed**, **Source-stated**, **User-reported**, or **Hypothesis**.
- Distinguish current facts from estimates and opinions.
- Do not invent search volumes, traffic, market share, conversion rates, ratings, feature support, prices, or user complaints.
- If sources conflict or freshness is uncertain, say so.
- Keep research claims traceable; cite sources next to the claims they support.

### 5. Compare the user experience

Create a concise feature/experience matrix based on the dimensions that matter for this category. Do not use one generic matrix for every tool. Include:
- Core job completion.
- Input and output quality.
- Useful differentiators.
- Sharing/export.
- Mobile usability.
- Trust/privacy.
- Free-tier limitations or pricing, if relevant.
- Notable friction and missing capabilities.

Use `Yes`, `Partial`, `No`, and `Unknown/not verified` where binary comparison is useful. Do not interpret missing evidence as a missing feature.

### 6. Identify opportunities for KaamSolv

Separate findings into:
- **Table stakes:** expected capabilities required to be credible.
- **Experience improvements:** remove friction or make the core task clearer/faster.
- **Differentiators:** a specific reason to choose KaamSolv.
- **Potential distractions:** features that add complexity without enough user value.

Prioritise opportunities by:
1. User value and frequency of the problem.
2. Strength of evidence and confidence.
3. Competitive differentiation.
4. Build complexity and ongoing maintenance.
5. Risk, including financial/legal correctness, privacy, and dependency on changing external rules.
6. Fit with KaamSolv's `Find → Do → Done` principle and existing architecture.

Do not assume every tool needs monetisation. Consider portfolio value: acquisition, repeat usage, sharing, trust, cross-discovery, and direct revenue can each be legitimate outcomes. Avoid claiming SEO demand is high without suitable evidence.

For sharing, recommend a feature only when it fits the user's task: e.g. copy result, downloadable output, clean shareable scenario, native share, or WhatsApp. Respect the existing `ShareTool` and related utilities; inspect them before proposing duplicate mechanisms. Flag sensitive data that must not be placed in share URLs.

### 7. Make a clear recommendation

Conclude with one recommendation:
- **Build now**
- **Improve an existing tool**
- **Validate further**
- **Defer**
- **Do not build**

Explain the evidence, trade-offs, assumptions, differentiator, estimated relative effort (Small / Medium / Large, with rationale), ongoing maintenance burden, key risks, and the next cheapest validation step.

Do not begin coding or modify repository files as part of this skill unless the user separately requests implementation. Research and planning are the default.

## Required output

Use the template in [references/research-report-template.md](references/research-report-template.md). At minimum, include:
1. Executive recommendation.
2. User/job definition and assumptions.
3. Competitor shortlist and direct links.
4. Feature/UX comparison matrix.
5. Observed friction and opportunity map.
6. Recommended KaamSolv differentiator(s), including sharing/export where relevant.
7. Build effort and maintenance/risk assessment.
8. Evidence gaps and confidence.
9. Sources and research date.
10. Suggested next step.

Use the quality rubric in [references/quality-rubric.md](references/quality-rubric.md) to self-check the report before presenting it.

## Completion standard

A report is ready only when:
- The recommendation follows from the evidence and acknowledges uncertainty.
- Important claims have traceable sources.
- Observations are separated from assumptions.
- Competitors are compared on criteria relevant to the user's job.
- The proposed differentiator is concrete, not just "better UI" or "more features."
- The recommendation respects KaamSolv's existing product and design decisions.
- No implementation work or repository changes were made unless separately authorised.
