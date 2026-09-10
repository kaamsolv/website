import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReservedCode, RESERVED_CODES } from '../app/lib/reserved-routes.ts';

test('flags top-level app routes', () => {
  for (const r of ['url-shortener', 'about', 'login', 'api', 'dashboard', 'design-system']) {
    assert.ok(isReservedCode(r), r);
  }
});

test('flags framework / asset paths', () => {
  for (const r of ['_next', 'favicon.ico', 'robots.txt', 'sitemap.xml']) {
    assert.ok(isReservedCode(r), r);
  }
});

test('is case-insensitive and trims', () => {
  assert.ok(isReservedCode('  ABOUT '));
  assert.ok(isReservedCode('Api'));
});

test('does not flag a normal-looking short code', () => {
  for (const code of ['aB3xK9p', 'x7Kp2', 'q1w2e3r', 'Zz9Yy8X']) {
    assert.ok(!isReservedCode(code), code);
  }
});

test('every entry is stored lower-case', () => {
  for (const entry of RESERVED_CODES) assert.equal(entry, entry.toLowerCase());
});
