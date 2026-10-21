# KaamSolv Image Kit

## Vision

> **"I have an image. I need to do something with it."**

The Image Kit is KaamSolv's unified workspace for image tasks — not a wall of disconnected SEO converters.

### Modules (roadmap)

| Module | Purpose | Status |
|--------|---------|--------|
| **Convert** | Format conversion | Live |
| **Compress** | Reduce file size | Live — `/image-compressor` |
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
- Not yet: batch (several images at once), target file size ("under 200 KB").

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
