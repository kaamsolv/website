# Image Conversion Engine

Part of the [KaamSolv Image Kit](./image-kit.md). See the Image Kit doc for vision, module roadmap, and format registry architecture.

## Live input formats (decode)

| Format | Decoder | Notes |
|--------|---------|-------|
| JPG/JPEG | Browser (`createImageBitmap`) | |
| PNG | Browser | Transparency preserved |
| WebP | Browser | |
| AVIF | Browser | Decode only; encode not offered |
| HEIC/HEIF | WASM (`heic2any`) | Decode only |
| GIF | Browser | First frame only (Phase 1) |
| APNG | Browser | Treated as PNG; first frame |
| BMP | Browser | Decode only |
| ICO | Browser | Largest/smallest icon frame |
| SVG | Rasterize (`createImageBitmap`) | Vector → raster; not vector export |

## Live output formats (encode)

| Format | Encoder |
|--------|---------|
| JPG | Canvas `convertToBlob` / `toBlob` |
| PNG | Canvas (lossless) |
| WebP | Canvas (quality slider) |

## Architected / not yet live

TIFF, JXL, JP2, ICNS, and all camera RAW, design, and professional formats are defined in the registry but **not offered** in the UI until codecs ship.

## Conversion pipeline

```text
decode → resize → transform/optimize → encode → preview → download
```

| Step | Module | Notes |
|------|--------|-------|
| Decode | `codecs/decode.ts` | Format-specific adapters |
| Resize | `transform/resize.ts` | Original, scale %, or custom px |
| Optimize | `transform/optimize.ts` | Format-aware encode params (quality for lossy) |
| Encode | `codecs/encode.ts` | Canvas / OffscreenCanvas |

Transform orchestration: `transform/index.ts` — future steps (crop, rotate, flip, metadata removal, social presets) plug in here without duplicating per-route logic.

### More options (converter UI)

Collapsed by default. When enabled:

- **Resize** — original size (default), scale percentage, or custom width/height with optional aspect ratio lock. Output dimensions previewed before convert.
- **Quality** — shown only for lossy outputs (JPG, WebP). PNG has no fake quality slider.

## Web Worker

`worker/convert.worker.ts` runs the pipeline off the main thread. Progress stages are truthful — no fake percentages.

**Exception — HEIC is decoded on the main thread.** `heic2any` needs `window`
and `document` (it starts its own decode worker and draws the result on a
canvas), so it can't run inside our worker. `worker-client.ts` turns a HEIC
file into a JPEG first (`prepareInput` → `decodeHeicBlob`), then sends that to
the worker like any other JPEG. The heavy decoding still happens off the main
thread, in heic2any's own worker. This applies to the converters, the Image
Compressor and Resize image to KB. Until 2026-10-22, HEIC went straight to the
worker and failed on every file with "window is not defined".

## WASM

- **heic2any** — HEIC/HEIF decode only, browser main thread only (see Web Worker above). Dynamically imported when a HEIC file is processed. The server build gets `app/lib/image/heic2any-server-stub.ts` instead (`turbopack.resolveAlias` in `next.config.mjs`), keeping it out of the Cloudflare Worker.

## Tests

- `npm test`: image unit tests (`test/image-*.test.mts`).
- `tests/e2e/heic.spec.ts` (Playwright): a real HEIC converts to JPG and PNG
  (size and colours checked), a broken HEIC shows the HEIC error, and the
  compressor accepts HEIC. The fixture `tests/e2e/fixtures/photo.heic` is a real
  HEIC laid out like an iPhone photo (2 × 2 grid of HEVC tiles). Regenerate it
  with `node tests/e2e/fixtures/make-heic.mts` (needs ffmpeg with libx265).

## Limits

25 MB · 16,384 px max dimension · 50 MP max pixels

## SEO routes (Phase 1)

`/jpg-to-png`, `/png-to-jpg`, `/jpg-to-webp`, `/png-to-webp`, `/webp-to-jpg`, `/webp-to-png`, `/heic-to-jpg`, `/heic-to-png`, `/avif-to-jpg`, `/avif-to-png`

Legacy `/image-tools/:slug` redirects to `/:slug`.
