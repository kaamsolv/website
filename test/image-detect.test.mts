import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormatFromHeader } from '../app/lib/image/validate.ts';

test('detects GIF87a', () => {
  const h = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
  assert.equal(detectFormatFromHeader(h), 'gif');
});

test('detects BMP', () => {
  const h = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);
  assert.equal(detectFormatFromHeader(h), 'bmp');
});

test('detects ICO', () => {
  const h = new Uint8Array([0x00, 0x00, 0x01, 0x00]);
  assert.equal(detectFormatFromHeader(h), 'ico');
});

test('detects SVG from markup', () => {
  const h = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(detectFormatFromHeader(h), 'svg');
});

test('detects TIFF little-endian', () => {
  const h = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
  assert.equal(detectFormatFromHeader(h), 'tiff');
});
