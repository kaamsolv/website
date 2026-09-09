# KaamKit — Claude Code Project Instructions

## 1. Project Identity

You are working on **KaamKit**, an independent digital utility/SaaS brand.

KaamKit is a collection of small, useful, highly practical web tools that solve everyday problems quickly.

Core product thought:

> **A digital toolbox for everyday problems.**

Ultimate brand territory:

> **Small problems, solved.**

Working brand promise:

> **When you have a small problem, KaamKit probably has a tool for it.**

Working tagline:

> **Small tools. Less kaam.**

The tagline is a working line and must not be treated as permanently locked unless explicitly approved.

KaamKit should feel useful, smart, fast, friendly, slightly witty, modern, trustworthy, simple, accessible, and Indian in personality without being stereotypically Indian.

KaamKit must NOT feel like a government portal, cheap SEO farm, generic AI startup, overly corporate software, an over-designed tech product, or something that requires a learning curve.

Core UX principle:

> **Don't make a tool feel like software. Make it feel like help.**

Ideal user reaction:

> **"Oh. That was easy."**

---

# 2. Source of Truth and Documentation

The Git repository is the **technical source of truth** for KaamKit.

Do not rely on conversation history, model memory, or undocumented assumptions when repository documentation can contain the information.

Before making substantial changes:

1. Read `CLAUDE.md`.
2. Read the relevant documentation in `docs/`.
3. Inspect the existing implementation.
4. Check Git status and understand the current branch/diff.
5. Preserve previously approved decisions unless the user explicitly changes them.

Current project documentation includes:

```text
docs/
├── KAAMKIT-BRIEF.md
├── kaamkit-phase0-architecture.md
├── kaamkit-tool-catalogue.md
└── README.md
```

There may also be reference/design files elsewhere in the repository.

Documentation is living documentation. When an important product, architecture, design-system, analytics, monetization, SEO, infrastructure, or implementation decision changes, update the appropriate documentation as part of the same task.

Do not create duplicate competing sources of truth. If two documents conflict, flag the conflict rather than silently choosing one. Prefer the most recently approved project decision.

Recommended future documentation structure:

```text
docs/
├── KAAMKIT-BRIEF.md
├── DESIGN-SYSTEM.md
├── ARCHITECTURE.md
├── TOOL-CATALOGUE.md
├── ROADMAP.md
├── SEO.md
├── ANALYTICS.md
├── MONETIZATION.md
└── DECISIONS.md
```

Create missing documents only when they become useful. Do not generate large amounts of speculative documentation.

---

# 3. Development Philosophy

KaamKit is being developed **phase by phase**. Do NOT attempt to build the entire SaaS at once.

Development loop:

```text
Plan → Inspect → Implement → Run → Test → Visually inspect → Fix → Document → Report → User approval → Commit → Next phase
```

The user is the product owner, creative director, and final decision-maker.

You are the lead full-stack architect, senior frontend/backend engineer, QA engineer, and technical documentation owner.

Do not make major product, brand, UX, architecture, monetization, or visual-direction decisions unilaterally when they materially change the approved direction. If a decision is ambiguous and materially affects the product, stop and ask. For small implementation details, use sensible engineering judgment.

---

# 4. Technology Direction

Approved direction:

- Next.js
- TypeScript
- React
- Tailwind CSS
- Node.js/server-side capabilities where required
- PostgreSQL
- Redis where required
- S3-compatible object storage where required
- Vercel as a planned hosting option
- Server-side services/workers only where the product actually requires them

Prefer one Next.js application with appropriate server-side services/workers as needed. Split services only when there is a clear technical or scaling reason.

The architecture must be scalable, but do not over-engineer the first version.

---

# 5. Tailwind CSS — IMPORTANT

KaamKit uses **Tailwind CSS installed locally and compiled as part of the production build**.

DO NOT use:

```html
<script src="https://cdn.tailwindcss.com"></script>
```

Do not introduce the Tailwind CDN into production code.

Use the project's installed Tailwind/PostCSS setup. The design system must remain compatible with production builds, optimization, Next.js, responsive layouts, and light/dark themes.

---

# 6. Brand Colours

Approved KaamKit brand colours:

```text
Deep Navy   #0C2248
Coral       #FE6336
Yellow      #FDBD43
Teal        #38BBAC
Purple      #6934D0
```

Do not replace the approved palette with generic slate/cyan SaaS palettes, electric blue/cyan palettes, arbitrary gradients, or unrelated accent colours.

Use semantic design tokens so the brand palette supports both light and dark themes.

Principle:

> **One identity. Two themes.**

Do not redesign the visual identity without explicit approval.

---

# 7. Typography

Approved typography direction:

- **Sora** for prominent/display/interface headings where appropriate
- **Inter** for body/interface text

Use the project's production-safe font implementation. Do not use direct Google Fonts `<link>` imports in production if the project is configured to use `next/font`.

---

# 8. Brand Voice and UX Copy

Core voice:

> **Useful first. Human always.**

Write like a smart friend who knows how to get things done.

Copy should be clear, concise, helpful, friendly, smart, slightly witty, and plain English.

Witty is flavour, not the meal.

Avoid corporate/AI clichés such as: utilise, facilitate, commence, leverage, optimise, seamlessly, revolutionise, supercharge, empower, cutting-edge, next-generation, game-changing.

Prefer direct language.

Examples:

- "Calculate your GST."
- "Turn PDF into Word."
- "Make an invoice."
- "Get it done."
- "Done."
- "You're all set."
- "Ready to download."
- "One less thing to figure out."
- "Sorted."

Occasional Indian-flavoured microcopy is acceptable: "Bas. You're done.", "Kaam ho gaya.", "Chalo, sorted." Do not force Hinglish or stereotypical Indian references.

CTAs should describe the action: Calculate, Convert, Generate, Create invoice, Download, Copy result, Try another, Start again.

---

# 9. Core UX Principle

Every KaamKit tool should follow:

> **Find → Do → Done**

The website should never explain KaamKit for longer than it takes to use KaamKit.

Prioritise the user's task over decorative content. Use progressive disclosure. Do not expose advanced options until they are useful.

---

# 10. Website and Tool Architecture

Public tool pages should generally share a common framework while allowing each tool to have a task-specific interface.

Typical tool page structure:

1. Breadcrumb
2. H1
3. Short explanation
4. Tool interface
5. Result/output
6. How it works
7. Useful information where genuinely helpful
8. FAQs where appropriate
9. Related tools

Do not mechanically add content just to increase page length.

Principle:

> **Utility first. SEO second.**

---

# 11. Locked Top-Level Categories

These top-level categories are locked. Do NOT rename, merge, add, or remove them without explicit approval:

1. Money
2. Work
3. Business
4. Documents
5. Images & Files
6. Writing
7. Career
8. Everyday
9. India
10. Creators

Tools may have a primary category and optional secondary/discovery categories.

---

# 12. Initial Tool Catalogue

## Money
- GST Calculator
- EMI Calculator
- Salary Calculator
- Percentage Calculator
- Discount Calculator

## Work
- URL Shortener
- UTM Builder
- Time Calculator
- Date Difference Calculator
- Meeting Time Converter

## Business
- Invoice Generator
- Quotation Generator
- Receipt Generator
- QR Code Generator
- Profit Margin Calculator

## Documents
- PDF to Word
- JPG to PDF
- Merge PDF
- Split PDF
- Resume Generator

## Images & Files
- JPG to PNG
- PNG to JPG
- JPG to WEBP
- WEBP to JPG
- Image Compressor

## Writing
- Word Counter
- Character Counter
- Case Converter
- Text Cleaner
- Lorem Ipsum Generator

## Career
- Resume Builder
- Cover Letter Generator
- Notice Period Calculator
- Experience Calculator
- LinkedIn Bio Generator

## Everyday
- Age Calculator
- Tip Calculator
- Split Bill Calculator
- Countdown Timer
- Random Number Generator

## India
- Indian Number to Words
- Indian Currency Converter
- GST Calculator
- Salary / CTC Calculator
- Gratuity Calculator

## Creators
- Instagram Image Resizer
- Social Media Bio Generator
- Hashtag Generator
- Favicon Generator
- Meme Generator

This catalogue is a planning baseline. Do not assume every tool is approved for immediate implementation.

---

# 13. Launch and Catalogue Strategy

Do NOT create a giant directory full of empty categories or fake "coming soon" tools.

The website should grow incrementally.

Pattern:

```text
1 live tool → one strong experience
2–4 live tools → available tools
5+ live tools → featured/popular + all tools
```

Each tool should exist once in the underlying data model, with a primary category and optional secondary/discovery categories.

Avoid duplicate tool implementations.

---

# 14. Current Development Order

Approved development order:

1. Work → URL Shortener
2. Business → QR Code Generator + Campaigns + Analytics
3. Images & Files → JPG to PNG
4. PNG to JPG
5. JPG to WEBP
6. WEBP to JPG
7. Image Compressor
8. Documents → PDF to Word
9. Documents → JPG to PDF
10. Money → GST Calculator

Then continue based on product priorities.

For each tool:

```text
Build locally → test → document → user approval → deploy → add to live category → next tool
```

---

# 15. URL Shortener — Current Product Direction

The URL Shortener is the first product.

Initial free experience should support:

- Paste URL
- Shorten
- Copy/share
- Custom slug where appropriate
- Basic management/history

Paid capabilities may include:

- Advanced analytics
- Click counts
- Geography
- Device
- Browser
- OS
- Referrer
- Campaigns
- Link management
- Editable destination where appropriate
- Expiry
- Exports
- Branded links
- Custom domains
- Increased usage
- Future team features

Use an **entitlement-based system**, not scattered hard-coded plan limits.

Preferred progression:

```text
Anonymous → Free account → Paid account
```

Basic shortening should be possible without forcing account creation where technically appropriate. Saving, tracking, history and advanced functionality can encourage account creation.

---

# 16. QR Product Direction

The QR Generator is planned as a full product, not merely a visual QR encoder.

Potential QR types include URL, Text, Email, Phone, WhatsApp, Wi-Fi, vCard/contact, SMS, Social, Location, and Event.

Potential customization includes colours, patterns, shapes, logo, size, error correction, transparent background, and download formats.

QR should support static QR, dynamic QR, saved QR, campaigns, analytics, downloads, accounts, and free/paid capabilities.

Planned campaign model:

```text
Campaign → QR → Tracking URL → Destination → Analytics
```

The URL Shortener and QR Generator should share analytics infrastructure where practical.

IMPORTANT: QR components in the existing design-system reference are **provisional**. Do not treat them as the final QR product specification until the QR product design phase is explicitly approved.

---

# 17. Images & Files Architecture

Initial image tools:

- JPG → PNG
- PNG → JPG
- JPG → WEBP
- WEBP → JPG
- Image Compressor

Preferred flow:

```text
Upload → Validate → Queue/process → Progress → Output → Download → Delete/retention
```

UX should support where appropriate drag/drop, file picker, preview, progress, processing, errors, success, batch processing, remove, download, and retry.

Security considerations include MIME/type validation, file size limits, malicious file handling, temporary storage, automatic deletion/retention policy, rate limiting, abuse prevention, processing isolation, and storage-cost control.

---

# 18. Security

Security is a first-class concern for URLs, redirects, user input, uploaded files, documents, external resources, accounts, payments, and analytics.

For the URL Shortener consider malicious URL detection/blocking, phishing prevention, spam/abuse prevention, rate limiting, redirect safety, reporting, blocking, domain reputation, and abuse controls.

For file tools consider MIME validation, file size limits, processing isolation, temporary storage, automatic deletion, and abuse/rate limits.

Never weaken security simply to make the first implementation easier.

---

# 19. Redirect Architecture

Short-link redirect handling should be:

> **Architecturally separated and optimized for low latency.**

Do not over-engineer the infrastructure prematurely. Keep redirect paths isolated from the main marketing/application route tree where appropriate. Optimise only when there is a demonstrated need.

---

# 20. SEO

Every public tool should have a consistent SEO framework.

At minimum, where appropriate:

- Unique title
- Unique meta description
- H1
- Canonical URL
- Server-rendered metadata
- Breadcrumbs
- Appropriate structured data
- Useful supporting content
- Internal links
- Related tools
- Appropriate indexability

Tool metadata should be generated from the tool's actual data/content rather than duplicated manually across pages.

Do not create thin SEO pages purely to capture keywords. Do not generate keyword-stuffed content.

Do not add query-parameter-driven title manipulation simply for programmatic SEO unless it has been explicitly designed, tested, and approved.

---

# 21. Structured Data

Use structured data only when it accurately represents the page.

Do not blindly inject `WebApplication` JSON-LD into every HTML file simply because a previous prototype instruction required it.

For Next.js, use an appropriate server-rendered implementation and validate the resulting structured data.

Never output inaccurate or misleading schema.

---

# 22. Analytics

Planned analytics architecture:

### Overall website/business
- Google Analytics 4
- Google Search Console

### Product analytics
First-party analytics for products where useful, especially URL Shortener, QR Generator, and Campaigns.

### Performance
Cloudflare Web Analytics may be used where useful.

Do not collect unnecessary personal data.

---

# 23. Monetization

Do not assume every tool must be monetized directly. Evaluate tools as part of a portfolio.

A tool may primarily serve Traffic, SEO, Acquisition, Brand, Revenue, Email/user acquisition, or Authority.

Potential monetization models include advertising, freemium, premium tools, paid templates, subscriptions, one-time purchases, business/professional tools, API access, affiliate revenue, sponsorships, and white-label tools.

Do not add monetization UI merely because it is technically possible. Protect the simplicity of the core tool experience.

---

# 24. Advertising

Architect a reusable `AdSlot` capability when appropriate, but keep advertising disabled during initial development unless explicitly required.

Initial advertising direction: Google AdSense with manual placements initially.

Do NOT place ads inside the core tool interaction where they interfere with completing the task. Paid dashboards should not be cluttered with ads.

---

# 25. Authentication and Entitlements

Prefer:

```text
Anonymous → Free account → Paid account
```

Account creation should provide meaningful benefits such as saving work, history, analytics, link management, saved QR codes, higher limits, exports, and premium features.

Use a central entitlement model rather than hard-coding feature restrictions throughout individual tools.

---

# 26. Design System Components

Build reusable components where they create genuine consistency.

Important shared component areas include buttons, inputs, search, dropdowns, cards, tool cards, tabs, badges, modals, tooltips, navigation, footer, alerts, notifications, upload/drop zones, file cards, result cards, copy/download controls, QR preview/customisation, analytics cards, charts, tables, filters, and dashboard navigation.

Do not create abstractions merely for the sake of abstraction. A component should be reusable because it represents a real repeated pattern.

---

# 27. UI States

Every interactive tool should consider the appropriate states:

- Empty
- Loading
- Processing
- Success
- Error
- Disabled
- Offline where relevant

Do not design only the happy path.

Errors should be clear, calm, helpful, and actionable.

Success copy should be concise: "Done.", "You're all set.", "Ready to download."

---

# 28. Responsive Design

All interfaces must work properly across mobile, tablet, and desktop.

Use mobile-first responsive implementation.

Pay particular attention to touch targets, form controls, sliders, numeric inputs, upload areas, tables, analytics charts, navigation, modals, tool result cards, and copy/download actions.

Do not claim mobile QA is complete unless it has actually been tested.

---

# 29. Accessibility

Every production interface should consider keyboard navigation, focus states, semantic HTML, labels, accessible names, colour contrast, reduced motion where appropriate, screen-reader usability, touch target size, and error messaging.

Do not use colour alone to communicate important information.

---

# 30. Light and Dark Themes

Both light and dark themes are required where the product design supports them.

Do not create a separate visual identity for dark mode.

Use the same KaamKit brand identity through semantic tokens.

When modifying theme variables, check text contrast, borders, surfaces, muted text, brand accents, interactive states, and disabled states.

A washed-out light theme or broken dark theme is a bug, not a design choice.

---

# 31. Performance

Prefer server-rendered content where appropriate, minimal client-side JavaScript, code splitting where useful, optimised images, appropriate caching, efficient database access, and lazy loading where appropriate.

Do not turn every component into a client component without reason.

Do not add large dependencies for simple functionality.

Performance is important, but avoid premature optimisation.

---

# 32. Dependencies

Before adding a dependency:

1. Check whether the functionality can reasonably be implemented with existing tools.
2. Check whether the dependency is necessary.
3. Check its maintenance/security implications.
4. Avoid adding dependencies for trivial functionality.
5. Document meaningful architectural dependencies.

The previous prototype instruction saying "no third-party NPM packages" is NOT a permanent KaamKit rule. Use dependencies when they provide clear value and are appropriate for production.

---

# 33. Indian-Specific Tools

For India-specific tools, use appropriate Indian conventions, including INR/₹, Indian number formatting such as `₹1,25,000`, and Indian business/tax concepts.

Do not use IP-based geolocation to arbitrarily decide whether a currency should be INR or USD. Currency should be determined by the tool's intended context, user selection, locale where appropriate, or explicit product rules.

For regulated or high-impact financial/tax functionality:

- Validate inputs carefully.
- Clearly communicate assumptions.
- Avoid presenting calculations as professional legal/tax advice.
- Do not invent regulatory rules.
- Verify current rules when the product depends on time-sensitive regulations.

---

# 34. Existing Prototype Instructions — Superseded

Some earlier Claude Chat/Cowork prototype instructions conflict with the current KaamKit architecture.

### Superseded: Tailwind via CDN
Current: Tailwind CSS installed locally and compiled for production.

### Superseded: Vanilla JavaScript only
Current: KaamKit is a full-stack Next.js/TypeScript/React application. Use client-side React where appropriate and server-side functionality where the product requires it.

### Superseded: Dark-mode-only utility interfaces
Current: KaamKit supports both light and dark themes using one brand identity.

### Superseded: Electric Cyan / Deep Slate palette
Current approved brand palette:

```text
#0C2248
#FE6336
#FDBD43
#38BBAC
#6934D0
```

### Superseded: Mandatory query-parameter SEO manipulation
Do not dynamically manipulate page titles/descriptions from arbitrary URL query parameters for SEO unless explicitly approved.

### Superseded: Mandatory WebApplication JSON-LD on every tool
Structured data must be accurate and appropriate to the actual page.

### Superseded: Automatic INR/USD switching based on IP
Do not use IP-based currency switching as a default architecture.

---

# 35. Design Reference

The existing KaamKit design-system reference should be treated as a **visual/reference artifact**, not as production implementation code.

If it contains prototype-only implementation such as Tailwind CDN, direct Google Fonts links, vanilla JS demos, or static demo data, do not copy those implementation choices directly into production.

Translate the approved visual/design language into the actual Next.js/Tailwind architecture.

---

# 36. Git and Change Management

Before making substantial changes:

```bash
git status
```

Understand existing changes before modifying files. Do not overwrite unrelated user work.

Prefer small, coherent commits. Commit messages should explain the meaningful change.

Do not push destructive changes without approval. Do not reset/rebase/delete user work unless explicitly instructed.

When a task is complete, report:

- What changed
- Files changed
- Tests run
- QA performed
- Documentation updated
- Known limitations
- Recommended next step

---

# 37. Worktrees and Multiple Agents

Git worktrees may be used later when multiple coding agents need isolated branches/workspaces.

Do not create worktrees unnecessarily during early development.

If worktrees are used:

- Each task should have a clear branch.
- Agents should not edit the same physical working directory simultaneously.
- Changes should be reviewed before merging.
- Documentation remains part of the shared source of truth.
- Merge conflicts must be resolved deliberately.

The repository and documentation, not agent memory, are the synchronization mechanism.

---

# 38. Skills

Use project skills for repeatable workflows.

Preferred project skill areas:

```text
.claude/skills/
├── kaamkit-design/
├── tool-builder/
├── qa-review/
└── documentation-sync/
```

Potential later skills:

```text
seo-tool/
security-review/
ship/
```

Do not create a large collection of overlapping skills.

Skills should contain concise repeatable instructions and point to `docs/` for detailed project information.

---

# 39. QA Requirement

Do not say "Done" simply because the code was written.

For meaningful UI or feature work:

1. Run the application.
2. Check for build/type/lint errors as applicable.
3. Test the main interaction.
4. Test relevant edge cases.
5. Check responsive behaviour.
6. Check light/dark themes where applicable.
7. Check accessibility basics.
8. Inspect visual output.
9. Fix issues discovered.
10. Update documentation.

If visual/browser testing is unavailable, state that clearly instead of claiming it was performed.

---

# 40. User Approval Gates

The following require user approval when they materially change the product:

- Brand direction
- Logo/identity
- Major visual redesign
- Top-level navigation/category changes
- Product scope
- Pricing/monetization strategy
- Major architecture changes
- Authentication model
- Data/privacy model
- Analytics strategy
- Major SEO architecture
- New third-party services
- Major dependencies
- Security trade-offs
- Major database/schema decisions

Routine implementation details do not need approval.

---

# 41. When Starting a New Task

Use this sequence:

```text
1. Read CLAUDE.md
2. Read relevant docs
3. Inspect repository
4. Check git status
5. Understand existing implementation
6. Restate the task briefly
7. Identify assumptions/conflicts
8. Implement the smallest correct change
9. Test
10. Visually/UX inspect where relevant
11. Fix
12. Update documentation
13. Report
14. Wait for approval when an approval gate applies
```

Do not rebuild existing functionality without first understanding why it exists.

Do not replace an approved design simply because you prefer another design.

Do not add complexity unless it solves a real problem.

---

# 42. The KaamKit Test

Before finalising any user-facing experience, ask:

> **Does this help the user get the small thing done faster?**

Then ask:

- Is it clear?
- Is it useful?
- Can it be shorter?
- Does it feel human?
- Does it feel like KaamKit?
- Is the humour necessary?
- Are we designing for the user rather than the search engine?

If there is a conflict between SEO decoration and user utility:

> **The user wins.**

---

# 43. Final Principle

KaamKit is not trying to be another giant software platform.

It should feel like a useful internet destination:

> **"I have a small problem. KaamKit probably has a tool for it."**

Build toward that feeling.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
