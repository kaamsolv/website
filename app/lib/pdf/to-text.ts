/**
 * PDF → plain text. Re-uses PDF → Word's reading (pdf.js text runs → paragraphs and headings),
 * then writes the paragraphs as text with a blank line between them. The pure half
 * (`pagesToText`) needs no pdf.js and is unit-tested in test/pdf-stamp.test.mts.
 */

import { PdfToolError } from './errors';
import { MAX_TEXT_PAGES } from './limits';
import type { PDFDocumentProxy } from './pdfjs';
import { SPARSE_CHARS_PER_PAGE } from './to-word/convert';
import { extractPages } from './to-word/extract';
import { layoutDocument, type PageText } from './to-word/paragraphs';

export type ToTextResult = { text: string; pages: number; chars: number; sparse: boolean };

/** Text of every page, paragraphs apart by a blank line; with `pageMarks`, each page starts with "----- Page 2 -----". */
export function pagesToText(pages: PageText[], pageMarks = false): ToTextResult {
  const chars = pages.reduce((n, p) => n + p.runs.reduce((m, r) => m + r.str.replace(/\s/g, '').length, 0), 0);
  if (chars === 0) throw new PdfToolError('no-text');
  const parts = layoutDocument(pages).map((page, i) => {
    const body = page.blocks.map((b) => b.text.trim()).filter(Boolean).join('\n\n');
    return pageMarks ? `----- Page ${i + 1} -----\n\n${body}` : body;
  });
  const text = parts.filter((p) => p.trim() !== '').join('\n\n').trim() + '\n';
  return { text, pages: pages.length, chars, sparse: chars < pages.length * SPARSE_CHARS_PER_PAGE };
}

export async function pdfToText(doc: PDFDocumentProxy, onProgress?: (done: number, total: number) => void, pageMarks = false): Promise<ToTextResult> {
  if (doc.numPages > MAX_TEXT_PAGES) throw new PdfToolError('too-many-pages');
  return pagesToText(await extractPages(doc, onProgress), pageMarks);
}

/** "report" → "report.txt" */
export function textFileName(baseName: string): string {
  return `${baseName}.txt`;
}
