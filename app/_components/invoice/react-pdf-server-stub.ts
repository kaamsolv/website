/**
 * Server-side stand-in for @react-pdf/renderer (see `turbopack.resolveAlias` in
 * next.config.mjs). PDFs are only ever made in the browser, but the editor is
 * also rendered on the server, so without this the whole PDF engine (~1 MB of
 * fonts/layout code) would be bundled into the Cloudflare Worker for nothing.
 */
function browserOnly(): never {
  throw new Error('@react-pdf/renderer is browser-only in KaamSolv');
}

export const pdf = browserOnly;
export const Font = { register: browserOnly, registerHyphenationCallback: browserOnly };
export const StyleSheet = { create: <T,>(styles: T): T => styles };
export const Document = browserOnly;
export const Page = browserOnly;
export const View = browserOnly;
export const Text = browserOnly;
export const Image = browserOnly;
