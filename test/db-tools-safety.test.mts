/**
 * The database tools must never choose a target for you, never read an .env file by themselves, and never print
 * credentials. Run for real as child processes. Nothing here has a real database: the target is `example.invalid`
 * (a name that cannot resolve), so a tool that wrongly tried to connect would fail differently — and slowly — than
 * these immediate, specific refusals.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const BASE_ENV = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', TEMP: process.env.TEMP ?? '', NODE_NO_WARNINGS: '1' };
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

import { loadMigrations } from '../db/atomic-migration.ts';
const ALL = loadMigrations(resolve(ROOT, 'db/migrations'));

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
    assert.match(r.out, /--expect-host is missing or does not match the host in DATABASE_URL.*Nothing was contacted/s);
    assert.ok(!r.out.includes('example.invalid'), 'the refusal does not tell the operator what the host is');
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
  assert.match(noHost.out, /--expect-host is missing or does not match/);
  assert.ok(!noHost.out.includes('example.invalid'));
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
  assert.match(r.out, /13 of 13 checks passed/);
  assert.match(r.out, /necessary for a race, not proof of one/);
  assert.match(r.out, /nothing here raced inside the database/, 'on PGlite it never claims a race happened');
});

test('the rehearsal-preparation tool refuses without an explicit matching target and --non-production, reads no .env file, and prints no credentials', () => {
  const none = run('db/prepare-rehearsal.mts', ['--expect-host', 'example.invalid']);
  assert.equal(none.code, 1);
  assert.match(none.out, /DATABASE_URL is not set/);

  const noHost = run('db/prepare-rehearsal.mts', [], { DATABASE_URL: URL_WITH_SECRET });
  assert.equal(noHost.code, 1);
  assert.match(noHost.out, /--expect-host is missing or does not match.*Nothing was contacted/s);
  assert.ok(!noHost.out.includes('example.invalid'));
  noSecrets(noHost.out);

  const noFlag = run('db/prepare-rehearsal.mts', ['--expect-host', 'example.invalid'], { DATABASE_URL: URL_WITH_SECRET });
  assert.equal(noFlag.code, 1);
  assert.match(noFlag.out, /add --non-production.*Nothing was contacted/s);
  noSecrets(noFlag.out);

  const dir = mkdtempSync(join(tmpdir(), 'kk-env-'));
  temp.push(dir);
  writeFileSync(join(dir, '.env.local'), `DATABASE_URL=${URL_WITH_SECRET}\n`);
  const fromFile = run('db/prepare-rehearsal.mts', ['--expect-host', 'example.invalid', '--non-production'], {}, dir);
  assert.equal(fromFile.code, 1);
  assert.match(fromFile.out, /DATABASE_URL is not set/, 'no .env file is read');
});

test('the rehearsal-preparation tool will not apply everything, and its local self-check builds production’s state before 0010', () => {
  const everything = run('db/prepare-rehearsal.mts', ['--local', '--through', ALL.at(-1)!.tag.slice(0, 4)]);
  assert.equal(everything.code, 1);
  assert.match(everything.out, /would apply every migration/);
  assert.equal(run('db/prepare-rehearsal.mts', ['--local', '--through', '9999']).code, 1);

  const dry = run('db/prepare-rehearsal.mts', ['--local']);
  assert.equal(dry.code, 0, dry.out.slice(-300));
  assert.match(dry.out, new RegExp(`Would apply 10 of ${ALL.length} migrations.*Dry run — nothing was changed`, 's'));

  const done = run('db/prepare-rehearsal.mts', ['--local', '--confirm']);
  assert.equal(done.code, 0, done.out.slice(-300));
  assert.match(done.out, /Done: 10 migrations applied and recorded/);
  assert.ok(done.out.includes(`Left for the atomic runner: ${ALL.slice(10).map((m) => m.tag).join(', ')}`));
});

// ─── Errors that escape: one scrubbed line, never Node's dump of the error object ──────────────────────

const MALFORMED = `postgres://app_user:${PASSWORD}@[bad-host/neondb`;
/** A well-formed URL to this machine's own closed port: the tool tries to connect, is refused at once, and nothing leaves the machine. */
const REFUSED = `postgres://app_user:${PASSWORD}@127.0.0.1:1/neondb?sslmode=require`;
const noDump = (text: string) => {
  assert.ok(!/node:internal|\n\s+at |input:|code: '/.test(text), `no Node error dump: ${text.slice(0, 300)}`);
  assert.ok(text.trim().split(/\r?\n/).length <= 6, `a few short lines, not a dump: ${text.slice(0, 300)}`);
};

test('a malformed DATABASE_URL is refused without printing it — in all three tools', () => {
  const cases: [string, string[], boolean][] = [
    ['db/migrate-atomic.mts', ['--expect-host', 'x'], false],
    ['db/prepare-rehearsal.mts', ['--expect-host', 'x', '--non-production'], false],
    ['scripts/rehearse-payments.mts', ['--expect-host', 'x', '--non-production'], true],
  ];
  for (const [script, args, viaTsx] of cases) {
    const r = run(script, args, { DATABASE_URL: MALFORMED }, ROOT, viaTsx);
    assert.equal(r.code, 1, script);
    assert.match(r.out, /could not be read as a URL/, script);
    noSecrets(r.out);
    assert.ok(!r.out.includes('bad-host'), `${script}: not even a piece of it`);
    noDump(r.out);
  }
});

test('an error that escapes after the gates prints one scrubbed line and exits 1 — in all three tools', () => {
  const cases: [string, string[], boolean][] = [
    ['db/migrate-atomic.mts', ['--expect-host', '127.0.0.1'], false],
    ['db/prepare-rehearsal.mts', ['--expect-host', '127.0.0.1', '--non-production'], false],
    ['scripts/rehearse-payments.mts', ['--expect-host', '127.0.0.1', '--non-production'], true],
  ];
  for (const [script, args, viaTsx] of cases) {
    const r = run(script, args, { DATABASE_URL: REFUSED }, ROOT, viaTsx);
    assert.equal(r.code, 1, `${script}: ${r.out.slice(0, 300)}`);
    assert.match(r.out, /(Error|Failed query)/, `${script} says what failed`);
    noSecrets(r.out);
    noDump(r.out);
  }
});

test('--expect-host is read only from its own flag: a host given as a bare first argument, or a flag with no value, does not pass', () => {
  for (const [script, viaTsx] of [['db/migrate-atomic.mts', false], ['db/prepare-rehearsal.mts', false], ['scripts/rehearse-payments.mts', true]] as const) {
    for (const args of [['127.0.0.1', '--non-production'], ['--expect-host', '--non-production'], ['--expect-host']]) {
      const r = run(script, args, { DATABASE_URL: REFUSED }, ROOT, viaTsx);
      assert.equal(r.code, 1, `${script} ${args.join(' ')}`);
      assert.match(r.out, /--expect-host is missing or does not match/, `${script} ${args.join(' ')}`);
      assert.ok(!r.out.includes('127.0.0.1'), `${script}: the host is not echoed back`);
      assert.ok(!/Mode: Neon|Target:/.test(r.out), `${script}: it never got as far as a target`);
      noSecrets(r.out);
    }
  }
});

// ─── The payments rehearsal: rounds, overlap reporting, and failing on an unexpected error ───────────

test('a clean local run repeats every scenario each round and reports attempts and overlap without claiming a race', () => {
  const r = run('scripts/rehearse-payments.mts', ['--local', '--rounds', '2'], {}, ROOT, true);
  assert.equal(r.code, 0, r.out.slice(-500));
  assert.match(r.out, /Rounds per scenario: 2/);
  assert.match(r.out, /PASS  20 payments racing for an invoice that takes 10: exactly 10 accepted, 10 refused as "exceeds" — 2\/2/);
  assert.match(r.out, /Overlap  20 payments racing.*2 rounds, 40 requests; every request in flight together in \d of 2 rounds \(measured in this process\)/);
  assert.match(r.out, /Attempts: 72 requests released together across 2 round\(s\)/, '2 rounds × (20 + 10 + 2 + 2 + 2) requests');
  assert.ok(!/a race occurred|raced successfully/.test(r.out));
});

test('an unexpected error fails the run EVEN THOUGH every total reconciles — for a real database error, a deadlock-shaped one, and a refused payment', () => {
  for (const fault of ['database-error', 'deadlock-code', 'refused-payment']) {
    const r = run('scripts/rehearse-payments.mts', ['--local', '--rounds', '1', '--inject-fault', fault], {}, ROOT, true);
    assert.equal(r.code, 1, `${fault}: the run fails`);
    assert.match(r.out, /UNEXPECTED  20 payments racing for an invoice that takes 10 \(round 1\)/, fault);
    assert.match(r.out, /FAIL  no unexpected errors/, fault);
    // …while the money is all fine: the failure is purely about the unexpected error.
    assert.match(r.out, /PASS  final sweep: every invoice reconciles with its ledger/, `${fault}: totals reconcile`);
    assert.match(r.out, /PASS  audit trail: one entry per payment recorded and per payment voided/, fault);
    assert.match(r.out, /PASS  20 payments racing for an invoice that takes 10: ledger invariants/, fault);
    assert.match(r.out, /PASS  20 payments racing for an invoice that takes 10: exactly 10 accepted, 10 refused as "exceeds"/, `${fault}: the 20 real payments still came out right`);
  }
  const database = run('scripts/rehearse-payments.mts', ['--local', '--rounds', '1', '--inject-fault', 'database-error'], {}, ROOT, true);
  assert.match(database.out, /division by zero/, 'the database-error fault is a REAL Postgres error, not a made-up one');
  const refused = run('scripts/rehearse-payments.mts', ['--local', '--rounds', '1', '--inject-fault', 'refused-payment'], {}, ROOT, true);
  assert.match(refused.out, /refused as "date"/, 'the refused-payment fault is a REAL refusal from the ledger');
});

test('--rounds and --inject-fault are validated, and a fault can never be injected into a real database run', () => {
  for (const bad of ['0', '201', 'abc', '1.5', '-1', '']) {
    const r = run('scripts/rehearse-payments.mts', ['--local', '--rounds', bad], {}, ROOT, true);
    assert.equal(r.code, 1, `--rounds ${JSON.stringify(bad)}`);
    assert.match(r.out, /--rounds must be a whole number from 1 to 200/);
  }
  assert.equal(run('scripts/rehearse-payments.mts', ['--local', '--inject-fault', 'nonsense'], {}, ROOT, true).code, 1);
  assert.equal(run('scripts/rehearse-payments.mts', ['--local', '--inject-fault'], {}, ROOT, true).code, 1);
  const real = run('scripts/rehearse-payments.mts', ['--expect-host', '127.0.0.1', '--non-production', '--inject-fault', 'database-error'], { DATABASE_URL: REFUSED }, ROOT, true);
  assert.equal(real.code, 1);
  assert.match(real.out, /--inject-fault is only for --local self-checks/);
  assert.ok(!/Mode: Neon/.test(real.out), 'refused before it got as far as a target');
});

// ─── npm run db:host: the host, never a piece of the password ──────────────────────────────────────

test('db:host prints only the host — even for a password full of special characters — and never part of a password', () => {
  const encoded = run('db/print-host.mts', [], { DATABASE_URL: 'postgres://app_user:P%40ss%23w%2Frd%3F@ep-demo-123-pooler.region.aws.example.test:5432/neondb?sslmode=require' });
  assert.equal(encoded.code, 0);
  assert.equal(encoded.out.trim(), 'ep-demo-123-pooler.region.aws.example.test');

  assert.equal(run('db/print-host.mts', [], { DATABASE_URL: 'postgres://u:p@ss@db.example.test/db' }).out.trim(), 'db.example.test', 'a raw @ in the password is fine: the last @ ends the credentials');

  // A raw # / ? / / splits the URL early; what is left is a piece of the password and must not be printed.
  for (const raw of ['postgres://u:pa#ss@db.example.test/db', 'postgres://u:pa?ss@db.example.test/db', 'postgres://u:pa/ss@db.example.test/db', `postgres://u:${PASSWORD}@[bad/db`]) {
    const r = run('db/print-host.mts', [], { DATABASE_URL: raw });
    assert.equal(r.code, 1, raw);
    assert.equal(r.out.trim(), 'unreadable', raw);
    assert.ok(!r.out.includes('pa') || r.out.trim() === 'unreadable');
  }
  assert.equal(run('db/print-host.mts', []).out.trim(), 'unset');
  const dir = mkdtempSync(join(tmpdir(), 'kk-env-'));
  temp.push(dir);
  writeFileSync(join(dir, '.env.local'), `DATABASE_URL=${URL_WITH_SECRET}\n`);
  assert.equal(run('db/print-host.mts', [], {}, dir).out.trim(), 'unset', 'no .env file is read');
});

// ─── Exiting: never process.exit() in a tool that may have used the network ─────────────────────────

test('no tool that can talk to a database calls process.exit() — on Windows it can crash on the Neon driver’s closing sockets', () => {
  // Found on the first real Neon run: a correct "rolled back" message was followed by a libuv assertion and a garbage
  // exit code (3221226505) instead of 1, because the tool exited while fetch keep-alive sockets were still closing.
  // db/link-status.mts documents the same hazard. Tools set process.exitCode, or throw StopRun, and let the loop drain.
  for (const file of ['db/migrate-atomic.mts', 'db/prepare-rehearsal.mts', 'db/atomic-cli.ts', 'db/prepare-cli.ts', 'scripts/rehearse-payments.mts']) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    const code = source.split(/\r?\n/).filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).map((line) => line.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!/process\.exit\(/.test(code), `${file} does not call process.exit()`);
  }
  // The one backstop in the shared handler is an unref'd timer that only matters if something never lets go.
  const shared = readFileSync(resolve(ROOT, 'db/atomic-migration.ts'), 'utf8');
  assert.match(shared, /setTimeout\(\(\) => process\.exit\(1\), 5_000\)\.unref\(\)/);
});

test('a refusal still ends the process with exit code 1 and no extra output — the tools stop by StopRun/exitCode, not process.exit()', () => {
  for (const [script, args, viaTsx] of [
    ['db/migrate-atomic.mts', ['--expect-host', 'x'], false],
    ['db/prepare-rehearsal.mts', ['--expect-host', 'x', '--non-production'], false],
    ['scripts/rehearse-payments.mts', ['--expect-host', 'x', '--non-production'], true],
    ['scripts/rehearse-payments.mts', ['--local', '--rounds', '0'], true],
  ] as const) {
    const r = run(script, [...args], {}, ROOT, viaTsx);
    assert.equal(r.code, 1, `${script} ${args.join(' ')}`);
    assert.ok(r.out.trim().split(/\r?\n/).length <= 2, `one short line, no stack trace: ${r.out.slice(0, 200)}`);
    assert.ok(!/StopRun|at |node:internal/.test(r.out), `${script}: StopRun is never shown to the operator`);
  }
});
