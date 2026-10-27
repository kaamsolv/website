/**
 * PDF → Word, in the browser: pdf.js reads the text, paragraphs.ts makes paragraphs and
 * headings, docx.ts writes the file. Text first: no OCR, tables, columns or images.
 */

import { PdfToolError } from '../errors';
import { MAX_TEXT_PAGES } from '../limits';
import type { PDFDocumentProxy } from '../pdfjs';
import { pagesToDocx, type ToWordResult } from './convert';
import { extractPages } from './extract';

export type { ToWordResult } from './convert';
export { DOCX_MIME } from './docx';

export async function pdfToDocx(doc: PDFDocumentProxy, onProgress?: (done: number, total: number) => void): Promise<ToWordResult> {
  if (doc.numPages > MAX_TEXT_PAGES) throw new PdfToolError('too-many-pages');
  return pagesToDocx(await extractPages(doc, onProgress));
}

/** "report" → "report.docx" */
export function wordFileName(baseName: string): string {
  return `${baseName}.docx`;
}
