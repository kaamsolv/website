import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDestinationUrl } from '../app/lib/url-validation.ts';

test('accepts a plain https URL and keeps it intact', () => {
  const r = validateDestinationUrl('https://example.com/a/b?x=1#frag');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.normalized, 'https://example.com/a/b?x=1#frag');
});

test('accepts http', () => {
  assert.equal(validateDestinationUrl('http://example.com').ok, true);
});

test('adds https:// to a bare domain', () => {
  const r = validateDestinationUrl('example.com/path');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.normalized, 'https://example.com/path');
});

test('rejects a bare word with no dot', () => {
  assert.equal(validateDestinationUrl('notaurl').ok, false);
});

test('rejects javascript: scheme', () => {
  const r = validateDestinationUrl('javascript:alert(1)');
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(['unsupported_scheme', 'unparseable', 'control_chars'].includes(r.reason));
});

test('rejects data: scheme', () => {
  assert.equal(validateDestinationUrl('data:text/html,<h1>hi</h1>').ok, false);
});

test('rejects file: scheme', () => {
  assert.equal(validateDestinationUrl('file:///etc/passwd').ok, false);
});

test('rejects embedded credentials', () => {
  const r = validateDestinationUrl('https://user:pass@example.com');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'has_credentials');
});

test('rejects localhost', () => {
  assert.equal(validateDestinationUrl('http://localhost:3000').ok, false);
});

test('rejects private IPv4 ranges', () => {
  for (const h of ['http://10.0.0.1', 'http://192.168.1.1', 'http://172.16.5.4', 'http://127.0.0.1']) {
    assert.equal(validateDestinationUrl(h).ok, false, h);
  }
});

test('rejects the cloud metadata IP', () => {
  assert.equal(validateDestinationUrl('http://169.254.169.254/latest/meta-data').ok, false);
});

test('rejects .local hostnames', () => {
  assert.equal(validateDestinationUrl('http://printer.local').ok, false);
});

test('rejects an over-long URL', () => {
  const long = 'https://example.com/' + 'a'.repeat(3000);
  const r = validateDestinationUrl(long);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'too_long');
});

test('rejects whitespace inside the value', () => {
  assert.equal(validateDestinationUrl('https://exa mple.com').ok, false);
});

test('trims surrounding whitespace before validating', () => {
  assert.equal(validateDestinationUrl('   https://example.com   ').ok, true);
});

test('rejects shortening one of our own short links', () => {
  const r = validateDestinationUrl('https://kaamkit.com/aB3xK9p');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'self_reference');
});

test('allows a normal kaamkit.com page (not a short-code shape)', () => {
  assert.equal(validateDestinationUrl('https://kaamkit.com/url-shortener').ok, true);
});

test('drops a default port during normalisation', () => {
  const r = validateDestinationUrl('https://example.com:443/x');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.normalized, 'https://example.com/x');
});

test('empty string reports the empty reason', () => {
  const r = validateDestinationUrl('   ');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'empty');
});
