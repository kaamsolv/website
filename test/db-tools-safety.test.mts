/**
 * The database tools must never choose a target for you, never read an .env file by themselves, and never print
 * credentials. Run for real as child processes. Nothing here has a real database: the target is `example.invalid`
 * (a name that cannot resolve), so a tool that wrongly tried to connect would fail differently — and slowly — than
 * these immediate, specific refusals.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { redact } from '../db/atomic-migration.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PASSWORD = 'S3cr3t-Passw0rd!x';
const URL_WITH_SECRET = `postgres://app_user:${PASSWORD}@example.invalid/neondb?sslmode=require`;
const temp: string[] = [];
after(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** tsx by absolute address, so a child started in another folder still finds it. */
const TSX = import.meta.resolve('tsx');
const BASE_ENV = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', TEMP: process.env.TEMP ?? '' };
function run(script: string, args: string[], env: Record<string, string> = {}, cwd = ROOT, viaTsx = false) {
  const nodeArgs = viaTsx ? ['--import', TSX, resolve(ROOT, script), ...args] : [resolve(ROOT, script), ...args];
  const r = spawnSync(process.execPath, nodeArgs, { cwd, env: { ...BASE_ENV, ...env }, encoding: 'utf8', timeout: 60_000 });
  const out = `${r.stdout}${r.stderr}`;
  assert.ok(!/SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find/.test(out), `the tool must start: ${out.slice(0, 300)}`);
  return { code: r.status, out };
}
const noSecrets = (text: string) => {
  assert.ok(!text.includes(PASSWORD), 'the password is never printed');
  assert.ok(!text.includes('app_user:'), 'the credentials are never printed');
  assert.ok(!text.includes('postgres://'), 'the connection string is never printed');
};

test('redact scrubs the connection string, the password and the user wherever they appear', () => {
  const msg = `connect failed for ${URL_WITH_SECRET}; auth failed for user app_user with ${PASSWORD} (${encodeURIComponent(PASSWORD)})`;
  const out = redact(msg, URL_WITH_SECRET);
  noSecrets(out);
  assert.match(out, /\[redacted\]/);
  assert.equal(redact('nothing secret here', URL_WITH_SECRET), 'nothing secret here');
  assert.equal(redact('anything', undefined), 'anything');
});

test('the atomic runner does nothing without DATABASE_URL — and does not read a .env.local file to find one', () => {
  const none = run('db/migrate-atomic.mts', ['--expect-host', 'example.invalid']);
  assert.equal(none.code, 1);
  assert.match(none.out, /DATABASE_URL is not set/);

  const dir = mkdtempSync(join(tmpdir(), 'kk-env-'));
  temp.push(dir);
  writeFileSync(join(dir, '.env.local'), `DATABASE_URL=${URL_WITH_SECRET}\n`);
  writeFileSync(join(dir, '.env'), `DATABASE_URL=${URL_WITH_SECRET}\n`);
  const fromFile = run('db/migrate-atomic.mts', ['--expect-host', 'example.invalid'], {}, dir);
  assert.equal(fromFile.code, 1);
  assert.match(fromFile.out, /DATABASE_URL is not set/, 'a production string left in .env.local is never picked up');
  noSecrets(fromFile.out);
});

test('the atomic runner needs --expect-host to match, even for a dry run, and says so before contacting anything', () => {
  for (const args of [[], ['--expect-host', 'someone-else.example'], ['--confirm', '--restore-point-taken'], ['--confirm', '--expect-host', 'wrong.example', '--restore-point-taken']]) {
    const r = run('db/migrate-atomic.mts', args, { DATABASE_URL: URL_WITH_SECRET });
    assert.equal(r.code, 1, args.join(' '));
    assert.match(r.out, /--expect-host must be exactly "example\.invalid".*Nothing was contacted/s);
    assert.ok(!/Target:/.test(r.out), 'it did not get as far as naming a target to contact');
    noSecrets(r.out);
  }
});

test('the rehearsal refuses without a target, a matching host and --non-production — and prints no credentials', () => {
  const none = run('scripts/rehearse-payments.mts', [], {}, ROOT, true);
  assert.equal(none.code, 1);
  assert.match(none.out, /Set DATABASE_URL to a dedicated NON-PRODUCTION/);

  const noHost = run('scripts/rehearse-payments.mts', [], { DATABASE_URL: URL_WITH_SECRET }, ROOT, true);
  assert.equal(noHost.code, 1);
  assert.match(noHost.out, /--expect-host must be exactly "example\.invalid"/);
  noSecrets(noHost.out);

  const noFlag = run('scripts/rehearse-payments.mts', ['--expect-host', 'example.invalid'], { DATABASE_URL: URL_WITH_SECRET }, ROOT, true);
  assert.equal(noFlag.code, 1);
  assert.match(noFlag.out, /add --non-production/);
  noSecrets(noFlag.out);

  const dir = mkdtempSync(join(tmpdir(), 'kk-env-'));
  temp.push(dir);
  writeFileSync(join(dir, '.env.local'), `DATABASE_URL=${URL_WITH_SECRET}\n`);
  const fromFile = run('scripts/rehearse-payments.mts', ['--expect-host', 'example.invalid', '--non-production'], {}, dir, true);
  assert.equal(fromFile.code, 1);
  assert.match(fromFile.out, /Set DATABASE_URL/, 'no .env file is read');
});

test('the rehearsal’s local self-check needs no database and no credentials', () => {
  const r = run('scripts/rehearse-payments.mts', ['--local'], {}, ROOT, true);
  assert.equal(r.code, 0, r.out.slice(-400));
  assert.match(r.out, /11 of 11 checks passed/);
});
