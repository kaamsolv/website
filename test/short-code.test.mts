import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE62,
  DEFAULT_LENGTH,
  MAX_LENGTH,
  MIN_LENGTH,
  generateShortCode,
  isValidShortCodeShape,
} from '../app/lib/short-code.ts';

test('default length matches DEFAULT_LENGTH', () => {
  assert.equal(generateShortCode().length, DEFAULT_LENGTH);
});

test('honours an explicit length within bounds', () => {
  assert.equal(generateShortCode(10).length, 10);
});

test('clamps length to [MIN, MAX]', () => {
  assert.equal(generateShortCode(1).length, MIN_LENGTH);
  assert.equal(generateShortCode(999).length, MAX_LENGTH);
});

test('only ever emits Base62 characters', () => {
  const set = new Set(BASE62);
  for (let i = 0; i < 500; i += 1) {
    for (const ch of generateShortCode()) assert.ok(set.has(ch), `bad char: ${ch}`);
  }
});

test('is non-sequential / not trivially predictable', () => {
  const a = generateShortCode();
  const b = generateShortCode();
  assert.notEqual(a, b);
});

test('no collisions across a large sample at default length', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i += 1) {
    const code = generateShortCode();
    assert.ok(!seen.has(code), `collision at ${i}: ${code}`);
    seen.add(code);
  }
});

test('character distribution is not wildly skewed (rejection sampling works)', () => {
  const counts = new Map<string, number>();
  const N = 60_000;
  for (let i = 0; i < N; i += 1) {
    for (const ch of generateShortCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const total = DEFAULT_LENGTH * N;
  const expected = total / BASE62.length;
  for (const ch of BASE62) {
    const c = counts.get(ch) ?? 0;
    // within 20% of uniform — a raw `byte % 62` bias would blow past this
    assert.ok(Math.abs(c - expected) < expected * 0.2, `${ch}: ${c} vs ~${Math.round(expected)}`);
  }
});

test('shape validator accepts codes in range and rejects junk', () => {
  assert.ok(isValidShortCodeShape('aB3xK9p'));
  assert.ok(isValidShortCodeShape('abcd'));
  assert.ok(!isValidShortCodeShape('abc')); // too short
  assert.ok(!isValidShortCodeShape('has-dash'));
  assert.ok(!isValidShortCodeShape('has space'));
  assert.ok(!isValidShortCodeShape('a'.repeat(MAX_LENGTH + 1)));
});
