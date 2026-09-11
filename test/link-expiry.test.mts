import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXPIRY,
  EXPIRY_OPTIONS,
  expiresAtFor,
  parseExpiryOption,
} from '../app/lib/link-expiry.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);

test('the default is "never", and it is the first option shown', () => {
  assert.equal(DEFAULT_EXPIRY, 'never');
  assert.equal(EXPIRY_OPTIONS[0].value, 'never');
});

test('a missing expiresIn falls back to the default (older clients keep working)', () => {
  assert.equal(parseExpiryOption(undefined), 'never');
  assert.equal(parseExpiryOption(null), 'never');
});

test('every preset is accepted', () => {
  for (const o of EXPIRY_OPTIONS) assert.equal(parseExpiryOption(o.value), o.value);
});

test('anything outside the presets is rejected', () => {
  for (const bad of ['', '2d', '1D', 'forever', 7, '7', {}, [], true, '2030-01-01']) {
    assert.equal(parseExpiryOption(bad), null, JSON.stringify(bad));
  }
});

test('"never" has no expiry', () => {
  assert.equal(expiresAtFor('never', NOW), null);
});

test('presets resolve to exact durations from now', () => {
  assert.equal(expiresAtFor('1d', NOW)?.getTime(), NOW + DAY);
  assert.equal(expiresAtFor('7d', NOW)?.getTime(), NOW + 7 * DAY);
  assert.equal(expiresAtFor('30d', NOW)?.getTime(), NOW + 30 * DAY);
});
