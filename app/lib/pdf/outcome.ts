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

/** "Report" → "Report-edited.pdf" (pages turned, deleted or reordered). */
export function editedPdfName(baseName: string): string {
  return `${baseName}-edited.pdf`;
}

/** "Report" → "Report-split.zip" (several PDFs from one). */
export function splitZipName(baseName: string): string {
  return `${baseName}-split.zip`;
}

/** "Report", 3, 12, false → "Report-part-03.pdf" (or "-page-03" when every part is one page). Numbers are padded to the total. */
export function splitPartName(baseName: string, index: number, total: number, singlePages: boolean): string {
  const width = String(total).length;
  return `${baseName}-${singlePages ? 'page' : 'part'}-${String(index).padStart(width, '0')}.pdf`;
}
