# PDF tools

**Routes:** `/pdf-tools` (hub), `/compress-pdf`, `/merge-pdf`, `/split-pdf`,
`/pdf-to-jpg`, `/jpg-to-pdf` · **Category:** Documents · **Status:** Stage 1
(free tools) **live** since 2026-10-25. Decisions: [`DECISIONS.md`](../DECISIONS.md)
(2026-10-25 entry).

## What it is

Drop a file → pick an action → download. Compress, Merge, Split and Convert
(PDF → JPG, JPG → PDF) in one workspace. **Everything runs in the browser;
files are never uploaded.** No account, no daily cap, no watermark.

The six pages share one workspace (`PdfWorkspace`). Each task page opens it on
its own action with its own H1, copy, FAQ and metadata; switching action keeps
the loaded file and updates the URL (`router.replace`), like the image
converters. The hub stays at `/pdf-tools` and also takes photos (they switch it
to JPG → PDF) and several PDFs (they switch it to Merge).

## Free tier (Stage 1)

| Tool | Free | Pro key (Stage 2, not built) |
|---|---|---|
| All | 10 MB per file | `pdf_large_files` → 50 MB |
| Compress | One file, standard level | `pdf_batch_compress` → several files, strong level |
| Merge | Up to 3 PDFs, reorder | `pdf_unlimited_merge` → more files, page order across files |
| Split | Tick pages → one new PDF | `pdf_advanced_split` → ranges, every N pages, ZIP |
| PDF → JPG | All pages, 150 or 300 DPI, ZIP | `pdf_batch_convert` → several PDFs |
| JPG → PDF | Up to 5 images (JPG, PNG, WebP, HEIC) | `pdf_batch_convert` → more images |
| PDF → Word | One file, text first (see below) | `pdf_convert_office` is reserved for a later high-fidelity / batch version |
| — | — | `pdf_convert_office`, `pdf_ocr`: reserved, separate decisions |

Limits live in `app/lib/pdf/limits.ts`; each asks `can(key)` for its own key.
Nobody holds the keys yet (no `pdf_pro` plan seeded, no migration). Limit
messages are calm and don't mention Pro until Pro exists.

Safety caps for every plan (not paywalls): 300 pages for thumbnails / PDF → JPG,
100 files as the hidden ceiling for Pro batches, canvases under 16 MP (iOS).

## How each tool works

- **Compress** (`app/lib/pdf/compress.ts`): finds images it can safely rewrite —
  JPEG, or 8-bit Flate/raw pixels, grey or RGB (incl. ICC-based), no `/Mask`,
  `/Decode`, image masks or soft-mask targets. Shrinks each to at most **150 DPI
  of the largest page** (so small images are never touched), re-encodes as JPEG
  q 0.72 with a canvas, and swaps it in only if ≥ 10% smaller. Lossless images
  that already deflate well (drawings, screenshots) stay lossless. Uncompressed
  streams are deflated; saved with object streams. Text, links, bookmarks and
  forms are untouched. Result shown only if ≥ 2% smaller; otherwise "already
  about as small as it gets", no download. Runs in a Web Worker
  (`worker/compress.worker.ts`, OffscreenCanvas), main-thread fallback.
- **Merge / Split / JPG → PDF** (`app/lib/pdf/pages.ts`): pdf-lib `copyPages` /
  `embedJpg` / `embedPng`; pages are copied, never redrawn. Merge drops
  bookmarks and fillable form fields from the inputs (FAQ says so).
- **JPG → PDF** (`prepare-image.ts`): JPG and PNG are embedded untouched; a JPG
  with EXIF rotation, WebP and HEIC are redrawn as JPG q 0.92 (HEIC through the
  image kit's `decodeHeicBlob`). Page size A4 (turned for landscape) or the
  photo's own shape (long side = A4 long side); margin none or ~1 cm
  (`image-layout.ts` — not `layout.ts`, which Next.js would treat as a route layout).
- **PDF → JPG / thumbnails** (`pdfjs.ts`): pdf.js renders on white; JPG q 0.9;
  "Download all" zips with fflate (stored, level 0).
- **Refused:** password-protected PDFs (an `/Encrypt` scan before parsing), non-PDFs
  (`%PDF-` within the first 1024 bytes), files over the limit.

## PDF → Word (`/pdf-to-word`) — text first, in the browser

Decision (2026-10-27): free for everyone, 10 MB, no server, no new dependency. pdf.js reads the text, `paragraphs.ts` makes
paragraphs and headings, `docx.ts` writes a plain `.docx` with fflate. The page says what it does **not** do, before the download.

**Comes across:** the text, in reading order (top to bottom, left to right); paragraphs (a blank line, a short last line, a
first-line indent, a bullet or a size change starts one); headings (short lines set clearly larger than the body: three levels);
wide gaps as tabs; one page break per PDF page; the first page's size (A4, Letter, landscape or custom).

**Does not:** images, tables (a row comes out as one line with tabs), columns (read top to bottom, so two columns mix), fonts,
bold/italic, exact spacing, links, headers/footers as such. **Scanned PDFs** (no text) are refused with a plain message
(`no-text`); a PDF with very little text is converted but flagged ("may be a scan"). 300-page cap (`MAX_TEXT_PAGES`).
Devanagari and other scripts stored with custom glyph maps can extract wrongly; untested without a real sample, so not promised.

| Piece | File |
|---|---|
| Text positions → paragraphs, headings (pure) | `app/lib/pdf/to-word/paragraphs.ts` (not `layout.ts`: Next.js treats that name as a route layout) |
| Paragraphs → `.docx` bytes, XML escaping, page size (pure) | `app/lib/pdf/to-word/docx.ts` |
| Pages → result, scan refusal, "sparse" flag (pure) | `app/lib/pdf/to-word/convert.ts` |
| pdf.js → text runs (the only pdf.js part) | `app/lib/pdf/to-word/extract.ts` |
| Entry point, file name | `app/lib/pdf/to-word/index.ts` |
| UI | `app/_components/pdf/pdf-workspace.tsx` (convert mode `to-word`, `DocxResult`) |

Tests: `test/pdf-to-word.test.mts` (layout, the `.docx` parts and XML well-formedness, escaping, real PDFs through the real
pdf.js in Node) and `tests/e2e/pdf-to-word.spec.ts` (real files in the browser, the downloaded `.docx` unzipped and read,
scan / password / not-a-PDF / too-big refusals, nothing uploaded, screenshots).
**Not verified by any test: how Microsoft Word, Google Docs or Pages display the file** — open real converted files there.

## Libraries and the Worker

| Library | Role | Size (gzip, lazy) |
|---|---|---|
| `pdfjs-dist` 6.4 (legacy build) | Render, thumbnails, PDF → JPG | ~151 KB + worker ~391 KB |
| `@cantoo/pdf-lib` 2.11.1 (pinned) | Compress, merge, split, images → PDF | ~222 KB |

Both load only on first use (dynamic `import()`), never with the page. The page
imports only library-free helpers (`outcome.ts`, `limits.ts`, `validate.ts`,
`order.ts`). The server build gets stubs via `turbopack.resolveAlias` in
`next.config.mjs` (`app/lib/pdf/server-stubs/`); the stubs throw, so a stray
server-side import fails loudly in dev instead of bloating the Worker.

pdf.js's runtime files — WASM decoders for JBIG2 / JPEG 2000 scans and colour
profiles, the standard fonts, the CMYK profile (~1.9 MB) — are static assets in
`public/vendor/pdfjs/`, copied by `npm run pdfjs:sync`
(`scripts/sync-pdfjs-assets.mts`). `test/pdf-validate.test.mts` fails if they
drift from the installed version. Left out: `quickjs-eval` (PDF JavaScript,
never run) and `cmaps` (only for non-embedded CJK fonts).

## Code map

| Path | Role |
|---|---|
| `app/lib/pdf/` | Engine: `validate`, `limits`, `errors`, `image-layout`, `compress`, `pages`, `outcome`, `order`, `client` (browser entry points), `pdfjs`, `canvas-reencoder`, `prepare-image`, `worker/` |
| `app/_components/pdf/pdf-workspace.tsx` | The workspace: drop zone, action picker, panels, results |
| `app/_components/pdf/order-list.tsx` | Reorderable list (Move up/down, drag on desktop, remove) |
| `app/_components/pdf/pdf-thumb.tsx` | Lazy page previews (IntersectionObserver, 2 at a time) |
| `app/_components/pdf/pdf-tool-page.tsx` | Copy, FAQ and metadata for the six pages |
| `app/(pdf-tools)/*/page.tsx` | The six routes |

## Tests

- `npm test`: `test/pdf-compress.test.mts` (PDF walk with a fake encoder, caps,
  predictors, masks), `test/pdf-pages.test.mts`, `test/pdf-validate.test.mts`
  (header, encryption, limits per key, layout, EXIF, vendor assets).
- `tests/e2e/pdf.spec.ts` (Playwright): builds its sample files at run time
  (`pdf-fixtures.ts`: a ~5 MB photo PDF, a 3-page scan, a 12-page document, a
  locked PDF, a fake and an oversized file, six photos) and checks every tool's
  download. Run beside another dev server with `KK_E2E_PORT=3103`.

## Not doing (v1)

Editing, e-signatures, PDF → PowerPoint, unlocking passwords, any server upload,
PDF → Word/Excel (good layout needs a server — separate decision), OCR
(tesseract.js is feasible in the browser but heavy — separate decision),
"compress to under N KB".
