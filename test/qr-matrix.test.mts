import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatrix, isFinderModule, moduleAt } from '../app/lib/qr/matrix.ts';

test('createMatrix returns boolean module data', () => {
  const m = createMatrix('https://example.com', 'M');
  assert.ok(m.size > 0);
  assert.equal(m.data.length, m.size * m.size);
  assert.equal(typeof m.data[0], 'boolean');
});

test('createMatrix respects error correction level', () => {
  const low = createMatrix('https://example.com', 'L');
  const high = createMatrix('https://example.com', 'H');
  assert.ok(high.data.length >= low.data.length);
});

test('isFinderModule identifies corner finders', () => {
  const size = 21;
  assert.equal(isFinderModule(0, 0, size), true);
  assert.equal(isFinderModule(0, size - 1, size), true);
  assert.equal(isFinderModule(size - 1, 0, size), true);
  assert.equal(isFinderModule(10, 10, size), false);
});

test('moduleAt reads matrix cells', () => {
  const m = createMatrix('hi', 'M');
  const v = moduleAt(m, 0, 0);
  assert.equal(typeof v, 'boolean');
});
