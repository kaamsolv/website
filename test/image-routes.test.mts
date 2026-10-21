import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seoPathForSlug, slugForPair, isConverterSlug } from '../app/lib/image/routes.ts';

test('seoPathForSlug returns root-level path', () => {
  assert.equal(seoPathForSlug('jpg-to-png'), '/jpg-to-png');
});

test('slugForPair maps known conversion pairs', () => {
  assert.equal(slugForPair('jpeg', 'png'), 'jpg-to-png');
  assert.equal(slugForPair('heic', 'jpeg'), 'heic-to-jpg');
  assert.equal(slugForPair('avif', 'png'), 'avif-to-png');
});

test('slugForPair returns null for same format', () => {
  assert.equal(slugForPair('png', 'png'), null);
});

test('slugForPair returns null for pairs without SEO route', () => {
  assert.equal(slugForPair('jpeg', 'heic'), null);
});

test('isConverterSlug validates slugs', () => {
  assert.equal(isConverterSlug('jpg-to-png'), true);
  assert.equal(isConverterSlug('not-a-tool'), false);
});
