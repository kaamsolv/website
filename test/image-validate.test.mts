import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFormatFromHeader,
  extensionOf,
  formatBytes,
  formatFromFilename,
  labelForFormat,
  outputFilename,
} from '../app/lib/image/validate.ts';
import { getImageTool } from '../app/lib/image/tools.ts';

test('detectFormatFromHeader identifies JPEG magic bytes', () => {
  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(detectFormatFromHeader(header), 'jpeg');
});

test('detectFormatFromHeader identifies PNG signature', () => {
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(detectFormatFromHeader(header), 'png');
});

test('detectFormatFromHeader identifies WEBP', () => {
  const header = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(detectFormatFromHeader(header), 'webp');
});

test('formatFromFilename maps extensions', () => {
  assert.equal(formatFromFilename('photo.JPG'), 'jpeg');
  assert.equal(formatFromFilename('scan.heic'), 'heic');
  assert.equal(formatFromFilename('image.avif'), 'avif');
});

test('outputFilename swaps extension', () => {
  assert.equal(outputFilename('holiday photo.jpg', 'png'), 'holiday photo.png');
  assert.equal(outputFilename('noext', 'webp'), 'noext.webp');
});

test('formatBytes renders human sizes', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.match(formatBytes(2 * 1024 * 1024), /MB/);
});

test('getImageTool returns all ten converters', () => {
  const tool = getImageTool('jpg-to-png');
  assert.ok(tool);
  assert.equal(tool!.from, 'jpeg');
  assert.equal(tool!.to, 'png');
  assert.equal(extensionOf('test.jpeg'), 'jpeg');
  assert.equal(labelForFormat('heic'), 'HEIC');
});
