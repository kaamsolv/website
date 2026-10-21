import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canConvert,
  defaultOutputForInput,
  getDecodableFormats,
  getEncodableFormats,
  getGroupedInputFormats,
} from '../app/lib/image/registry/capabilities.ts';
import { FORMAT_REGISTRY } from '../app/lib/image/registry/format-registry.ts';

test('live decodable formats include core set', () => {
  const ids = getDecodableFormats().map((f) => f.id);
  for (const id of ['jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'bmp', 'ico', 'svg']) {
    assert.ok(ids.includes(id), `expected ${id} to be decodable`);
  }
});

test('encodable formats are JPG PNG WebP only', () => {
  const ids = getEncodableFormats().map((f) => f.id).sort();
  assert.deepEqual(ids, ['jpeg', 'png', 'webp']);
});

test('canConvert rejects same format', () => {
  assert.equal(canConvert('png', 'png'), false);
});

test('canConvert allows png to jpeg', () => {
  assert.equal(canConvert('png', 'jpeg'), true);
});

test('canConvert rejects heic encode', () => {
  assert.equal(canConvert('jpeg', 'heic'), false);
});

test('canConvert allows heic to png', () => {
  assert.equal(canConvert('heic', 'png'), true);
});

test('canConvert allows gif to webp', () => {
  assert.equal(canConvert('gif', 'webp'), true);
});

test('defaultOutputForInput picks valid output', () => {
  assert.equal(defaultOutputForInput('heic', 'webp'), 'webp');
  assert.equal(canConvert('heic', defaultOutputForInput('heic', 'heic')), true);
});

test('grouped input formats only show live decodable', () => {
  const groups = getGroupedInputFormats();
  const all = groups.flatMap((g) => g.formats);
  assert.ok(all.every((f) => f.canDecode && f.tier === 'live'));
  assert.ok(!all.some((f) => f.id === 'psd'));
});

test('deferred formats are not decodable in registry', () => {
  assert.equal(FORMAT_REGISTRY.psd.canDecode, false);
  assert.equal(FORMAT_REGISTRY.tiff.canDecode, false);
  assert.equal(FORMAT_REGISTRY.cr2.tier, 'pro-only');
});
