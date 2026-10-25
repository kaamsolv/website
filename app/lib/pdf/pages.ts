/**
 * Merge, split and images → PDF with pdf-lib. Pages are copied as they are
 * (text stays text); nothing is re-rendered. Works in Node too, so it's
 * unit-tested in test/pdf-pages.test.mts.
 */

import { PDFDocument } from '@cantoo/pdf-lib';
import { layoutImagePage, type MarginMode, type PageSizeMode } from './image-layout';

export { extractedPdfName } from './outcome';

const LOAD = { updateMetadata: false, parseSpeed: 1500 } as const;
const SAVE = { useObjectStreams: true, objectsPerTick: 1500 } as const;

async function newDocument(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setProducer('KaamSolv (kaamsolv.com)');
  doc.setCreator('KaamSolv PDF tools');
  return doc;
}

/** Page count, or throws for a file pdf-lib can't read. */
export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, LOAD)).getPageCount();
}

/** One PDF with every page of every input, in the given order. */
export async function mergePdfs(inputs: readonly Uint8Array[], onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const out = await newDocument();
  for (let i = 0; i < inputs.length; i++) {
    const src = await PDFDocument.load(inputs[i], LOAD);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    onProgress?.(i + 1, inputs.length);
  }
  return out.save(SAVE);
}

/** A new PDF with only the chosen pages (0-based), in document order. */
export async function extractPages(input: Uint8Array, pageIndices: readonly number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(input, LOAD);
  const count = src.getPageCount();
  const wanted = [...new Set(pageIndices)].filter((i) => Number.isInteger(i) && i >= 0 && i < count).sort((a, b) => a - b);
  if (wanted.length === 0) throw new RangeError('Pick at least one page');
  const out = await newDocument();
  (await out.copyPages(src, wanted)).forEach((p) => out.addPage(p));
  return out.save(SAVE);
}

export type PreparedImage = { type: 'jpeg' | 'png'; bytes: Uint8Array };

/** One page per image, laid out by `layoutImagePage`. Images are embedded as-is (no re-encode). */
export async function imagesToPdf(images: readonly PreparedImage[], size: PageSizeMode, margin: MarginMode): Promise<Uint8Array> {
  if (images.length === 0) throw new RangeError('Add at least one image');
  const out = await newDocument();
  for (const img of images) {
    const embedded = img.type === 'jpeg' ? await out.embedJpg(img.bytes) : await out.embedPng(img.bytes);
    const box = layoutImagePage(embedded.width, embedded.height, size, margin);
    const page = out.addPage([box.pageWidth, box.pageHeight]);
    page.drawImage(embedded, { x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return out.save(SAVE);
}
