# KaamSolv Image Kit

## Vision

> **"I have an image. I need to do something with it."**

The Image Kit is KaamSolv's unified workspace for image tasks — not a wall of disconnected SEO converters.

### Modules (roadmap)

| Module | Purpose | Status |
|--------|---------|--------|
| **Convert** | Format conversion | Live |
| **Compress** | Reduce file size | Planned |
| **Resize** | Change dimensions | Planned |
| **Edit** | Crop, rotate, flip | Planned |
| **Clean** | Remove metadata | Planned |
| **Prepare** | Social & passport sizes | Planned |
| **Create** | Favicon, PDF, contact sheet | Planned |

Module registry: `app/lib/image/kit/modules.ts`

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
