import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFRef } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import {
  compressPdfBytes,
  compressVerdict,
  compressedPdfName,
  fitWithin,
  isPhotographic,
  pixelCapForPages,
  unpredictPng,
  worthReplacing,
  type ImageSource,
  type Reencoder,
} from '../app/lib/pdf/compress.ts';
import { addImage, fakeJpeg, noise } from './helpers/pdf-fixtures.mts';

const A4 = { width: 595.28, height: 841.89 };

test('pixel cap: 150 DPI of the largest page', () => {
  assert.equal(pixelCapForPages([A4], 150), 1754); // 11.69 in × 150 = 1753.9
  assert.equal(pixelCapForPages([A4, { width: 1190.55, height: 841.89 }], 150), 2481); // A3 landscape wins
  assert.equal(pixelCapForPages([], 150), 1);
});

test('fitWithin keeps the shape and never upscales', () => {
  assert.deepEqual(fitWithin(2480, 3508, 1754), { width: 1240, height: 1754 });
  assert.deepEqual(fitWithin(3000, 2000, 1500), { width: 1500, height: 1000 });
  assert.deepEqual(fitWithin(800, 600, 1755), { width: 800, height: 600 });
});

test('replace only for a real saving; verdict needs 2%', () => {
  assert.equal(worthReplacing(1000, 899), true);
  assert.equal(worthReplacing(1000, 900), false);
  assert.equal(compressVerdict(1000, 980), 'smaller');
  assert.equal(compressVerdict(1000, 981), 'not-smaller');
  assert.equal(compressVerdict(1000, 1200), 'not-smaller');
});

test('photographic: noise yes, flat colour no', () => {
  const flat = new Uint8Array(100 * 100 * 3).fill(200);
  assert.equal(isPhotographic(zlibSync(flat).length, 100, 100, 3), false);
  assert.equal(isPhotographic(zlibSync(noise(30000)).length, 100, 100, 3), true);
});

test('unpredictPng undoes Sub, Up, Average and Paeth rows', () => {
  const width = 4;
  const comps = 3;
  const stride = width * comps;
  const rows = [noise(stride, 3), noise(stride, 4), noise(stride, 5), noise(stride, 6), noise(stride, 7)];
  const filters = [0, 1, 2, 3, 4];
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const encoded: number[] = [];
  rows.forEach((row, y) => {
    encoded.push(filters[y]);
    for (let x = 0; x < stride; x++) {
      const left = x >= comps ? row[x - comps] : 0;
      const up = y > 0 ? rows[y - 1][x] : 0;
      const upLeft = y > 0 && x >= comps ? rows[y - 1][x - comps] : 0;
      const pred = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filters[y]];
      encoded.push((row[x] - pred) & 0xff);
    }
  });
  const out = unpredictPng(new Uint8Array(encoded), width, rows.length, comps);
  assert.deepEqual(out, new Uint8Array(rows.flatMap((r) => [...r])));
  assert.equal(unpredictPng(new Uint8Array([9, 0, 0, 0]), 1, 1, 3), null, 'unknown filter');
});

test('compressedPdfName', () => {
  assert.equal(compressedPdfName('Report Q3'), 'Report Q3-compressed.pdf');
});

// --- The PDF walk, with a fake encoder standing in for the browser canvas ---

type Call = { source: ImageSource; target: { width: number; height: number }; quality: number };

function fakeEncoder(result: (call: Call) => Uint8Array | null | 'throw'): { encoder: Reencoder; calls: Call[] } {
  const calls: Call[] = [];
  const encoder: Reencoder = async (source, target, quality) => {
    const call = { source, target, quality };
    calls.push(call);
    const r = result(call);
    if (r === 'throw') throw new Error('decode failed');
    return r;
  };
  return { encoder, calls };
}

async function streamOf(bytes: Uint8Array, ref: PDFRef): Promise<PDFRawStream> {
  const doc = await PDFDocument.load(bytes);
  const obj = doc.context.lookup(ref);
  assert.ok(obj instanceof PDFRawStream);
  return obj;
}

const dictNum = (s: PDFRawStream, key: string) => (s.dict.lookup(PDFName.of(key)) as PDFNumber).asNumber();
const dictName = (s: PDFRawStream, key: string) => String(s.dict.lookup(PDFName.of(key)));

test('a big scanned JPEG comes down to 150 DPI of the page; text-like images stay', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([A4.width, A4.height]);
  const scan = addImage(doc, { width: 2480, height: 3508, kind: 'jpeg' });
  const photo = addImage(doc, { width: 300, height: 200, kind: 'flate' });
  const flat = addImage(doc, { width: 400, height: 400, kind: 'flate', pixels: new Uint8Array(400 * 400 * 3).fill(250) });
  const cmyk = addImage(doc, { width: 500, height: 500, kind: 'jpeg', colorSpace: 'DeviceCMYK' });
  const input = await doc.save();

  const { encoder, calls } = fakeEncoder(() => fakeJpeg(9, 9));
  const { bytes, stats } = await compressPdfBytes(input, encoder);

  assert.equal(stats.candidates, 3, 'scan, photo, flat (CMYK is skipped)');
  assert.equal(calls.length, 2, 'flat image is never sent to the encoder');
  assert.equal(stats.imagesReplaced, 2);
  const scanCall = calls.find((c) => c.source.width === 2480)!;
  assert.deepEqual(scanCall.target, { width: 1240, height: 1754 });
  assert.equal(scanCall.quality, 0.72);
  assert.equal(scanCall.source.kind, 'jpeg');
  const photoCall = calls.find((c) => c.source.width === 300)!;
  assert.equal(photoCall.source.kind, 'pixels');
  assert.deepEqual(photoCall.target, { width: 300, height: 200 }, 'small images are never upscaled or shrunk');

  const newScan = await streamOf(bytes, scan);
  assert.equal(dictName(newScan, 'Filter'), '/DCTDecode');
  assert.equal(dictNum(newScan, 'Width'), 1240);
  assert.equal(dictNum(newScan, 'Height'), 1754);
  assert.equal(newScan.contents.length, fakeJpeg(9, 9).length);

  assert.equal(dictName(await streamOf(bytes, flat), 'Filter'), '/FlateDecode');
  assert.equal(dictName(await streamOf(bytes, cmyk), 'ColorSpace'), '/DeviceCMYK');
  assert.ok(bytes.length < input.length);
});

test('grey images become RGB JPEGs (canvas output is always 3-channel)', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([A4.width, A4.height]);
  const grey = addImage(doc, { width: 300, height: 300, kind: 'flate', colorSpace: 'DeviceGray' });
  const { encoder, calls } = fakeEncoder(() => fakeJpeg(9, 9));
  const { bytes } = await compressPdfBytes(await doc.save(), encoder);
  assert.equal(calls[0].source.components, 1);
  assert.equal(dictName(await streamOf(bytes, grey), 'ColorSpace'), '/DeviceRGB');
});

test('kept as is: bigger result, encoder failure, masks, soft-mask targets, decode arrays', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([A4.width, A4.height]);
  const alpha = addImage(doc, { width: 200, height: 200, kind: 'flate', colorSpace: 'DeviceGray' });
  const withSMask = addImage(doc, { width: 200, height: 200, kind: 'jpeg', extra: { SMask: alpha } });
  addImage(doc, { width: 200, height: 200, kind: 'jpeg', extra: { Decode: [1, 0, 1, 0, 1, 0] } });
  addImage(doc, { width: 200, height: 200, kind: 'jpeg', extra: { Mask: [0, 10, 0, 10, 0, 10] } });
  const input = await doc.save();

  const { encoder, calls } = fakeEncoder(() => fakeJpeg(9, 9, 3, 60_000)); // "re-encoded" bigger
  const res = await compressPdfBytes(input, encoder);
  assert.equal(calls.length, 1, 'only the image with a soft mask is a candidate');
  assert.equal(res.stats.imagesReplaced, 0);
  assert.equal(dictName(await streamOf(res.bytes, withSMask), 'Filter'), '/DCTDecode');
  assert.equal(String((await streamOf(res.bytes, withSMask)).dict.get(PDFName.of('SMask'))), alpha.toString(), 'soft mask kept');

  const failing = fakeEncoder(() => 'throw');
  const res2 = await compressPdfBytes(input, failing.encoder);
  assert.equal(res2.stats.imagesReplaced, 0, 'an encoder error leaves the image alone, file still saves');
});

test('uncompressed streams get deflated; text survives a round trip', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  const big = doc.context.stream('BT /F1 12 Tf 72 720 Td (Hello) Tj ET\n'.repeat(200), {});
  const ref = doc.context.register(big);
  page.node.set(PDFName.of('Contents'), ref);
  const input = await doc.save({ useObjectStreams: false });

  const { encoder } = fakeEncoder(() => null);
  const { bytes, stats } = await compressPdfBytes(input, encoder);
  assert.equal(stats.streamsDeflated, 1);
  const out = await streamOf(bytes, ref);
  assert.equal(dictName(out, 'Filter'), '/FlateDecode');
  assert.ok(bytes.length < input.length);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});

test('PNG-predicted Flate images are read correctly', async () => {
  const width = 64;
  const height = 64;
  const pixels = noise(width * height * 3, 9);
  // Filter type 0 (None) on every row is still Predictor 15 framing.
  const framed = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) framed.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  const doc = await PDFDocument.create();
  doc.addPage([A4.width, A4.height]);
  addImage(doc, {
    width,
    height,
    kind: 'flate',
    pixels: framed,
    extra: { DecodeParms: { Predictor: 15, Colors: 3, Columns: width, BitsPerComponent: 8 } },
  });
  const { encoder, calls } = fakeEncoder(() => fakeJpeg(9, 9));
  await compressPdfBytes(await doc.save(), encoder);
  assert.equal(calls.length, 1);
  const src = calls[0].source;
  assert.equal(src.kind, 'pixels');
  assert.deepEqual(src.kind === 'pixels' ? src.pixels : null, pixels);
});
