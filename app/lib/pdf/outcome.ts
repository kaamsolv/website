/**
 * Small result helpers the page uses directly. Kept free of pdf-lib / pdf.js so
 * importing them never pulls a PDF library into the page or the server.
 */

/** The result we show: smaller by at least 2%, or "keep your original". */
export function compressVerdict(inputBytes: number, outputBytes: number): 'smaller' | 'not-smaller' {
  return outputBytes <= inputBytes * 0.98 ? 'smaller' : 'not-smaller';
}

/** "Report" → "Report-compressed.pdf". */
export function compressedPdfName(baseName: string): string {
  return `${baseName}-compressed.pdf`;
}

/** "Report" → "Report-pages.pdf" (pages picked in Split). */
export function extractedPdfName(baseName: string): string {
  return `${baseName}-pages.pdf`;
}
