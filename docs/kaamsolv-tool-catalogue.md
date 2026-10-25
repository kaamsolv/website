# KaamSolv Tool Catalogue — Master Product Universe

**Status:** Master catalogue, not a build list. Confirms Phase 0/1 approvals. Updated: Phase 1.

---

## 1. Locked category structure

These 10 names are final. Do not rename, merge, or add to this list.

`Money · Work · Business · Documents · Images & Files · Writing · Career · Everyday · India · Creators`

---

## 2. Routing decision (new — needs your confirmation)

Phase 0 defined routes for `/calculators/`, `/generators/`, and `/image-tools/`. This catalogue adds tools that don't fit those three cleanly (document converters, text utilities, career tools). Recommended rule, applied consistently below:

**A tool's URL is driven by its `tool_type` (functional grouping, good for search intent). Its category is driven by `primary_category` (topical, good for browsing). These are independent** — a tool lives at one canonical URL and can be discovered from up to two categories.

| tool_type | Route pattern |
|---|---|
| calculator | `/calculators/:slug` |
| generator | `/generators/:slug` |
| image-converter | `/image-tools/:slug` |
| document-tool | `/documents/:slug` *(new — not in Phase 0's IA, added here)* |
| text-utility | `/writing/:slug` *(new)* |
| flagship | its own root path (`/url-shortener`, `/qr-code-generator`) |

Flag: **Decision required** — approve the two new route segments (`/documents/`, `/writing/`) before Phase 2 builds the URL routing layer.

---

## 3. Tool data model (per §7 of your instructions)

```
Tool {
  name, slug, url,
  primary_category,        // one of the 10 locked names
  secondary_categories[],  // 0-2 of the 10, for cross-discovery only
  tool_type,               // calculator | generator | image-converter | document-tool | text-utility | flagship
  description,
  status,                  // planned | in_development | live
  build_priority,          // integer, lower = sooner; null = backlog
  seo: { title, meta_description },
  related_tools[],         // slugs
  acquisition_role,        // seo_traffic | social_share | brand_authority | retention_hook
  monetisation_role        // free_forever | freemium_core | premium_feature | lead_gen_for_paid
}
```

A tool exists **once**. Where the source brief listed the same tool under two category headings (e.g. GST Calculator under both Money and India), it is modelled here as **one record** with a primary category and a secondary category — not two records. See flagged ambiguities in §6.

---

## 4. Canonical catalogue (JSON)

```json
[
  { "name":"GST Calculator", "slug":"gst-calculator", "url":"/calculators/gst-calculator", "primary_category":"Money", "secondary_categories":["India"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"EMI Calculator", "slug":"emi-calculator", "url":"/calculators/emi-calculator", "primary_category":"Money", "secondary_categories":[], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Percentage Calculator", "slug":"percentage-calculator", "url":"/calculators/percentage-calculator", "primary_category":"Money", "secondary_categories":["Everyday"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Discount Calculator", "slug":"discount-calculator", "url":"/calculators/discount-calculator", "primary_category":"Money", "secondary_categories":["Everyday"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },

  { "name":"URL Shortener", "slug":"url-shortener", "url":"/url-shortener", "primary_category":"Work", "secondary_categories":["Business","Creators"], "tool_type":"flagship", "status":"planned", "build_priority":1, "acquisition_role":"retention_hook", "monetisation_role":"freemium_core" },
  { "name":"UTM Builder", "slug":"utm-builder", "url":"/generators/utm-builder", "primary_category":"Work", "secondary_categories":["Business"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Time Calculator", "slug":"time-calculator", "url":"/calculators/time-calculator", "primary_category":"Work", "secondary_categories":["Everyday"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Date Difference Calculator", "slug":"date-difference-calculator", "url":"/calculators/date-difference-calculator", "primary_category":"Work", "secondary_categories":["Everyday"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Meeting Time Converter", "slug":"meeting-time-converter", "url":"/calculators/meeting-time-converter", "primary_category":"Work", "secondary_categories":[], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },

  { "name":"Invoice Generator", "slug":"invoice-generator", "url":"/generators/invoice-generator", "primary_category":"Business", "secondary_categories":["Documents"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"premium_feature" },
  { "name":"Quotation Generator", "slug":"quotation-generator", "url":"/generators/quotation-generator", "primary_category":"Business", "secondary_categories":["Documents"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"premium_feature" },
  { "name":"Receipt Generator", "slug":"receipt-generator", "url":"/generators/receipt-generator", "primary_category":"Business", "secondary_categories":["Documents"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"premium_feature" },
  { "name":"QR Code Generator", "slug":"qr-code-generator", "url":"/qr-code-generator", "primary_category":"Business", "secondary_categories":["Work","Creators"], "tool_type":"flagship", "status":"live", "build_priority":2, "acquisition_role":"retention_hook", "monetisation_role":"freemium_core" },
  { "name":"Profit Margin Calculator", "slug":"profit-margin-calculator", "url":"/calculators/profit-margin-calculator", "primary_category":"Business", "secondary_categories":["Money"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },

  { "name":"PDF to Word", "slug":"pdf-to-word", "url":"/documents/pdf-to-word", "primary_category":"Documents", "secondary_categories":[], "tool_type":"document-tool", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"JPG to PDF", "slug":"jpg-to-pdf", "url":"/documents/jpg-to-pdf", "primary_category":"Documents", "secondary_categories":["Images & Files"], "tool_type":"document-tool", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"Merge PDF", "slug":"merge-pdf", "url":"/documents/merge-pdf", "primary_category":"Documents", "secondary_categories":[], "tool_type":"document-tool", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"Split PDF", "slug":"split-pdf", "url":"/documents/split-pdf", "primary_category":"Documents", "secondary_categories":[], "tool_type":"document-tool", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"Resume Generator", "slug":"resume-generator-documents", "url":"/generators/resume-generator", "primary_category":"Documents", "secondary_categories":["Career"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"premium_feature" },

  { "name":"JPG to PNG", "slug":"jpg-to-png", "url":"/image-tools/jpg-to-png", "primary_category":"Images & Files", "secondary_categories":[], "tool_type":"image-converter", "status":"planned", "build_priority":3, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"PNG to JPG", "slug":"png-to-jpg", "url":"/image-tools/png-to-jpg", "primary_category":"Images & Files", "secondary_categories":[], "tool_type":"image-converter", "status":"planned", "build_priority":4, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"JPG to WEBP", "slug":"jpg-to-webp", "url":"/image-tools/jpg-to-webp", "primary_category":"Images & Files", "secondary_categories":[], "tool_type":"image-converter", "status":"planned", "build_priority":5, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"WEBP to JPG", "slug":"webp-to-jpg", "url":"/image-tools/webp-to-jpg", "primary_category":"Images & Files", "secondary_categories":[], "tool_type":"image-converter", "status":"planned", "build_priority":6, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },
  { "name":"Image Compressor", "slug":"image-compressor", "url":"/image-tools/image-compressor", "primary_category":"Images & Files", "secondary_categories":[], "tool_type":"image-converter", "status":"planned", "build_priority":7, "acquisition_role":"seo_traffic", "monetisation_role":"freemium_core" },

  { "name":"Word Counter", "slug":"word-counter", "url":"/writing/word-counter", "primary_category":"Writing", "secondary_categories":[], "tool_type":"text-utility", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Character Counter", "slug":"character-counter", "url":"/writing/character-counter", "primary_category":"Writing", "secondary_categories":[], "tool_type":"text-utility", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Case Converter", "slug":"case-converter", "url":"/writing/case-converter", "primary_category":"Writing", "secondary_categories":[], "tool_type":"text-utility", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Text Cleaner", "slug":"text-cleaner", "url":"/writing/text-cleaner", "primary_category":"Writing", "secondary_categories":[], "tool_type":"text-utility", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Lorem Ipsum Generator", "slug":"lorem-ipsum-generator", "url":"/generators/lorem-ipsum-generator", "primary_category":"Writing", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },

  { "name":"Resume Builder", "slug":"resume-builder", "url":"/generators/resume-builder", "primary_category":"Career", "secondary_categories":["Documents"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"premium_feature" },
  { "name":"Cover Letter Generator", "slug":"cover-letter-generator", "url":"/generators/cover-letter-generator", "primary_category":"Career", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"premium_feature" },
  { "name":"Notice Period Calculator", "slug":"notice-period-calculator", "url":"/calculators/notice-period-calculator", "primary_category":"Career", "secondary_categories":[], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Experience Calculator", "slug":"experience-calculator", "url":"/calculators/experience-calculator", "primary_category":"Career", "secondary_categories":[], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"LinkedIn Bio Generator", "slug":"linkedin-bio-generator", "url":"/generators/linkedin-bio-generator", "primary_category":"Career", "secondary_categories":["Creators"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"social_share", "monetisation_role":"free_forever" },

  { "name":"Age Calculator", "slug":"age-calculator", "url":"/calculators/age-calculator", "primary_category":"Everyday", "secondary_categories":[], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Tip Calculator", "slug":"tip-calculator", "url":"/calculators/tip-calculator", "primary_category":"Everyday", "secondary_categories":[], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Split Bill Calculator", "slug":"split-bill-calculator", "url":"/calculators/split-bill-calculator", "primary_category":"Everyday", "secondary_categories":[], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Countdown Timer", "slug":"countdown-timer", "url":"/generators/countdown-timer", "primary_category":"Everyday", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Random Number Generator", "slug":"random-number-generator", "url":"/generators/random-number-generator", "primary_category":"Everyday", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },

  { "name":"Indian Number to Words", "slug":"indian-number-to-words", "url":"/generators/indian-number-to-words", "primary_category":"India", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Indian Currency Converter", "slug":"indian-currency-converter", "url":"/calculators/indian-currency-converter", "primary_category":"India", "secondary_categories":["Money"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Salary Calculator", "slug":"salary-calculator", "url":"/salary-calculator", "primary_category":"India", "secondary_categories":["Money","Career"], "tool_type":"calculator", "status":"live", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Gratuity Calculator", "slug":"gratuity-calculator", "url":"/calculators/gratuity-calculator", "primary_category":"India", "secondary_categories":["Money"], "tool_type":"calculator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },

  { "name":"Instagram Image Resizer", "slug":"instagram-image-resizer", "url":"/image-tools/instagram-image-resizer", "primary_category":"Creators", "secondary_categories":["Images & Files"], "tool_type":"image-converter", "status":"planned", "build_priority":null, "acquisition_role":"social_share", "monetisation_role":"freemium_core" },
  { "name":"Social Media Bio Generator", "slug":"social-media-bio-generator", "url":"/generators/social-media-bio-generator", "primary_category":"Creators", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"social_share", "monetisation_role":"free_forever" },
  { "name":"Hashtag Generator", "slug":"hashtag-generator", "url":"/generators/hashtag-generator", "primary_category":"Creators", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"social_share", "monetisation_role":"free_forever" },
  { "name":"Favicon Generator", "slug":"favicon-generator", "url":"/generators/favicon-generator", "primary_category":"Creators", "secondary_categories":["Business"], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"seo_traffic", "monetisation_role":"free_forever" },
  { "name":"Meme Generator", "slug":"meme-generator", "url":"/generators/meme-generator", "primary_category":"Creators", "secondary_categories":[], "tool_type":"generator", "status":"planned", "build_priority":null, "acquisition_role":"social_share", "monetisation_role":"free_forever" }
]
```

*(60 tools total: 5 per category × 10 categories, minus GST Calculator/Salary Calculator's cross-listing being modelled as secondary-category references rather than duplicate rows — see §6.)*

---

## 5. Build priority (incremental deployment order)

| Priority | Tool | Category | Phase |
|---|---|---|---|
| 1 | URL Shortener | Work | 3 |
| 2 | QR Code Generator | Business | 4 |
| 3 | JPG to PNG | Images & Files | 5 |
| 4 | PNG to JPG | Images & Files | 5 |
| 5 | JPG to WEBP | Images & Files | 5 |
| 6 | WEBP to JPG | Images & Files | 5 |
| 7 | Image Compressor | Images & Files | 5 |
| — | Everything else | — | Backlog, unprioritized until Phase 6+ |

Live category state today: **Work** will show 1 tool once Phase 3 ships. Every other category shows a plain count of 0 until its first tool deploys — no placeholder "coming soon" cards.

---

## 6. Flagged ambiguities (need your call, not assumed)

1. ~~**"Salary Calculator" (Money) vs. "Salary / CTC Calculator" (India)**~~ **Resolved 2026-10-25: one tool**, `/salary-calculator`, category India (see `DECISIONS.md`). Original note: modelled here as **two distinct tools** (a general take-home calculator vs. an India-specific CTC breakdown, which is a genuinely different calculation Indian job offers use). If you actually meant one tool discoverable from both categories, tell me and I'll merge them into a single record with Money as primary and India as secondary.
2. **"Resume Generator" (Documents) vs. "Resume Builder" (Career)** — modelled as **two distinct tools** for the same reason (a generator = fill-a-template document output; a builder = a guided multi-step tool, arguably a different product). Same flag: confirm or merge.
3. **New route segments** `/documents/` and `/writing/` (§2) — not in the Phase 0 sitemap, added here to house Documents and Writing category tools consistently. Needs approval before Phase 2's routing layer is built.

---

## 7. What this catalogue is not

Not a build order beyond the 7 prioritized items above. Not a commitment to build all 60. Not final SEO copy (title/meta_description fields exist in the schema but are intentionally left blank here — they get written per-tool, just before that tool ships, not speculatively in bulk).
