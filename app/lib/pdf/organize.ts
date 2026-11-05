/**
 * Rotate, delete, reorder and split with pdf-lib. Pages are copied, never
 * redrawn, so text stays text. Works in Node too, so it's unit-tested in
 * test/pdf-organize.test.mts against real PDFs.
 */

import { PDFDocument, degrees } from '@cantoo/pdf-lib';

const LOAD = { updateMetadata: false, parseSpeed: 1500 } as const;
const SAVE = { useObjectStreams: true, objectsPerTick: 1500 } as const;

export type PagePlan = { index: number; rotate: number };

async function newDocument(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setProducer('KaamSolv (kaamsolv.com)');
  doc.setCreator('KaamSolv PDF tools');
  return doc;
}

const turn = (current: number, extra: number) => (((current + extra) % 360) + 360) % 360;

/**
 * A new PDF made of the planned pages, in that order. `rotate` is extra clockwise
 * degrees on top of whatever the page already had. Covers rotate, delete,
 * rearrange and "keep only these" in one call.
 */
export async function buildFromPages(input: Uint8Array, plan: readonly PagePlan[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(input, LOAD);
  const count = src.getPageCount();
  if (plan.length === 0) throw new RangeError('Keep at least one page');
  for (const p of plan) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index >= count) throw new RangeError('That page isn’t in this PDF');
    if (!Number.isInteger(p.rotate) || p.rotate % 90 !== 0) throw new RangeError('Pages turn in steps of 90 degrees');
  }
  const out = await newDocument();
  const copied = await out.copyPages(src, plan.map((p) => p.index));
  copied.forEach((page, i) => {
    if (plan[i].rotate !== 0) page.setRotation(degrees(turn(page.getRotation().angle, plan[i].rotate)));
    out.addPage(page);
  });
  return out.save(SAVE);
}

/**
 * One new PDF per group of 0-based pages, loading the source once.
 * Used by "every N pages" and "one PDF per page".
 */
export async function extractGroups(
  input: Uint8Array,
  groups: readonly (readonly number[])[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(input, LOAD);
  const count = src.getPageCount();
  if (groups.length === 0) throw new RangeError('Nothing to split');
  const results: Uint8Array[] = [];
  for (let g = 0; g < groups.length; g++) {
    const wanted = groups[g];
    if (wanted.length === 0 || wanted.some((i) => !Number.isInteger(i) || i < 0 || i >= count)) throw new RangeError('That page isn’t in this PDF');
    const out = await newDocument();
    (await out.copyPages(src, [...wanted])).forEach((p) => out.addPage(p));
    results.push(await out.save(SAVE));
    onProgress?.(g + 1, groups.length);
  }
  return results;
}
