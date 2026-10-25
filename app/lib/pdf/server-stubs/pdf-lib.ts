/**
 * Server-side stand-in for @cantoo/pdf-lib (see `turbopack.resolveAlias` in
 * next.config.mjs). PDF tools only run in the browser, but their pages are
 * also rendered on the server, so without this the library would be bundled
 * into the Cloudflare Worker for nothing.
 */
function browserOnly(): never {
  throw new Error('@cantoo/pdf-lib is browser-only in KaamSolv');
}

class BrowserOnly {
  constructor() {
    browserOnly();
  }
  static of = browserOnly;
  static load = browserOnly;
  static create = browserOnly;
}

export const PDFDocument = BrowserOnly;
export const PDFArray = BrowserOnly;
export const PDFDict = BrowserOnly;
export const PDFName = BrowserOnly;
export const PDFNumber = BrowserOnly;
export const PDFRawStream = BrowserOnly;
export const PDFRef = BrowserOnly;
export const PDFStream = BrowserOnly;
