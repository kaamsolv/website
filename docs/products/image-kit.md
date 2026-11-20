# KaamSolv Image Kit

## Vision

> **"I have an image. I need to do something with it."**

The Image Kit is KaamSolv's unified workspace for image tasks — not a wall of disconnected SEO converters.

### Modules (roadmap)

| Module | Purpose | Status |
|--------|---------|--------|
| **Convert** | Format conversion | Live |
| **Compress** | Reduce file size | Live — `/image-compressor` |
| **Exact size** | Hit a KB limit / exact px or cm for forms | Live — `/resize-image-in-kb` |
| **Resize** | Change dimensions | Planned |
| **Edit** | Crop, rotate, flip | Planned |
| **Clean** | Remove metadata | Planned |
| **Prepare** | Social & passport sizes | Planned |
| **Create** | Favicon, PDF, contact sheet | Planned |

Module registry: `app/lib/image/kit/modules.ts`

## Compress module (`/image-compressor`)

Single image, processed in the browser through the same pipeline (decode →
resize → encode). Decisions live in `app/lib/image/compress.ts` (tested in
`test/image-compress.test.mts`); UI in `app/_components/image/image-compressor-workspace.tsx`.

- **Inputs:** JPG, PNG, WebP, HEIC, AVIF, BMP. GIF/SVG/ICO are refused with a
  clear message (animation / vector / icon need their own handling).
- **Levels:** Smaller file 0.6 · **Balanced 0.75 (default)** · Best quality 0.88
  (lossy encoder quality).
- **Save as:** JPG → JPG/WebP; WebP → WebP/JPG; **PNG → WebP by default**
  (keeps transparency), JPG or PNG offered; HEIC/AVIF/BMP → JPG/WebP. PNG→PNG
  has no quality control (lossless) — only Max size shrinks it.
- **Max size:** longest side 3840 / 2560 / 1920 / 1280 px, only values smaller
  than the image (never upscales), aspect ratio kept.
- **Never offers a bigger file:** if the result isn't smaller, the user is told
  to keep the original and given only the tips that apply.
- Output named `<name>-compressed.<ext>`. Re-encoding through canvas drops
  EXIF (camera data, GPS).
- The engine's `canProcess()` allows same-format re-encode (JPG→JPG); the
  converter UI still uses `canConvert()`, which doesn't.
- Measured locally: 4000×3000 JPG 5.8 MB → 2.2 MB (Balanced), → 89.8 KB as
  WebP at 1920 px; transparent PNG 974 KB → 56.5 KB WebP with alpha intact.
- Batch: up to 20 images at a time (see "Batch and daily limit" below). Target file size ("under 200 KB") is not yet built.

## Exact size module (`/resize-image-in-kb`)

For exam, job and government forms. Engine: `target-size.ts` (units, KB rule,
quality/scale search with an injected encoder), `crop.ts` (centre + zoom crop
state, contain rect), `jpeg-dpi.ts` (JFIF density), `target-pipeline.ts`
(decode once → crop/fit → search → DPI). Worker message `kind: 'target'`;
client `fitImageToTarget()`. UI: `resize-kb-workspace.tsx`, `crop-box.tsx`.
Tests: `test/image-target-size.test.mts`.

- **Output is always JPG** (white background), what forms accept.
- **KB rule:** aim ≤ N × 1000 bytes, so it passes forms counting 1 KB as 1000 or 1024.
- **Search:** top quality first; else binary search quality 0.2–0.95 (8 steps);
  if still too big and the pixel size isn't fixed, scale down and retry. With a
  fixed pixel size, the smallest result is shown as "can't get under", with a
  clearly labelled "Download anyway". Below a minimum → explained; **never
  padded** with junk bytes.
- **Exact size:** px / cm / mm / in at a DPI (default 300; passport preset
  3.5 × 4.5 cm = 413 × 531 px). Crop to fill (draggable, arrow keys, zoom 1–5×)
  or fit with white border. DPI written into the JPG when not using px.
- **Batch:** up to 20 images, shared settings, own crop each; "Download all"
  ZIP (fflate, stored uncompressed) contains only images that fit.
- Measured: 6 MB 4000×3000 → 47.5 KB @ 50 KB (scaled to 1244×933);
  → 19.4 KB @ 20 KB; passport 413×531 at 18.5 KB, 300 DPI.

## Batch and daily limit (converters and compressor)

Decided 2026-11-15 (plan approved by the owner): [`DECISIONS.md`](../DECISIONS.md).

- **Batch:** drop or pick up to **20 images** at a time, **25 MB** each, **150 MB** in total.
  Each file gets its own bar (stage-based, not timed) and its own Download. **Download all
  (.zip)** packs the finished files as one stored (uncompressed) ZIP, names kept, duplicates numbered.
- **Conversion starts on drop.** Changing a setting after a file is done marks it "settings
  changed" and shows **Convert again**; a file is never offered in settings it wasn't made with.
- **Two at a time** in the worker. Each file asks the daily counter before it starts. Files that
  didn't convert are given their count back, so a day's count is only files that worked.
- **Daily limit:** **25 files a day** for a visitor, counted per India calendar day (midnight IST).
  When it runs out, the rest of the batch waits and the page asks the visitor to **sign in**.
  Signed-in accounts get **100 a day** (placeholder: the owner to confirm the number).
- **Counter:** `POST /api/image-quota` with `{op: "use" | "give-back"}`, `GET` for the count.
  It holds a salted hash of the IP (visitors) or of the user id (signed in) plus the day, in the
  shared `rate_limits` table. **Only the count is sent. The image never is.** It fails open: if the
  counter can't be reached, the file converts without being counted.
- Rules: `app/lib/image/batch.ts` (limits, tally, ZIP) · `app/lib/image/quota-policy.ts` (numbers,
  day key) · `app/lib/rate-limit.ts` (`imageConvertDay`, `imageConvertDaySignedIn`) ·
  `app/_components/image/use-image-batch.ts` (queue) · `batch-panel.tsx` (UI).
- Not covered yet: Resize image to KB (it keeps its own batch of 20 and is not counted).

## Architecture

```text
React UI (workspace)
      ↓
Capability registry (what's possible)
      ↓
Conversion job
      ↓
Web Worker (preferred)
      ↓
Codec adapters (lazy-loaded)
      ↓
decode → resize → transform/optimize → encode
      ↓
Result (Blob, never uploaded)
```

Resize and quality controls live in the shared engine (`transform/`) so future Compress, Resize, and Edit modules reuse the same pipeline — not separate per-tool implementations.

### Key directories

| Path | Role |
|------|------|
| `app/lib/image/registry/` | Format capability matrix + encoding controls |
| `app/lib/image/codecs/` | Decoder/encoder adapters |
| `app/lib/image/transform/` | Composable transforms (resize today; crop/rotate planned) |
| `app/lib/image/pipeline.ts` | Shared processing pipeline |
| `app/lib/image/worker/` | Off-thread execution |
| `app/_components/image/` | Image Kit UI components |

## Format registry

Every format KaamSolv knows about is defined once in `registry/format-registry.ts`.

Each entry includes:

- `canDecode` / `canEncode` — what works **today**
- `tier` — live | architected | deferred | pro-only
- `kind` — raster | vector | layered | raw | animated
- `decoder` / `encoder` — which adapter handles it
- Browser vs WASM capability flags
- Transparency, animation, metadata flags

The UI queries `registry/capabilities.ts` — it never hard-codes format lists.

## SEO + workspace

- **SEO routes** (`/jpg-to-png`, etc.) provide initial from/to and unique metadata.
- **Unified workspace** lets users change formats without losing their upload.
- URL updates via `router.replace` when a matching SEO slug exists.
- Pairs without SEO routes still work if the capability matrix allows them.

See also: [image-conversion-engine.md](./image-conversion-engine.md)

## Privacy

- Images processed locally in the browser whenever possible.
- No server upload, storage, or analytics blobs.
- Pro-only formats (`tier: pro-only`) are architecture-ready but not offered — no silent upload.

## Adding a new format

1. Add entry to `format-registry.ts` with honest `canDecode`/`canEncode`.
2. Implement decoder/encoder adapter in `codecs/` if needed.
3. Add magic-byte detection in `validate.ts` if applicable.
4. Add SEO route in `routes.ts` only if there's search value.
5. Update documentation and tests.

Do not add UI options until the codec is implemented and tested.
