import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kbToBytes, parseKb, qualityLabel, searchTarget, targetFilename, toPixels } from '../app/lib/image/target-size.ts';
import { containRect, cropRect, initialCrop, moveCrop, zoomCrop } from '../app/lib/image/crop.ts';
import { readJpegDpi, setJpegDpi } from '../app/lib/image/jpeg-dpi.ts';

// ---------- units & KB ----------

test('cm / mm / in to pixels at a DPI', () => {
  assert.equal(toPixels(3.5, 'cm', 300), 413);
  assert.equal(toPixels(4.5, 'cm', 300), 531);
  assert.equal(toPixels(35, 'mm', 300), 413);
  assert.equal(toPixels(2, 'in', 200), 400);
  assert.equal(toPixels(230, 'px', 300), 230);
  assert.ok(Number.isNaN(toPixels(0, 'cm', 300)));
  assert.ok(Number.isNaN(toPixels(3.5, 'cm', 0)));
});

test('KB parsing and the conservative byte limit', () => {
  assert.equal(parseKb('50'), 50);
  assert.equal(parseKb(' 20 KB '), 20);
  assert.equal(parseKb('1.5mb'), 1500);
  assert.equal(parseKb('0'), null);
  assert.equal(parseKb('abc'), null);
  assert.equal(kbToBytes(50), 50_000); // ≤ 50 KB whether a form counts 1000 or 1024
});

// ---------- search (fake encoder: size grows with quality and area) ----------

/** Pretend JPEG: bytes ≈ base × scale² × (0.15 + quality). */
function fakeEncoder(base: number) {
  return async (q: number, s: number) => ({ size: Math.round(base * s * s * (0.15 + q)), data: { q, s } });
}

test('search finds the highest quality that fits', async () => {
  const r = await searchTarget(fakeEncoder(100_000), { maxBytes: 70_000, allowScale: true });
  assert.equal(r.kind, 'fits');
  assert.ok(r.best.size <= 70_000);
  assert.ok(r.best.size > 66_000, `too far under target: ${r.best.size}`); // close to the limit
  assert.equal(r.best.scale, 1);
});

test('search keeps top quality when it already fits', async () => {
  const r = await searchTarget(fakeEncoder(10_000), { maxBytes: 50_000, allowScale: true });
  assert.equal(r.kind, 'fits');
  assert.equal(r.best.quality, 0.95);
  assert.equal(r.tries, 1);
});

test('search scales down when quality alone is not enough', async () => {
  const r = await searchTarget(fakeEncoder(1_000_000), { maxBytes: 20_000, allowScale: true });
  assert.equal(r.kind, 'fits');
  assert.ok(r.best.size <= 20_000);
  assert.ok(r.best.scale < 1);
});

test('fixed pixel size: reports the closest (smallest) result', async () => {
  const r = await searchTarget(fakeEncoder(1_000_000), { maxBytes: 20_000, allowScale: false });
  assert.equal(r.kind, 'too-big');
  assert.equal(r.best.quality, 0.2);
  assert.equal(r.best.scale, 1);
});

test('minimum size: says so instead of padding', async () => {
  const r = await searchTarget(fakeEncoder(5_000), { maxBytes: 20_000, minBytes: 10_000, allowScale: true });
  assert.equal(r.kind, 'too-small');
  assert.equal(r.best.quality, 0.95);
});

test('quality labels and filenames', () => {
  assert.equal(qualityLabel(0.9), 'Good');
  assert.equal(qualityLabel(0.5), 'OK');
  assert.equal(qualityLabel(0.25), 'Low');
  assert.equal(targetFilename('My Photo.png', 50, 413, 531), 'My Photo-50kb.jpg');
  assert.equal(targetFilename('sign.jpeg', null, 200, 80), 'sign-200x80.jpg');
});

// ---------- crop ----------

test('crop: largest box with the output shape, centred', () => {
  // 4000×3000 landscape → 3.5:4.5 portrait box, full height.
  const r = cropRect(4000, 3000, 413 / 531, initialCrop(4000, 3000));
  assert.equal(Math.round(r.h), 3000);
  assert.equal(Math.round(r.w), 2333);
  assert.equal(Math.round(r.x), 833);
  assert.equal(r.y, 0);
});

test('crop: moving and zooming stay inside the image', () => {
  const aspect = 1;
  let s = initialCrop(4000, 3000);
  s = moveCrop(4000, 3000, aspect, s, -10_000, 0);
  assert.equal(cropRect(4000, 3000, aspect, s).x, 0);
  s = moveCrop(4000, 3000, aspect, s, 99_999, 99_999);
  const r = cropRect(4000, 3000, aspect, s);
  assert.equal(Math.round(r.x + r.w), 4000);
  s = zoomCrop(4000, 3000, aspect, s, 2);
  const z = cropRect(4000, 3000, aspect, s);
  assert.equal(Math.round(z.w), 1500);
  assert.ok(z.x + z.w <= 4000 && z.y + z.h <= 3000);
  assert.equal(zoomCrop(4000, 3000, aspect, s, 99).zoom, 5);
});

test('fit with border: whole image centred in the frame', () => {
  assert.deepEqual(containRect(4000, 3000, 400, 400), { x: 0, y: 50, w: 400, h: 300 });
});

// ---------- DPI ----------

test('DPI: patch an existing JFIF header', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const out = setJpegDpi(jpeg, 300);
  assert.equal(readJpegDpi(out), 300);
  assert.equal(out.length, jpeg.length);
});

test('DPI: insert a JFIF header when missing; ignore non-JPEG', () => {
  const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]);
  const out = setJpegDpi(bare, 200);
  assert.equal(readJpegDpi(out), 200);
  assert.equal(out.length, bare.length + 18);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(setJpegDpi(png, 300), png);
});
