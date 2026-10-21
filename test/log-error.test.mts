import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorDetail, formatErrorForLog, redactSecrets } from '../app/lib/log-error.ts';

/** The shape Drizzle produces: a huge generic wrapper around the real error. */
function drizzleStyleError() {
  const cause = Object.assign(new Error('relation "links" does not exist'), {
    name: 'error',
    code: '42P01',
  });
  return new Error(
    `Failed query: insert into "links" (${'"col", '.repeat(80)})\nparams: abc,https://example.com/x`,
    { cause },
  );
}

test('puts the root cause on the first line, ahead of the wrapper', () => {
  const lines = errorDetail(drizzleStyleError()).split('\n');
  assert.equal(lines[0], 'error: relation "links" does not exist [code 42P01]');
  assert.match(lines[1], /wrapped by ← Error: Failed query/);
});

test('the root cause survives truncation of the entry', () => {
  // Emulate a log viewer that keeps only the first 200 characters.
  const truncated = errorDetail(drizzleStyleError()).slice(0, 200);
  assert.match(truncated, /relation "links" does not exist/);
  assert.match(truncated, /42P01/);
});

test('caps an oversized message instead of dumping the whole statement', () => {
  const first = errorDetail(drizzleStyleError()).split('\n')[1];
  assert.ok(first.length < 400, `wrapper line was ${first.length} chars`);
  assert.match(first, /…$|…/);
});

test('includes stack frames, but only frames and only a few', () => {
  const detail = errorDetail(drizzleStyleError());
  const frames = detail.split('\n').filter((l) => l.trimStart().startsWith('at '));
  assert.ok(frames.length > 0, 'expected at least one frame');
  assert.ok(frames.length <= 8, `expected at most 8 frames, got ${frames.length}`);
  // The stack's message line must not be repeated verbatim.
  assert.equal(detail.split('Failed query').length - 1, 1);
});

test('walks a multi-level cause chain, deepest first', () => {
  const root = new Error('root boom');
  const mid = new Error('middle', { cause: root });
  const top = new Error('top', { cause: mid });
  const lines = errorDetail(top).split('\n');
  assert.equal(lines[0], 'Error: root boom');
  assert.match(lines[1], /wrapped by ← Error: middle/);
  assert.match(lines[2], /wrapped by ← Error: top/);
});

test('a cyclic cause chain terminates', () => {
  const a = new Error('a');
  const b = new Error('b', { cause: a });
  (a as { cause?: unknown }).cause = b;
  const detail = errorDetail(a);
  assert.ok(detail.length > 0);
  assert.ok(detail.split('\n').length < 20, 'chain should be bounded');
});

test('handles a non-Error throw', () => {
  assert.equal(errorDetail('just a string'), 'just a string');
  assert.equal(errorDetail(undefined), 'undefined');
});

// Fixtures below use example.com hosts and obviously-fake passwords on purpose:
// a realistic-looking connection string in a committed file trips credential
// scanners (including this repo's own pre-commit check) for no good reason.

test('redactSecrets removes a connection string, its role and its password', () => {
  const raw = 'connect failed: postgresql://dbrole:not-a-real-password@db.example.com/appdb?ssl=require';
  const safe = redactSecrets(raw);
  assert.ok(!safe.includes('not-a-real-password'));
  assert.ok(!safe.includes('dbrole'));
  assert.match(safe, /postgresql:\/\/\[redacted\]/);
});

test('redactSecrets also handles the postgres:// scheme', () => {
  const safe = redactSecrets('postgres://u:pw@db.example.com/x');
  assert.ok(!safe.includes('pw@'));
  assert.match(safe, /postgresql:\/\/\[redacted\]/);
});

test('formatErrorForLog redacts a credential carried on the cause', () => {
  const cause = new Error('invalid URL: postgresql://u:also-fake@db.example.com/x');
  const out = formatErrorForLog(new Error('Failed query', { cause }));
  assert.ok(!out.includes('also-fake'));
  assert.match(out, /\[redacted\]/);
});
