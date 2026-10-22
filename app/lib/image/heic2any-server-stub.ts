/**
 * Server-side stand-in for heic2any (see `turbopack.resolveAlias` in
 * next.config.mjs). HEIC images are decoded in the browser only, but the image
 * tools are also rendered on the server, so without this the 1.3 MB WASM
 * decoder would be bundled into the Cloudflare Worker for nothing.
 */
export default function heic2any(): never {
  throw new Error('heic2any is browser-only in KaamSolv');
}
