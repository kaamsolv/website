/**
 * The small helpers every database tool shares (db/atomic-migration.ts): reading a flag's value without ever
 * falling back to another argument, and turning any error into one safe line.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StopRun, argValue, describeError } from '../db/atomic-migration.ts';

test('argValue reads the word after the flag, and only that', () => {
  assert.equal(argValue(['--expect-host', 'db.example'], '--expect-host'), 'db.example');
  assert.equal(argValue(['--a', '1', '--expect-host', 'db.example', '--b'], '--expect-host'), 'db.example');
});

test('argValue never reads another argument when the flag is missing or has no value', () => {
  // The bug it replaces: args[args.indexOf(flag) + 1] is args[0] when the flag is absent.
  assert.equal(argValue(['db.example', '--non-production'], '--expect-host'), undefined);
  assert.equal(argValue([], '--expect-host'), undefined);
  assert.equal(argValue(['--expect-host'], '--expect-host'), undefined, 'flag last, no value');
  assert.equal(argValue(['--expect-host', '--non-production'], '--expect-host'), undefined, 'the next word is another flag');
});

test('describeError is one capped line with the name, code and message — and none of the error’s other properties', () => {
  const secretUrl = 'postgres://app_user:Sup3r-S3cret@db.example/neondb';
  const invalid = Object.assign(new TypeError('Invalid URL'), { code: 'ERR_INVALID_URL', input: secretUrl });
  const line = describeError(invalid, secretUrl);
  assert.equal(line, 'TypeError [ERR_INVALID_URL]: Invalid URL');
  assert.ok(!line.includes('Sup3r-S3cret') && !line.includes('input'), 'the input property that Node would print is never included');
});

test('describeError scrubs the connection string, password and user from the message itself', () => {
  const url = 'postgres://app_user:Sup3r-S3cret@db.example/neondb?sslmode=require';
  const e = new Error(`could not connect to ${url} as app_user with Sup3r-S3cret`);
  const line = describeError(e, url);
  assert.ok(!line.includes('Sup3r-S3cret') && !line.includes('app_user') && !line.includes('postgres://'));
  assert.match(line, /\[redacted\]/);
});

test('describeError copes with anything thrown, and caps long messages', () => {
  assert.equal(describeError('a plain string', undefined), 'Error: a plain string');
  assert.equal(describeError(undefined, undefined), 'Error: undefined');
  assert.ok(describeError(new Error('x'.repeat(5000)), undefined).length < 340);
});

test('StopRun carries an exit code and is an Error, so it can be thrown from anywhere and caught by the shared handler', () => {
  const stop = new StopRun(3);
  assert.ok(stop instanceof Error);
  assert.equal(stop.exitCode, 3);
  assert.equal(stop.name, 'StopRun');
});
