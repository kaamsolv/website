/**
 * Extracted page text → a .docx. The pure half of PDF → Word (no pdf.js): easy to test.
 */

import { PdfToolError } from '../errors';
import { buildDocx } from './docx';
import { layoutDocument, type PageText } from './paragraphs';

export type ToWordResult = {
  bytes: Uint8Array;
  pages: number;
  /** Characters of text that came across (spaces not counted). */
  chars: number;
  /** Very little text per page: probably a scan with a few stray characters. The UI says so. */
  sparse: boolean;
};

/** Below this many characters per page we warn that the PDF may be a scan. */
export const SPARSE_CHARS_PER_PAGE = 30;

export function pagesToDocx(pages: PageText[]): ToWordResult {
  const chars = pages.reduce((n, p) => n + p.runs.reduce((m, r) => m + r.str.replace(/\s/g, '').length, 0), 0);
  if (chars === 0) throw new PdfToolError('no-text');
  const blocks = layoutDocument(pages);
  return { bytes: buildDocx(blocks), pages: pages.length, chars, sparse: chars < pages.length * SPARSE_CHARS_PER_PAGE };
}
