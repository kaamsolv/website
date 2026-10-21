import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormatFromHeader, detectImageFile, outputFilename } from '../app/lib/image/validate.ts';
import { resolveOutputDimensions } from '../app/lib/image/transform/resize.ts';
import { DEFAULT_RESIZE_OPTIONS } from '../app/lib/image/types.ts';
import { MAX_IMAGE_DIMENSION } from '../app/lib/image/types.ts';
import { encodingControlForFormat } from '../app/lib/image/registry/encoding.ts';

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_SIG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

test('header detection wins over misleading .jpg extension for PNG bytes', async () => {
  const file = new File([PNG_SIG], 'fake.jpg', { type: 'image/jpeg' });
  const result = await detectImageFile(file);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.detected.format, 'png');
});

test('JPEG magic bytes detected regardless of MIME spelling', async () => {
  for (const mime of ['image/jpeg', 'image/jpg', '']) {
    const file = new File([JPEG_SIG], 'photo.jpeg', { type: mime });
    const result = await detectImageFile(file);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.detected.format, 'jpeg');
  }
});

test('output filenames use correct extensions for all encodable formats', () => {
  assert.equal(outputFilename('holiday.JPG', 'png'), 'holiday.png');
  assert.equal(outputFilename('holiday.JPG', 'jpeg'), 'holiday.jpg');
  assert.equal(outputFilename('holiday.JPG', 'webp'), 'holiday.webp');
});

test('resize allows 1x1 output', () => {
  const result = resolveOutputDimensions(100, 100, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    width: 1,
    height: 1,
    keepAspectRatio: false,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
});

test('resize rejects dimension above engine max', () => {
  const result = resolveOutputDimensions(1000, 1000, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    width: MAX_IMAGE_DIMENSION + 1,
    height: 100,
    keepAspectRatio: false,
  });
  assert.equal(result.ok, false);
});

test('resize scale at 1% rounds to small pixel dimensions', () => {
  const result = resolveOutputDimensions(200, 100, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'scale',
    scalePercent: 1,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
});

test('aspect ratio unlocked allows stretch', () => {
  const result = resolveOutputDimensions(200, 100, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    width: 50,
    height: 80,
    keepAspectRatio: false,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 50);
  assert.equal(result.height, 80);
});

test('png output has no quality encoding control', () => {
  assert.equal(encodingControlForFormat('png'), 'none');
});

test('detectFormatFromHeader identifies AVIF ftyp', () => {
  const header = new Uint8Array([
    0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
  ]);
  assert.equal(detectFormatFromHeader(header), 'avif');
});

test('rejects a text file renamed to .png (no image signature)', async () => {
  const file = new File(['this is not an image'], 'notes.png', { type: 'image/png' });
  const result = await detectImageFile(file);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'corrupted');
});

test('still accepts an SVG identified only by its name / MIME type', async () => {
  const svg = `<?xml version="1.0"?>\n<!-- ${'x'.repeat(200)} -->\n<svg xmlns="http://www.w3.org/2000/svg"/>`;
  const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });
  const result = await detectImageFile(file);
  assert.equal(result.ok, true);
});
