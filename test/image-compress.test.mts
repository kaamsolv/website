import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compressedFilename,
  compressOutcome,
  compressOutputChoices,
  defaultCompressOutput,
  isCompressibleInput,
  maxSideChoicesFor,
  qualityForLevel,
  resizeForMaxSide,
} from '../app/lib/image/compress.ts';
import { canConvert, canProcess } from '../app/lib/image/registry/capabilities.ts';
import { resolveOutputDimensions } from '../app/lib/image/transform/resize.ts';
import { DEFAULT_RESIZE_OPTIONS } from '../app/lib/image/types.ts';

test('default output keeps JPG and WebP, turns PNG into WebP, HEIC/AVIF into JPG', () => {
  assert.equal(defaultCompressOutput('jpeg'), 'jpeg');
  assert.equal(defaultCompressOutput('webp'), 'webp');
  assert.equal(defaultCompressOutput('png'), 'webp');
  assert.equal(defaultCompressOutput('heic'), 'jpeg');
  assert.equal(defaultCompressOutput('avif'), 'jpeg');
});

test('PNG can stay PNG; JPG is never offered PNG (it would grow)', () => {
  assert.deepEqual(compressOutputChoices('png').map((c) => c.format), ['webp', 'jpeg', 'png']);
  assert.ok(!compressOutputChoices('jpeg').some((c) => c.format === 'png'));
});

test('only still raster formats are compressible', () => {
  for (const f of ['jpeg', 'png', 'webp', 'heic', 'avif', 'bmp'] as const) assert.ok(isCompressibleInput(f), f);
  for (const f of ['svg', 'gif', 'ico'] as const) assert.ok(!isCompressibleInput(f), f);
});

test('levels get stronger from quality to smaller', () => {
  assert.ok(qualityForLevel('smaller') < qualityForLevel('balanced'));
  assert.ok(qualityForLevel('balanced') < qualityForLevel('quality'));
});

test('engine allows same-format re-encode; the converter rule still does not', () => {
  assert.equal(canProcess('jpeg', 'jpeg'), true);
  assert.equal(canProcess('webp', 'webp'), true);
  assert.equal(canProcess('png', 'png'), true);
  assert.equal(canConvert('jpeg', 'jpeg'), false);
  assert.equal(canProcess('jpeg', 'png'), true);
});

test('max-size choices never upscale', () => {
  assert.deepEqual(maxSideChoicesFor(4032, 3024), [null, 3840, 2560, 1920, 1280]);
  assert.deepEqual(maxSideChoicesFor(2000, 1500), [null, 1920, 1280]);
  assert.deepEqual(maxSideChoicesFor(800, 600), [null]);
  assert.deepEqual(maxSideChoicesFor(null, null), [null]);
});

test('max size caps the longest side and keeps the aspect ratio', () => {
  const landscape = resizeForMaxSide(1920, 4032, 3024);
  assert.deepEqual(resolveOutputDimensions(4032, 3024, landscape), { ok: true, width: 1920, height: 1440, changed: true });
  const portrait = resizeForMaxSide(1920, 3024, 4032);
  assert.deepEqual(resolveOutputDimensions(3024, 4032, portrait), { ok: true, width: 1440, height: 1920, changed: true });
});

test('max size is a no-op when off or already small enough', () => {
  assert.deepEqual(resizeForMaxSide(null, 4032, 3024), DEFAULT_RESIZE_OPTIONS);
  assert.deepEqual(resizeForMaxSide(1920, 1200, 800), DEFAULT_RESIZE_OPTIONS);
});

test('outcome: smaller reports savings; equal or bigger is not offered', () => {
  assert.deepEqual(compressOutcome(1000, 380), { kind: 'smaller', savedBytes: 620, savedPercent: 62 });
  assert.deepEqual(compressOutcome(1000, 1000), { kind: 'not-smaller', extraBytes: 0 });
  assert.deepEqual(compressOutcome(1000, 1200), { kind: 'not-smaller', extraBytes: 200 });
  assert.equal(compressOutcome(0, 10).kind, 'not-smaller');
});

test('compressed filename never overwrites the original', () => {
  assert.equal(compressedFilename('holiday.JPG', 'jpg'), 'holiday-compressed.jpg');
  assert.equal(compressedFilename('scan.final.png', 'webp'), 'scan.final-compressed.webp');
  assert.equal(compressedFilename('.png', 'jpg'), '.png-compressed.jpg');
  assert.equal(compressedFilename('noext', 'webp'), 'noext-compressed.webp');
});
