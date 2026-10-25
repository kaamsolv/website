import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from '@cantoo/pdf-lib';
import { countPages, extractPages, extractedPdfName, imagesToPdf, mergePdfs } from '../app/lib/pdf/pages.ts';
import { moveItem, pagesLabel } from '../app/lib/pdf/order.ts';
import { A4 } from '../app/lib/pdf/image-layout.ts';
import { fakeJpeg, labelledPdf } from './helpers/pdf-fixtures.mts';

/** Pages are told apart by width (labelledPdf makes page i 200 + i pt wide). */
async function widths(bytes: Uint8Array): Promise<number[]> {
  return (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
}

test('merge keeps every page, in file order', async () => {
  const a = await labelledPdf('A', 2); // widths 200, 201
  const b = await labelledPdf('B', 3); // widths 200, 201, 202
  const progress: number[] = [];
  const merged = await mergePdfs([b, a], (done) => progress.push(done));
  assert.deepEqual(await widths(merged), [200, 201, 202, 200, 201]);
  assert.deepEqual(progress, [1, 2]);
  assert.equal(await countPages(merged), 5);
  const doc = await PDFDocument.load(merged, { updateMetadata: false }); // a plain load stamps pdf-lib's own name
  assert.match(doc.getProducer() ?? '', /KaamSolv/);
});

test('extract: chosen pages only, in document order, duplicates and junk ignored', async () => {
  const src = await labelledPdf('A', 6); // widths 200..205
  assert.deepEqual(await widths(await extractPages(src, [4, 1, 1, 99, -1, 2.5])), [201, 204]);
  await assert.rejects(() => extractPages(src, []), /at least one page/);
});

test('images → PDF: one A4 page per image, landscape photos turn the page', async () => {
  const pdf = await imagesToPdf(
    [
      { type: 'jpeg', bytes: fakeJpeg(3000, 4000) },
      { type: 'jpeg', bytes: fakeJpeg(4000, 3000) },
    ],
    'a4',
    'none',
  );
  const doc = await PDFDocument.load(pdf);
  const sizes = doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  assert.deepEqual(sizes, [
    [Math.round(A4.width), Math.round(A4.height)],
    [Math.round(A4.height), Math.round(A4.width)],
  ]);
  await assert.rejects(() => imagesToPdf([], 'a4', 'none'));
});

test('moveItem and labels', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b']);
  assert.equal(pagesLabel(1), '1 page');
  assert.equal(pagesLabel(12), '12 pages');
  assert.equal(extractedPdfName('Report'), 'Report-pages.pdf');
});
