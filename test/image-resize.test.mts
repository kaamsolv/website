import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOutputDimensions } from '../app/lib/image/transform/resize.ts';
import { DEFAULT_RESIZE_OPTIONS } from '../app/lib/image/types.ts';

test('original mode keeps source dimensions', () => {
  const result = resolveOutputDimensions(1920, 1080, DEFAULT_RESIZE_OPTIONS);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.changed, false);
});

test('scale mode halves dimensions at 50%', () => {
  const result = resolveOutputDimensions(2000, 1000, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'scale',
    scalePercent: 50,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 1000);
  assert.equal(result.height, 500);
  assert.equal(result.changed, true);
});

test('scale mode rejects invalid percent', () => {
  const result = resolveOutputDimensions(100, 100, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'scale',
    scalePercent: 0,
  });
  assert.equal(result.ok, false);
});

test('dimensions mode with width and aspect ratio computes height', () => {
  const result = resolveOutputDimensions(1600, 900, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    width: 800,
    height: null,
    keepAspectRatio: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 800);
  assert.equal(result.height, 450);
});

test('dimensions mode without aspect ratio allows independent height', () => {
  const result = resolveOutputDimensions(1600, 900, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    width: 800,
    height: 600,
    keepAspectRatio: false,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 800);
  assert.equal(result.height, 600);
});

test('dimensions mode with aspect ratio uses width as primary', () => {
  const result = resolveOutputDimensions(1600, 900, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    width: 800,
    height: 999,
    keepAspectRatio: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.width, 800);
  assert.equal(result.height, 450);
});

test('rejects negative custom width', () => {
  const result = resolveOutputDimensions(100, 100, {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    width: -10,
    height: null,
    keepAspectRatio: true,
  });
  assert.equal(result.ok, false);
});
