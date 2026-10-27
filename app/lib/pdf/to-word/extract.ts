/**
 * pdf.js → text runs, one list per page, in top-down coordinates (the layout code's input).
 * The only part of PDF → Word that needs pdf.js; everything else is plain functions.
 */

import type { PDFDocumentProxy } from '../pdfjs';
import type { PageText, TextRun } from './paragraphs';

export async function extractPages(doc: PDFDocumentProxy, onProgress?: (done: number, total: number) => void): Promise<PageText[]> {
  const total = doc.numPages;
  const pages: PageText[] = [];
  onProgress?.(0, total);
  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const [va, vb, vc, vd, ve, vf] = viewport.transform;
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const [, , c, d, e, f] = item.transform;
        runs.push({
          str: item.str,
          // the run's origin in the page as drawn (y down, rotation applied)
          x: va * e + vc * f + ve,
          y: vb * e + vd * f + vf,
          size: Math.hypot(c, d),
          width: item.width,
        });
      }
      pages.push({ width: viewport.width, height: viewport.height, runs });
    } finally {
      page.cleanup();
    }
    onProgress?.(n, total);
  }
  return pages;
}
