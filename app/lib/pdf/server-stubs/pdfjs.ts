/**
 * Server-side stand-in for pdf.js and its worker (see `turbopack.resolveAlias`
 * in next.config.mjs) — they draw pages in the browser only, so the ~1.8 MB of
 * parser and decoders stays out of the Cloudflare Worker.
 */
function browserOnly(): never {
  throw new Error('pdfjs-dist is browser-only in KaamSolv');
}

export const GlobalWorkerOptions = {};
export const getDocument = browserOnly;
