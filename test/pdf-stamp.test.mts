/**
 * Page numbers and PDF → text: the labels and rules (pure), then real PDFs written by the engine
 * and read back by the real pdf.js (running in Node), including turned pages and a cropped page.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PdfToolError } from '../app/lib/pdf/errors.ts';
import { checkNumberOptions, DEFAULT_NUMBER_OPTIONS, formatPageLabel, planNumberLabels, numberedPdfName, type NumberOptions } from '../app/lib/pdf/numbering.ts';
import { addPageNumbers, alignedX, EDGE_MARGIN, placeUpright, shownSize } from '../app/lib/pdf/stamp.ts';
import { pagesToText, textFileName } from '../app/lib/pdf/to-text.ts';
import { extractPages } from '../app/lib/pdf/to-word/extract.ts';
import type { PageText } from '../app/lib/pdf/to-word/paragraphs.ts';

const opts = (o: Partial<NumberOptions> = {}): NumberOptions => ({ ...DEFAULT_NUMBER_OPTIONS, ...o });

async function plainPdf(pages: number, turn: (i: number) => number = () => 0, size: [number, number] = [595, 842]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(size);
    page.drawText(`Body of page ${i + 1}`, { x: 100, y: 400, size: 12, font });
    if (turn(i)) page.setRotation(degrees(turn(i)));
  }
  return doc.save();
}

/** Every text run of every page, as drawn on screen (pdf.js applies the page turn), plus the baseline direction. */
async function shown(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const out: { page: number; str: string; x: number; y: number; width: number; height: number; dirX: number; dirY: number; pageWidth: number; pageHeight: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const [va, vb, vc, vd, ve, vf] = vp.transform;
    for (const item of (await p.getTextContent()).items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [a, b, , , e, f] = item.transform;
      out.push({
        page: n,
        str: item.str,
        x: va * e + vc * f + ve,
        y: vb * e + vd * f + vf,
        width: item.width,
        height: vp.height,
        dirX: va * a + vc * b,
        dirY: vb * a + vd * b,
        pageWidth: vp.width,
        pageHeight: vp.height,
      });
    }
  }
  await doc.loadingTask.destroy();
  return out;
}

// ───────────────────────────── the rules ─────────────────────────────

test('labels: each format, and what "of N" counts', () => {
  assert.equal(formatPageLabel('n', 3, 10), '3');
  assert.equal(formatPageLabel('page-n', 3, 10), 'Page 3');
  assert.equal(formatPageLabel('n-of-total', 3, 10), '3 of 10');
  assert.equal(formatPageLabel('page-n-of-total', 3, 10), 'Page 3 of 10');
  assert.deepEqual(planNumberLabels(opts(), 3), ['1', '2', '3']);
  assert.deepEqual(planNumberLabels(opts({ format: 'n-of-total', fromPage: 2 }), 3), [null, '1 of 2', '2 of 2']);
  assert.deepEqual(planNumberLabels(opts({ startAt: 5, fromPage: 2 }), 3), [null, '5', '6']);
  assert.deepEqual(planNumberLabels(opts({ startAt: 0 }), 2), ['0', '1']);
  assert.equal(numberedPdfName('Report'), 'Report-numbered.pdf');
  assert.equal(textFileName('Report'), 'Report.txt');
});

test('settings are checked in plain words', () => {
  assert.equal(checkNumberOptions(opts(), 3).ok, true);
  const bad = (o: Partial<NumberOptions>, n = 3) => {
    const r = checkNumberOptions(opts(o), n);
    assert.equal(r.ok, false);
    return r.ok ? '' : r.message;
  };
  assert.match(bad({ fromPage: 0 }), /from 1 to 3/);
  assert.match(bad({ fromPage: 4 }), /from 1 to 3/);
  assert.match(bad({ fromPage: 1.5 }), /from 1 to 3/);
  assert.match(bad({ startAt: -1 }), /0 to 9999/);
  assert.match(bad({ startAt: 10000 }), /0 to 9999/);
});

test('placement: a turned page still shows the number upright, inside the visible box', () => {
  const box = { x: 0, y: 0, width: 600, height: 800 };
  assert.deepEqual(shownSize(box, 0), { width: 600, height: 800 });
  assert.deepEqual(shownSize(box, 90), { width: 800, height: 600 });
  assert.deepEqual(shownSize(box, 270), { width: 800, height: 600 });
  assert.deepEqual(placeUpright(box, 0, 10, 20), { x: 10, y: 20, angle: 0 });
  assert.deepEqual(placeUpright(box, 90, 10, 20), { x: 580, y: 10, angle: 90 });
  assert.deepEqual(placeUpright(box, 180, 10, 20), { x: 590, y: 780, angle: 180 });
  assert.deepEqual(placeUpright(box, 270, 10, 20), { x: 20, y: 790, angle: 270 });
  assert.deepEqual(placeUpright({ x: 50, y: 60, width: 500, height: 700 }, 0, 10, 20), { x: 60, y: 80, angle: 0 });
  assert.equal(alignedX('bottom-left', 600, 40), EDGE_MARGIN);
  assert.equal(alignedX('top-right', 600, 40), 600 - EDGE_MARGIN - 40);
  assert.equal(alignedX('bottom-center', 600, 40), 280);
});

// ───────────────────── real PDFs, read back by the real pdf.js ─────────────────────

test('numbers land on every page, bottom centre, upright, and the original text is untouched', async () => {
  const out = await addPageNumbers(await plainPdf(3), opts());
  const runs = await shown(out);
  for (const n of [1, 2, 3]) {
    const body = runs.find((r) => r.page === n && r.str === `Body of page ${n}`);
    assert.ok(body, `page ${n} keeps its text`);
    const num = runs.find((r) => r.page === n && r.str === String(n));
    assert.ok(num, `page ${n} has its number`);
    assert.ok(Math.abs(num.x + num.width / 2 - num.pageWidth / 2) < 1, 'centred');
    assert.ok(Math.abs(num.y - (num.pageHeight - EDGE_MARGIN)) < 1, `about 1 cm from the bottom (y ${num.y})`);
    assert.ok(num.dirX > 0 && Math.abs(num.dirY) < 1e-6, 'reads left to right');
  }
  assert.equal((await PDFDocument.load(out)).getPageCount(), 3);
});

test('top and side positions, and the size chosen', async () => {
  const out = await addPageNumbers(await plainPdf(1), opts({ position: 'top-right', format: 'page-n-of-total', size: 14 }));
  const num = (await shown(out)).find((r) => r.str === 'Page 1 of 1')!;
  assert.ok(num, 'label written');
  assert.ok(Math.abs(num.x + num.width - (num.pageWidth - EDGE_MARGIN)) < 1, 'right edge 1 cm in');
  assert.ok(num.y < 60 && num.y > 20, `near the top (y ${num.y})`);
  const left = (await shown(await addPageNumbers(await plainPdf(1), opts({ position: 'bottom-left' })))).find((r) => r.str === '1')!;
  assert.ok(Math.abs(left.x - EDGE_MARGIN) < 1);
});

test('turned pages (90, 180, 270) get an upright number in the same place as shown', async () => {
  const turns = [0, 90, 180, 270];
  const out = await addPageNumbers(await plainPdf(4, (i) => turns[i]), opts());
  const runs = await shown(out);
  for (let i = 0; i < 4; i++) {
    const num = runs.find((r) => r.page === i + 1 && r.str === String(i + 1))!;
    assert.ok(num, `page ${i + 1} (turned ${turns[i]}) has a number`);
    assert.ok(Math.abs(num.x + num.width / 2 - num.pageWidth / 2) < 1.5, `turned ${turns[i]}: centred (x ${num.x}, width ${num.width}, page ${num.pageWidth})`);
    assert.ok(Math.abs(num.y - (num.pageHeight - EDGE_MARGIN)) < 1.5, `turned ${turns[i]}: bottom (y ${num.y} of ${num.pageHeight})`);
    assert.ok(num.dirX > 0 && Math.abs(num.dirY) < 1e-6, `turned ${turns[i]}: upright`);
  }
  assert.deepEqual((await PDFDocument.load(out)).getPages().map((p) => p.getRotation().angle), turns, 'the pages stay turned as they were');
});

test('a cropped page is numbered inside what is visible', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  page.setCropBox(50, 60, 500, 700);
  const out = await addPageNumbers(await doc.save(), opts());
  const num = (await shown(out)).find((r) => r.str === '1')!;
  assert.ok(num);
  assert.equal(Math.round(num.pageWidth), 500);
  assert.ok(Math.abs(num.x + num.width / 2 - 250) < 1.5);
  assert.ok(Math.abs(num.y - (700 - EDGE_MARGIN)) < 1.5);
});

test('start on page 2 at number 5: the cover is left alone', async () => {
  const out = await addPageNumbers(await plainPdf(3), opts({ fromPage: 2, startAt: 5, format: 'page-n-of-total' }));
  const labels = (await shown(out)).filter((r) => /^Page \d/.test(r.str) && !r.str.startsWith('Body'));
  assert.deepEqual(labels.map((r) => [r.page, r.str]), [[2, 'Page 5 of 6'], [3, 'Page 6 of 6']]);
});

test('bad settings are refused before anything is written', async () => {
  const two = await plainPdf(2);
  await assert.rejects(() => addPageNumbers(two, opts({ fromPage: 3 })), /from 1 to 2/);
});

// ───────────────────────────── PDF → text ─────────────────────────────

const textPage = (lines: string[], y0 = 700): PageText => ({
  width: 595,
  height: 842,
  runs: lines.map((str, i) => ({ str, x: 72, y: y0 + i * 14, size: 11, width: str.length * 5.5 })),
});

test('text: paragraphs come out in reading order, pages follow each other, page marks are optional', () => {
  const pages = [textPage(['First page line one', 'First page line two']), textPage(['Second page text'])];
  const plain = pagesToText(pages);
  assert.match(plain.text, /First page line one/);
  assert.ok(plain.text.indexOf('First page') < plain.text.indexOf('Second page'));
  assert.ok(!plain.text.includes('----- Page'));
  assert.equal(plain.pages, 2);
  assert.ok(plain.text.endsWith('\n') && !plain.text.endsWith('\n\n'));
  const marked = pagesToText(pages, true);
  assert.match(marked.text, /^----- Page 1 -----\n\nFirst page/);
  assert.match(marked.text, /----- Page 2 -----\n\nSecond page text/);
});

test('text: a PDF with no text is refused, one with a trace is flagged', () => {
  assert.throws(() => pagesToText([{ width: 595, height: 842, runs: [] }]), (e) => e instanceof PdfToolError && e.code === 'no-text');
  assert.equal(pagesToText([textPage(['hi'])]).sparse, true);
  assert.equal(pagesToText([textPage(['A full line of real words in this page, plenty of them to count.'])]).sparse, false);
});

test('text: a real PDF read by the real pdf.js comes out as its words', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 1; p <= 2; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Heading of page ${p}`, { x: 72, y: 760, size: 20, font });
    page.drawText('Small problems, solved.', { x: 72, y: 720, size: 11, font });
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await doc.save()), isEvalSupported: false, verbosity: 0 }).promise;
  const result = pagesToText(await extractPages(pdf));
  await pdf.loadingTask.destroy();
  assert.match(result.text, /Heading of page 1/);
  assert.match(result.text, /Small problems, solved\./);
  assert.ok(result.text.indexOf('Heading of page 1') < result.text.indexOf('Heading of page 2'));
  assert.equal(result.pages, 2);
});
