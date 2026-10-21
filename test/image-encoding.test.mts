import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodingControlForFormat,
  supportsQualityControl,
} from '../app/lib/image/registry/encoding.ts';
import { resolveEncodeParams } from '../app/lib/image/transform/optimize.ts';
import { DEFAULT_CONVERT_OPTIONS } from '../app/lib/image/types.ts';

test('jpeg and webp expose quality control', () => {
  assert.equal(encodingControlForFormat('jpeg'), 'quality');
  assert.equal(encodingControlForFormat('webp'), 'quality');
  assert.ok(supportsQualityControl('jpeg'));
  assert.ok(supportsQualityControl('webp'));
});

test('png has no fake quality slider', () => {
  assert.equal(encodingControlForFormat('png'), 'none');
  assert.equal(supportsQualityControl('png'), false);
});

test('resolveEncodeParams omits quality for png', () => {
  const params = resolveEncodeParams('png', DEFAULT_CONVERT_OPTIONS);
  assert.equal(params.quality, undefined);
});

test('resolveEncodeParams passes quality for webp', () => {
  const params = resolveEncodeParams('webp', { ...DEFAULT_CONVERT_OPTIONS, quality: 0.8 });
  assert.equal(params.quality, 0.8);
});
