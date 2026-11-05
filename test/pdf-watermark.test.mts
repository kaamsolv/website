/**
 * Watermarks: the rules (pure), then real PDFs stamped by the engine and read back by the real pdf.js,
 * including turned pages, chosen pages, see-through-ness and picture placement.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  DEFAULT_IMAGE_WATERMARK,
  DEFAULT_TEXT_WATERMARK,
  MAX_WATERMARK_CHARS,
  canDrawText,
  checkImageWatermark,
  checkTextWatermark,
  pagesForWatermark,
  watermarkFontSize,
  watermarkedPdfName,
  type ImageWatermark,
  type TextWatermark,
} from '../app/lib/pdf/watermark.ts';
import { CAP_HEIGHT, EDGE_MARGIN, addImageWatermark, addTextWatermark } from '../app/lib/pdf/stamp.ts';
import { fakeJpeg } from './helpers/pdf-fixtures.mts';

const text = (o: Partial<TextWatermark> = {}): TextWatermark => ({ ...DEFAULT_TEXT_WATERMARK, ...o });
const image = (o: Partial<ImageWatermark> = {}): ImageWatermark => ({ ...DEFAULT_IMAGE_WATERMARK, ...o });

async function plainPdf(pages: number, turn: (i: number) => number = () => 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Body of page ${i + 1}`, { x: 100, y: 400, size: 12, font });
    if (turn(i)) page.setRotation(degrees(turn(i)));
  }
  return doc.save();
}

async function open(bytes: Uint8Array) {
  return pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
}

/** Text runs as drawn on screen: origin, size, baseline direction (y down), page size. */
async function shown(bytes: Uint8Array) {
  const doc = await open(bytes);
  const out: { page: number; str: string; x: number; y: number; size: number; width: number; dirX: number; dirY: number; pageWidth: number; pageHeight: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const [va, vb, vc, vd, ve, vf] = vp.transform;
    for (const item of (await p.getTextContent()).items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [a, b, , , e, f] = item.transform;
      out.push({ page: n, str: item.str, x: va * e + vc * f + ve, y: vb * e + vd * f + vf, size: Math.hypot(a, b), width: item.width, dirX: (va * a + vc * b) / Math.hypot(a, b), dirY: (vb * a + vd * b) / Math.hypot(a, b), pageWidth: vp.width, pageHeight: vp.height });
    }
  }
  await doc.loadingTask.destroy();
  return out;
}

/** Drawing instructions of a page: every graphics-state setting and every picture with its matrix. */
async function drawn(bytes: Uint8Array, pageNumber: number) {
  const doc = await open(bytes);
  const p = await doc.getPage(pageNumber);
  const ops = await p.getOperatorList();
  const { OPS } = pdfjs;
  const alphas: number[] = [];
  const pictures: { a: number; b: number; c: number; d: number; e: number; f: number }[] = [];
  type M = [number, number, number, number, number, number];
  const times = (m: M, c: M): M => [
    m[0] * c[0] + m[1] * c[2],
    m[0] * c[1] + m[1] * c[3],
    m[2] * c[0] + m[3] * c[2],
    m[2] * c[1] + m[3] * c[3],
    m[4] * c[0] + m[5] * c[2] + c[4],
    m[4] * c[1] + m[5] * c[3] + c[5],
  ];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  ops.fnArray.forEach((fn: number, i: number) => {
    const args = ops.argsArray[i] as unknown;
    if (fn === OPS.setGState) {
      const list = args as unknown[];
      const entries = (Array.isArray(list[0]) && Array.isArray((list[0] as unknown[])[0]) ? list[0] : list) as [string, unknown][];
      for (const [k, v] of entries) if (k === 'ca') alphas.push(v as number);
    }
    if (fn === OPS.save) stack.push(ctm);
    if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    if (fn === OPS.transform) ctm = times(args as M, ctm);
    if (fn === OPS.paintImageXObject) pictures.push({ a: ctm[0], b: ctm[1], c: ctm[2], d: ctm[3], e: ctm[4], f: ctm[5] });
  });
  await doc.loadingTask.destroy();
  return { alphas, pictures };
}

// ───────────────────────────── the rules ─────────────────────────────

test('what can be written: English letters and common symbols; Hindi is turned away kindly', () => {
  assert.equal(canDrawText('CONFIDENTIAL'), true);
  assert.equal(canDrawText('Café – €5 “draft” • v2'), true);
  assert.equal(canDrawText('नमस्ते'), false);
  assert.equal(canDrawText('Draft 草稿'), false);
  const bad = checkTextWatermark(text({ text: 'नमस्ते' }));
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? '' : bad.message, /Hindi and other scripts aren’t supported yet/);
});

test('settings are checked in plain words', () => {
  assert.equal(checkTextWatermark(text()).ok, true);
  const msg = (o: Partial<TextWatermark>) => {
    const r = checkTextWatermark(text(o));
    assert.equal(r.ok, false);
    return r.ok ? '' : r.message;
  };
  assert.match(msg({ text: '   ' }), /Type the words/);
  assert.match(msg({ text: 'x'.repeat(MAX_WATERMARK_CHARS + 1) }), /60 characters or fewer/);
  assert.match(msg({ opacity: 0 }), /how solid/);
  assert.match(msg({ opacity: 0.95 }), /how solid/);
  assert.equal(checkImageWatermark(image()).ok, true);
  assert.equal(checkImageWatermark(image({ widthShare: 0.01 })).ok, false);
  assert.equal(checkImageWatermark(image({ opacity: 2 })).ok, false);
  assert.equal(watermarkedPdfName('Report'), 'Report-watermarked.pdf');
});

test('which pages: empty means all, ranges mean those, nonsense is explained', () => {
  assert.deepEqual(pagesForWatermark('', 5), { ok: true, pages: null });
  assert.deepEqual(pagesForWatermark('  ', 5), { ok: true, pages: null });
  assert.deepEqual(pagesForWatermark('2-3, 5', 5), { ok: true, pages: [1, 2, 4] });
  const bad = pagesForWatermark('9', 5);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? '' : bad.message, /has 5 pages, so page 9 isn’t there/);
});

test('size: the words span a share of the room, never tiny and never huge', () => {
  // 10-letter word ≈ 6 pt wide at 1 pt: on A4, a diagonal medium mark takes 55% of the page diagonal
  const diag = Math.hypot(595, 842);
  const size = watermarkFontSize(6, 595, 842, 'diagonal', 'medium');
  assert.ok(Math.abs(size * 6 - diag * 0.55) < 0.01);
  assert.ok(watermarkFontSize(6, 595, 842, 'diagonal', 'small') < watermarkFontSize(6, 595, 842, 'diagonal', 'large'));
  assert.equal(watermarkFontSize(6, 595, 842, 'center', 'medium'), (595 * 0.55) / 6);
  assert.equal(watermarkFontSize(1000, 100, 100, 'center', 'small'), 8);
  assert.equal(watermarkFontSize(0.001, 595, 842, 'center', 'large'), 320);
});

// ───────────────────── real PDFs, read back by the real pdf.js ─────────────────────

test('a diagonal text watermark sits in the middle of every page, at 45 degrees, upright, see-through, body text untouched', async () => {
  const out = await addTextWatermark(await plainPdf(2), text({ text: 'DRAFT', opacity: 0.25 }));
  const runs = await shown(out);
  for (const n of [1, 2]) {
    assert.ok(runs.find((r) => r.page === n && r.str === `Body of page ${n}`), 'body text kept');
    const mark = runs.find((r) => r.page === n && r.str === 'DRAFT')!;
    assert.ok(mark, `page ${n} has the mark`);
    const t = Math.PI / 4;
    assert.ok(Math.abs(mark.dirX - Math.cos(t)) < 1e-3 && Math.abs(mark.dirY + Math.sin(t)) < 1e-3, `rising at 45° (dir ${mark.dirX}, ${mark.dirY})`);
    // The middle of the baseline is half the capital height off the page's middle, across the text.
    const cap = mark.size * CAP_HEIGHT;
    const midX = mark.x + (mark.width / 2) * mark.dirX;
    const midY = mark.y + (mark.width / 2) * mark.dirY;
    assert.ok(Math.abs(midX - (mark.pageWidth / 2 + (cap / 2) * Math.sin(t))) < 1.5, `centred across (${midX})`);
    assert.ok(Math.abs(midY - (mark.pageHeight / 2 + (cap / 2) * Math.cos(t))) < 1.5, `centred down (${midY})`);
  }
  assert.ok((await drawn(out, 1)).alphas.includes(0.25), 'drawn at 25% opacity');
});

test('a flat watermark is level and centred', async () => {
  const out = await addTextWatermark(await plainPdf(1), text({ text: 'COPY', layout: 'center', size: 'small' }));
  const mark = (await shown(out)).find((r) => r.str === 'COPY')!;
  assert.ok(Math.abs(mark.dirX - 1) < 1e-6 && Math.abs(mark.dirY) < 1e-6);
  assert.ok(Math.abs(mark.x + mark.width / 2 - mark.pageWidth / 2) < 1.5);
});

test('turned pages (90, 180, 270) get an upright watermark in the middle as shown', async () => {
  const turns = [90, 180, 270];
  const out = await addTextWatermark(await plainPdf(3, (i) => turns[i]), text({ text: 'DRAFT' }));
  const runs = await shown(out);
  for (let i = 0; i < 3; i++) {
    const mark = runs.find((r) => r.page === i + 1 && r.str === 'DRAFT')!;
    assert.ok(mark, `turned ${turns[i]}: has the mark`);
    const t = Math.PI / 4;
    assert.ok(Math.abs(mark.dirX - Math.cos(t)) < 1e-3 && Math.abs(mark.dirY + Math.sin(t)) < 1e-3, `turned ${turns[i]}: rising at 45°`);
    const cap = mark.size * CAP_HEIGHT;
    assert.ok(Math.abs(mark.x + (mark.width / 2) * mark.dirX - (mark.pageWidth / 2 + (cap / 2) * Math.sin(t))) < 1.5, `turned ${turns[i]}: centred across`);
    assert.ok(Math.abs(mark.y + (mark.width / 2) * mark.dirY - (mark.pageHeight / 2 + (cap / 2) * Math.cos(t))) < 1.5, `turned ${turns[i]}: centred down`);
  }
});

test('only the chosen pages are stamped', async () => {
  const out = await addTextWatermark(await plainPdf(4), text({ text: 'DRAFT', pages: [1, 3] }));
  const marked = (await shown(out)).filter((r) => r.str === 'DRAFT').map((r) => r.page);
  assert.deepEqual(marked, [2, 4]);
});

test('settings that are wrong are refused before anything is written', async () => {
  const one = await plainPdf(1);
  await assert.rejects(() => addTextWatermark(one, text({ text: 'नमस्ते' })), /Hindi and other scripts/);
  await assert.rejects(() => addTextWatermark(one, text({ pages: [5] })), /isn’t in this PDF/);
  await assert.rejects(() => addImageWatermark(one, { type: 'jpeg', bytes: fakeJpeg(10, 10) }, image({ pages: [3] })), /isn’t in this PDF/);
});

test('a picture watermark: size, corner, see-through, and upright on turned pages', async () => {
  const jpeg = { type: 'jpeg' as const, bytes: fakeJpeg(200, 100) };
  // Centre of an upright page: 40% of 595 wide = 238, twice as wide as tall.
  let out = await addImageWatermark(await plainPdf(1), jpeg, image({ widthShare: 0.4, opacity: 0.3 }));
  let { alphas, pictures } = await drawn(out, 1);
  assert.equal(pictures.length, 1);
  const c = pictures[0];
  assert.ok(Math.abs(c.a - 238) < 0.01 && Math.abs(c.d - 119) < 0.01, `size ${c.a} × ${c.d}`);
  assert.ok(Math.abs(c.e - 178.5) < 0.01 && Math.abs(c.f - 361.5) < 0.01, `centre at ${c.e}, ${c.f}`);
  assert.ok(alphas.includes(0.3), 'see-through');

  // Bottom right corner, one centimetre in.
  out = await addImageWatermark(await plainPdf(1), jpeg, image({ position: 'bottom-right', widthShare: 0.4 }));
  const br = (await drawn(out, 1)).pictures[0];
  assert.ok(Math.abs(br.e - (595 - EDGE_MARGIN - 238)) < 0.01 && Math.abs(br.f - EDGE_MARGIN) < 0.01);
  out = await addImageWatermark(await plainPdf(1), jpeg, image({ position: 'top-left', widthShare: 0.4 }));
  const tl = (await drawn(out, 1)).pictures[0];
  assert.ok(Math.abs(tl.e - EDGE_MARGIN) < 0.01 && Math.abs(tl.f - (842 - EDGE_MARGIN - 119)) < 0.01);

  // A tall picture never goes beyond 90% of the page height.
  out = await addImageWatermark(await plainPdf(1), { type: 'jpeg', bytes: fakeJpeg(100, 1000) }, image({ widthShare: 1 }));
  const tall = (await drawn(out, 1)).pictures[0];
  assert.ok(tall.d <= 842 * 0.9 + 0.01, `height ${tall.d}`);

  // On a page turned 90 degrees the picture is turned with it, so it still looks upright (its baseline runs along y).
  out = await addImageWatermark(await plainPdf(1, () => 90), jpeg, image({ widthShare: 0.4 }));
  const turned = (await drawn(out, 1)).pictures[0];
  assert.ok(Math.abs(turned.a) < 1e-6 && Math.abs(turned.b - 336.8) < 0.5, `turned: ${turned.a}, ${turned.b}`);
});
