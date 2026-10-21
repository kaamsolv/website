# Image Conversion Engine

Part of the [KaamKit Image Kit](./image-kit.md). See the Image Kit doc for vision, module roadmap, and format registry architecture.

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

## WASM

- **heic2any** — HEIC/HEIF decode only. Dynamically imported when a HEIC file is processed.

## Limits

25 MB · 16,384 px max dimension · 50 MP max pixels

## SEO routes (Phase 1)

`/jpg-to-png`, `/png-to-jpg`, `/jpg-to-webp`, `/png-to-webp`, `/webp-to-jpg`, `/webp-to-png`, `/heic-to-jpg`, `/heic-to-png`, `/avif-to-jpg`, `/avif-to-png`

Legacy `/image-tools/:slug` redirects to `/:slug`.
