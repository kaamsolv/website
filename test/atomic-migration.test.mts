/**
 * The atomic migration runner (db/atomic-migration.ts), tested on PGlite against the real migration files:
 * it produces exactly the database drizzle's own migrator does, drizzle treats the result as up to date, a failure
 * part-way through migration 0010 changes nothing (unlike the statement-by-statement way the Neon HTTP migrator
 * works, shown here for contrast), and a database in an unexpected state is refused rather than built on.
 *
 * This proves the logic and the compatibility. It is not a run against Neon: the Neon driver call
 * (`sql.transaction`) is a thin adapter that docs/infra/deployment.md says to rehearse on a non-production branch.
 */

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createHash } from 'node:crypto';
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  LOCK_TIMEOUT_RANGE_MS,
  STATEMENT_TIMEOUT_RANGE_MS,
  applyAtomically,
  buildTransaction,
  classifyFailure,
  describePlan,
  FAILURE_ADVICE,
  failureHint,
  loadMigrations,
  migrationsThrough,
  planPending,
  writeMigrationSubset,
  type Journal,
  type Migration,
  type Statement,
} from '../db/atomic-migration.ts';

const FULL = resolve(import.meta.dirname, '../db/migrations');
const temp: string[] = [];
after(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A copy of the migrations folder holding only the first `n` journal entries (what production has before 0010). */
function folderWithFirst(n: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'kk-mig-'));
  temp.push(dir);
  mkdirSync(join(dir, 'meta'));
  const journal = JSON.parse(readFileSync(join(FULL, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  const keep = journal.entries.slice(0, n);
  for (const e of keep) cpSync(join(FULL, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: keep }));
  return dir;
}

const all = loadMigrations(FULL);
const BEFORE_0010 = all.findIndex((m) => m.tag.startsWith('0010_'));
assert.ok(BEFORE_0010 > 0, '0010 is in the journal');

async function dbAt(n: number): Promise<PGlite> {
  const pg = new PGlite();
  await migrate(drizzle(pg), { migrationsFolder: folderWithFirst(n) });
  return pg;
}
const rowsOf = async (pg: PGlite, text: string) => (await pg.query<Record<string, unknown>>(text)).rows;

/** Everything a migration can create, as comparable text. */
async function fingerprint(pg: PGlite): Promise<string[]> {
  const one = async (label: string, text: string) => (await rowsOf(pg, text)).map((r) => `${label}: ${Object.values(r).join(' | ')}`);
  return [
    ...(await one('column', `select table_name, column_name, data_type, is_nullable, coalesce(column_default,'') from information_schema.columns where table_schema = 'public' order by 1, 2`)),
    ...(await one('constraint', `select conrelid::regclass::text, conname, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`)),
    ...(await one('index', `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`)),
    ...(await one('function', `select proname, md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace order by 1`)),
    ...(await one('trigger', `select tgrelid::regclass::text, tgname, tgenabled from pg_trigger where not tgisinternal order by 1, 2`)),
    ...(await one('seed', `select plan_key, feature_key, coalesce(limit_value::text,'') from plan_features order by 1, 2`)),
  ];
}
const journalOf = async (pg: PGlite): Promise<Journal> =>
  (await rowsOf(pg, `select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by created_at`)).map((r) => ({ hash: String(r.hash), createdAt: Number(r.created_at) }));

const runner = (pg: PGlite) => async (statements: Statement[]) => {
  await pg.transaction(async (tx) => {
    for (const s of statements) await tx.query(s.text, s.params ?? []);
  });
};

test('loads the migrations the way drizzle does, with their tags and statements', () => {
  assert.equal(all[BEFORE_0010].tag, '0010_invoice_payments');
  assert.ok(all[BEFORE_0010].statements.length > 20, 'the 0010 file is many statements — which is the point');
  assert.ok(all.every((m) => m.hash.length === 64 && m.statements.length > 0));
  assert.ok(all.every((m, i) => i === 0 || m.folderMillis > all[i - 1].folderMillis), 'journal times strictly increase');
});

test('planning: a database before 0010 has exactly one pending migration; a fresh one has all; the journal must match this checkout', () => {
  const upTo = (n: number): Journal => all.slice(0, n).map((m) => ({ hash: m.hash, createdAt: m.folderMillis }));
  const before = planPending(all, upTo(BEFORE_0010));
  assert.ok(before.ok && before.pending.length === all.length - BEFORE_0010 && before.pending[0].tag === '0010_invoice_payments');
  const fresh = planPending(all, []);
  assert.ok(fresh.ok && fresh.pending.length === all.length);
  const done = planPending(all, upTo(all.length));
  assert.ok(done.ok && done.pending.length === 0);

  // A database that is ahead of, or different from, this checkout is refused — nothing is built on an unknown state.
  const ahead = planPending(all.slice(0, BEFORE_0010), upTo(all.length));
  assert.equal(ahead.ok, false);
  const edited = upTo(BEFORE_0010);
  edited[3] = { ...edited[3], hash: 'f'.repeat(64) };
  const drift = planPending(all, edited);
  assert.equal(drift.ok, false);
  if (!drift.ok) assert.match(drift.reason, /different content/);
  const reordered = upTo(BEFORE_0010);
  reordered[2] = { ...reordered[2], createdAt: reordered[2].createdAt + 1 };
  assert.equal(planPending(all, reordered).ok, false);
});

test('the transaction is the schema statements then the journal row — one per migration, in order, nothing else', () => {
  const pending = all.slice(BEFORE_0010);
  const tx = buildTransaction(pending);
  const journalInserts = tx.filter((s) => s.text.startsWith('insert into "drizzle"."__drizzle_migrations"'));
  assert.equal(journalInserts.length, pending.length);
  assert.deepEqual(journalInserts[0].params, [pending[0].hash, pending[0].folderMillis]);
  // The 0010 journal row comes right after the last 0010 statement, before the next migration's.
  const idx = tx.indexOf(journalInserts[0]);
  assert.equal(tx[idx - 1].text, pending[0].statements.at(-1));
  // Fixed preamble: two SET LOCAL timeouts, the advisory lock, then the journal schema and table (see the timeout tests below).
  assert.ok(tx[0].text.startsWith('SET LOCAL lock_timeout') && tx[1].text.startsWith('SET LOCAL statement_timeout'));
  assert.ok(tx[2].text.includes('pg_advisory_xact_lock'));
  assert.ok(tx[3].text.startsWith('CREATE SCHEMA IF NOT EXISTS') && tx[4].text.startsWith('CREATE TABLE IF NOT EXISTS'));
  assert.equal(tx.length, 5 + pending.reduce((n, m) => n + m.statements.length + 1, 0), 'without a journal-state guard: 5 fixed statements, then each migration and its journal row');
  assert.equal(buildTransaction(pending, { expectedApplied: BEFORE_0010 }).length, tx.length + 1, 'the journal-state guard adds exactly one statement');
  // The printable plan shows statement kinds, never parameter values.
  const text = describePlan(pending).join('\n');
  assert.match(text, /0010_invoice_payments: \d+ statements/);
  assert.doesNotMatch(text, new RegExp(pending[0].hash));
});

test('applying 0010 atomically gives exactly the database drizzle’s own migrator builds, and drizzle then sees it as up to date', async () => {
  const atomic = await dbAt(BEFORE_0010);
  assert.equal((await journalOf(atomic)).length, BEFORE_0010);
  const plan = planPending(all, await journalOf(atomic));
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const done = await applyAtomically(plan.pending, runner(atomic));
  assert.deepEqual(done.applied, plan.pending.map((m) => m.tag));

  const reference = await dbAt(all.length);
  assert.deepEqual(await fingerprint(atomic), await fingerprint(reference), 'same tables, columns, constraints, indexes, functions, triggers and seed');
  assert.deepEqual(await journalOf(atomic), await journalOf(reference), 'same journal rows (hash and time)');

  // `npm run db:migrate` on the same database now has nothing to do.
  await migrate(drizzle(atomic), { migrationsFolder: FULL });
  assert.equal((await journalOf(atomic)).length, all.length);
  // And the atomic runner on an up-to-date database is a no-op.
  const again = planPending(all, await journalOf(atomic));
  assert.ok(again.ok && again.pending.length === 0);
  assert.deepEqual((await applyAtomically(again.ok ? again.pending : [], runner(atomic))).applied, []);
  await atomic.close();
  await reference.close();
});

/** 0010 with a statement that fails after the tables, functions and part of the triggers already exist. */
function withFailureAt(statementNumber: number): Migration[] {
  const pending = all.slice(BEFORE_0010).map((m) => ({ ...m, statements: [...m.statements] }));
  pending[0].statements.splice(statementNumber, 0, 'select 1 / 0');
  return pending;
}

test('a failure part-way through 0010 changes nothing: no tables, no functions, no triggers, no journal row — and a clean re-run then succeeds', async () => {
  const pg = await dbAt(BEFORE_0010);
  const beforeFingerprint = await fingerprint(pg);
  const beforeJournal = await journalOf(pg);

  for (const at of [2, 12, 22, all[BEFORE_0010].statements.length - 2]) {
    await assert.rejects(applyAtomically(withFailureAt(at), runner(pg)), /division by zero/, `failure injected before statement ${at}`);
    assert.deepEqual(await fingerprint(pg), beforeFingerprint, `nothing left behind (failure at ${at})`);
    assert.deepEqual(await journalOf(pg), beforeJournal, 'no journal row');
    assert.equal((await rowsOf(pg, `select to_regclass('public.invoice_payments') is not null as there`))[0].there, false);
  }

  const plan = planPending(all, await journalOf(pg));
  assert.ok(plan.ok);
  await applyAtomically(plan.ok ? plan.pending : [], runner(pg));
  assert.equal((await journalOf(pg)).length, all.length);
  assert.equal((await rowsOf(pg, `select to_regclass('public.invoice_payments') is not null as there`))[0].there, true);
  await pg.close();
});

test('for contrast: statement by statement (how the Neon HTTP migrator works) the same failure leaves a half-applied schema that a re-run cannot get past', async () => {
  const pg = await dbAt(BEFORE_0010);
  const pending = withFailureAt(22);
  const statements = buildTransaction(pending);
  // Each statement committed on its own, the journal row only at the end — as drizzle-orm/neon-http/migrator does.
  const failed = async () => {
    for (const s of statements) await pg.query(s.text, s.params ?? []);
  };
  await assert.rejects(failed(), /division by zero/);
  assert.equal((await rowsOf(pg, `select to_regclass('public.invoice_payments') is not null as there`))[0].there, true, 'tables from the first half are still there');
  assert.equal((await journalOf(pg)).length, BEFORE_0010, 'but no journal row was written');
  // A re-run now fails on the first CREATE TABLE, so the migration can never complete without manual cleanup.
  const clean = buildTransaction(all.slice(BEFORE_0010));
  await assert.rejects(async () => {
    for (const s of clean) await pg.query(s.text, s.params ?? []);
  }, /already exists/);
  await pg.close();
});

test('a fresh database (no journal table yet) is built from scratch in one transaction and matches drizzle’s own result', async () => {
  const fresh = new PGlite();
  const plan = planPending(all, []);
  assert.ok(plan.ok);
  await applyAtomically(plan.ok ? plan.pending : [], runner(fresh));
  const reference = await dbAt(all.length);
  assert.deepEqual(await fingerprint(fresh), await fingerprint(reference));
  assert.deepEqual(await journalOf(fresh), await journalOf(reference));
  await fresh.close();
  await reference.close();
});

// ─── Line endings: the same migration must be recognised however it was checked out ───────────────────

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const fileText = (m: Migration) => readFileSync(join(FULL, `${m.tag}.sql`), 'utf8');

test('a journal written from an LF checkout, a CRLF checkout, or this checkout is the same migration — and only line endings are forgiven', () => {
  const lf = (m: Migration) => fileText(m).replace(/\r\n/g, '\n');
  const crlf = (m: Migration) => lf(m).replace(/\n/g, '\r\n');
  const journalWith = (hashOf: (m: Migration) => string): Journal => all.slice(0, BEFORE_0010).map((m) => ({ hash: hashOf(m), createdAt: m.folderMillis }));

  for (const [name, hashOf] of [['LF', (m: Migration) => sha(lf(m))], ['CRLF', (m: Migration) => sha(crlf(m))], ['as checked out', (m: Migration) => m.hash]] as const) {
    const plan = planPending(all, journalWith(hashOf));
    assert.ok(plan.ok, `${name} journal accepted`);
    if (plan.ok) assert.equal(plan.pending[0].tag, '0010_invoice_payments');
  }
  // When the line endings differ, a note says so (nothing alarming, nothing hidden).
  const other = all.slice(0, BEFORE_0010).map((m) => sha(m.hash === sha(lf(m)) ? crlf(m) : lf(m)));
  const noted = planPending(all, all.slice(0, BEFORE_0010).map((m, i) => ({ hash: other[i], createdAt: m.folderMillis })));
  assert.ok(noted.ok && noted.notes.length > 0 && /line endings/.test(noted.notes[0]));

  // Real differences are still refused: other content, or another journal time.
  const edited = journalWith((m) => m.hash);
  edited[4] = { ...edited[4], hash: sha(`${lf(all[4])}\n-- a change nobody reviewed`) };
  const changed = planPending(all, edited);
  assert.equal(changed.ok, false);
  if (!changed.ok) assert.match(changed.reason, /different content.*not just line endings/);
  const retimed = journalWith((m) => m.hash);
  retimed[6] = { ...retimed[6], createdAt: retimed[6].createdAt + 1 };
  const late = planPending(all, retimed);
  assert.equal(late.ok, false);
  if (!late.ok) assert.match(late.reason, /different journal time/);
});

// ─── What a failed transaction tells us ────────────────────────────────────────────────────────────

test('a failure reported by the database means rolled back; anything else means the outcome is unknown', async () => {
  const pg = new PGlite();
  let dbError: unknown;
  try {
    await pg.query('select 1 / 0');
  } catch (e) {
    dbError = e;
  }
  assert.equal(classifyFailure(dbError), 'rolled_back', 'a real Postgres error carries a SQLSTATE');
  await pg.close();

  assert.equal(classifyFailure(Object.assign(new Error('relation already exists'), { code: '42P07' })), 'rolled_back');
  assert.equal(classifyFailure(Object.assign(new Error('x'), { code: 'XX000' })), 'rolled_back');
  assert.equal(classifyFailure(new Error('wrapped', { cause: Object.assign(new Error('inner'), { code: '23505' }) })), 'rolled_back', 'a code on the cause counts');

  // Transport trouble: the server may or may not have committed.
  assert.equal(classifyFailure(new TypeError('fetch failed')), 'unknown');
  assert.equal(classifyFailure(Object.assign(new Error('Error connecting to database: fetch failed'), { sourceError: new Error('socket') })), 'unknown');
  assert.equal(classifyFailure(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), 'unknown');
  assert.equal(classifyFailure(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })), 'unknown', 'five capital letters, but a Node network code, not an SQLSTATE');
  assert.equal(classifyFailure(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), 'unknown');
  assert.equal(classifyFailure(new Error('Server error (HTTP status 504): gateway timeout')), 'unknown');
  assert.equal(classifyFailure('plain string'), 'unknown');
  assert.equal(classifyFailure(undefined), 'unknown');

  // The words shown to the operator never claim a rollback they cannot know about.
  assert.ok(FAILURE_ADVICE.rolled_back.join(' ').includes('rolled back'));
  assert.ok(FAILURE_ADVICE.unknown.join(' ').includes('NOT known'));
  assert.ok(!FAILURE_ADVICE.unknown.join(' ').includes('was rolled back'));
  assert.ok(FAILURE_ADVICE.unknown.join(' ').includes('Do not re-run with --confirm'));
});

// ─── The production-like starting point ────────────────────────────────────────────────────────────

test('a subset of the migrations (what the rehearsal builds first) loads with the same hashes and applies with drizzle’s own migrator', async () => {
  const through = migrationsThrough(all, '0009');
  assert.equal(through.length, BEFORE_0010);
  assert.equal(through.at(-1)!.tag, '0009_qr_campaigns');
  assert.throws(() => migrationsThrough(all, '9999'), /not an exact migration/);

  const dir = mkdtempSync(join(tmpdir(), 'kk-subset-'));
  temp.push(dir);
  writeMigrationSubset(FULL, through.map((m) => m.tag), dir);
  const loaded = loadMigrations(dir);
  assert.deepEqual(loaded.map((m) => [m.tag, m.hash, m.folderMillis]), through.map((m) => [m.tag, m.hash, m.folderMillis]), 'identical to the real ones');
  assert.throws(() => writeMigrationSubset(FULL, ['0009_qr_campaigns', 'no_such_migration'], mkdtempSync(join(tmpdir(), 'kk-subset-'))), /not in the journal/);

  // Built that way, the database is exactly "production before 0010": and the atomic runner then plans the two that follow (0010, 0011).
  const pg = new PGlite();
  await migrate(drizzle(pg), { migrationsFolder: dir });
  const plan = planPending(all, await journalOf(pg));
  assert.ok(plan.ok && plan.pending.map((m) => m.tag).join() === '0010_invoice_payments,0011_billing' && plan.notes.length === 0);
  await applyAtomically(plan.ok ? plan.pending : [], runner(pg));
  assert.equal((await journalOf(pg)).length, all.length);
  await pg.close();
});

// ─── Priority 1: lock and statement timeouts ───────────────────────────────────────────────────────

test('the two timeouts are the first statements of the transaction, before anything that changes the schema', () => {
  const tx = buildTransaction(all.slice(BEFORE_0010));
  assert.equal(tx[0].text, `SET LOCAL lock_timeout = '${DEFAULT_LOCK_TIMEOUT_MS}ms'`);
  assert.equal(tx[1].text, `SET LOCAL statement_timeout = '${DEFAULT_STATEMENT_TIMEOUT_MS}ms'`);
  const firstChange = tx.findIndex((st) => /^\s*(--[^\n]*\n\s*)*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|DO)\b/i.test(st.text));
  assert.equal(tx[firstChange].text.startsWith('CREATE SCHEMA'), true, 'the first statement that changes anything is the journal schema');
  assert.ok(firstChange > 1, 'and both timeouts come before it');
  assert.ok(tx.slice(0, 2).every((st) => st.text.startsWith('SET LOCAL')), 'SET LOCAL, not SET: it ends with the transaction');

  const custom = buildTransaction(all.slice(BEFORE_0010), { lockTimeoutMs: 2_000, statementTimeoutMs: 90_000 });
  assert.deepEqual([custom[0].text, custom[1].text], [`SET LOCAL lock_timeout = '2000ms'`, `SET LOCAL statement_timeout = '90000ms'`]);
});

test('the defaults are inside the range the CLI accepts, and nonsense values are refused rather than turned into "wait forever"', () => {
  assert.ok(DEFAULT_LOCK_TIMEOUT_MS >= LOCK_TIMEOUT_RANGE_MS[0] && DEFAULT_LOCK_TIMEOUT_MS <= LOCK_TIMEOUT_RANGE_MS[1]);
  assert.ok(DEFAULT_STATEMENT_TIMEOUT_MS >= STATEMENT_TIMEOUT_RANGE_MS[0] && DEFAULT_STATEMENT_TIMEOUT_MS <= STATEMENT_TIMEOUT_RANGE_MS[1]);
  assert.ok(DEFAULT_LOCK_TIMEOUT_MS < DEFAULT_STATEMENT_TIMEOUT_MS, 'waiting for a lock is cut off sooner than a statement is allowed to run');
  const pending = all.slice(BEFORE_0010);
  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 3_600_001]) {
    assert.throws(() => buildTransaction(pending, { lockTimeoutMs: bad }), /whole number of milliseconds/, `lock ${bad}`);
    assert.throws(() => buildTransaction(pending, { statementTimeoutMs: bad }), /whole number of milliseconds/, `statement ${bad}`);
  }
  assert.throws(() => buildTransaction(pending, { expectedApplied: -1 }), /expectedApplied/);
  assert.throws(() => buildTransaction(pending, { expectedApplied: 1.5 }), /expectedApplied/);
});

test('SET LOCAL really takes effect inside the transaction and is gone afterwards — on commit and on rollback', async () => {
  const pending = all.slice(BEFORE_0010);
  const pg = await dbAt(BEFORE_0010);
  const show = async (name: string) => String((await pg.query<Record<string, unknown>>(`show ${name}`)).rows[0][name]);
  assert.deepEqual([await show('lock_timeout'), await show('statement_timeout')], ['0', '0'], 'no timeouts to begin with');

  let inside: string[] = [];
  await pg.transaction(async (tx) => {
    for (const st of buildTransaction(pending, { lockTimeoutMs: 1_234, statementTimeoutMs: 56_789, expectedApplied: BEFORE_0010 })) await tx.query(st.text, st.params ?? []);
    inside = [String((await tx.query<Record<string, unknown>>('show lock_timeout')).rows[0].lock_timeout), String((await tx.query<Record<string, unknown>>('show statement_timeout')).rows[0].statement_timeout)];
  });
  assert.deepEqual(inside, ['1234ms', '56789ms'], 'in force while the migration runs');
  assert.deepEqual([await show('lock_timeout'), await show('statement_timeout')], ['0', '0'], 'gone once it committed');

  const failing = pending.map((m) => ({ ...m, statements: ['select 1 / 0', ...m.statements] }));
  await assert.rejects(applyAtomically(failing, runner(pg), { lockTimeoutMs: 1_234 }), /division by zero/);
  assert.deepEqual([await show('lock_timeout'), await show('statement_timeout')], ['0', '0'], 'and gone after a rollback too');
  await pg.close();
});

test('a timeout-shaped failure part-way through rolls the whole migration back — no partial schema, no journal row', async () => {
  // LIMITATION: PGlite does not enforce statement_timeout or lock_timeout (a pg_sleep simply runs to the end, and it has one
  // session, so no lock can ever be contended). So a real cancellation cannot be produced here. What this CAN prove is the
  // rollback: PGlite's own transaction rolls back when the runner fails part-way with an error shaped like the database's
  // timeout report (SYNTHETIC: SQLSTATE 57014 / 55P03, built by hand). That a real timeout fires on Neon is unproven.
  for (const code of ['57014', '55P03'] as const) {
    const pg = await dbAt(BEFORE_0010);
    const before = await fingerprint(pg);
    const beforeJournal = await journalOf(pg);
    const statements = buildTransaction(all.slice(BEFORE_0010), { expectedApplied: BEFORE_0010 });
    const timeout = Object.assign(new Error(code === '57014' ? 'canceling statement due to statement timeout' : 'canceling statement due to lock timeout'), { code });
    let error: unknown;
    try {
      await pg.transaction(async (tx) => {
        for (const [i, st] of statements.entries()) {
          if (i === Math.floor(statements.length / 2)) throw timeout; // half the schema is already built when it "times out"
          await tx.query(st.text, st.params ?? []);
        }
      });
    } catch (e) {
      error = e;
    }
    assert.equal(error, timeout);
    assert.equal(classifyFailure(error), 'rolled_back', `${code}: a database-reported code`);
    assert.match(failureHint(error) ?? '', code === '57014' ? /statement timeout/ : /lock timeout/);
    assert.deepEqual(await fingerprint(pg), before, `${code}: nothing the first half created is left`);
    assert.deepEqual(await journalOf(pg), beforeJournal, `${code}: no journal row`);
    assert.equal((await rowsOf(pg, `select to_regclass('public.invoice_payments') is not null as there`))[0].there, false);
    await pg.close();
  }
});

test('timeouts are "confirmed" only when the database said so: the SQLSTATE is what proves it, and a client-side timeout never carries one', () => {
  // SYNTHETIC: PGlite has one session, so a real lock_timeout (55P03) cannot be produced here.
  assert.equal(classifyFailure(Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' })), 'rolled_back');
  assert.match(failureHint(Object.assign(new Error('x'), { code: '55P03' })) ?? '', /lock timeout/);
  // Ambiguous: no SQLSTATE, so no claim — and no hint, even when the words are right.
  for (const e of [
    new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    new Error('Server error (HTTP status 504): gateway timeout'),
    new Error('canceling statement due to statement timeout'),
    Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
  ]) {
    assert.equal(classifyFailure(e), 'unknown', String((e as Error).message));
    assert.equal(failureHint(e), null);
  }
});

// ─── Simultaneous attempts ───────────────────────────────────────────────────────────────────────

test('a plan that is stale by the time it runs fails cleanly — it can no longer apply a migration twice, even one with nothing to collide with', async () => {
  const pg = await dbAt(BEFORE_0010);
  await pg.exec('create table zz_log (n int)');
  // A data-only migration: no CREATE TABLE to fail with "already exists" the second time.
  const hash = 'd'.repeat(64);
  const dataOnly: Migration = { tag: '9998_data_only', hash, acceptedHashes: [hash], folderMillis: all.at(-1)!.folderMillis + 1_000, statements: ['insert into zz_log values (1)'] };
  const count = async () => Number((await rowsOf(pg, 'select count(*)::int as n from zz_log'))[0].n);

  await applyAtomically([dataOnly], runner(pg), { expectedApplied: BEFORE_0010 }); // operator A
  assert.equal(await count(), 1);
  assert.equal((await journalOf(pg)).length, BEFORE_0010 + 1);

  // Operator B planned from the same journal before A committed, and runs now.
  let error: unknown;
  try {
    await applyAtomically([dataOnly], runner(pg), { expectedApplied: BEFORE_0010 });
  } catch (e) {
    error = e;
  }
  assert.ok(error, 'B is refused');
  assert.match(String((error as Error).message), /migration_state_changed/);
  assert.equal(classifyFailure(error), 'rolled_back', 'a database-reported error (P0001): confirmed rollback');
  assert.match(failureHint(error) ?? '', /changed after the plan was read/);
  assert.equal(await count(), 1, 'the data was NOT inserted a second time');
  assert.equal((await journalOf(pg)).length, BEFORE_0010 + 1, 'and no second journal row');

  // Contrast: without the guard the same stale plan applies twice — the hazard the guard exists for.
  await applyAtomically([dataOnly], runner(pg));
  assert.equal(await count(), 2, 'WITHOUT expectedApplied the data-only migration is applied twice');
  assert.equal((await journalOf(pg)).length, BEFORE_0010 + 2);
  await pg.close();
});

test('the advisory lock and the guard do not get in the way of a normal apply, and the stale real migration is refused before it can hit "already exists"', async () => {
  const pg = await dbAt(BEFORE_0010);
  const plan = planPending(all, await journalOf(pg));
  assert.ok(plan.ok);
  if (!plan.ok) return;
  await applyAtomically(plan.pending, runner(pg), { expectedApplied: plan.applied });
  assert.equal((await journalOf(pg)).length, all.length);
  await assert.rejects(applyAtomically(plan.pending, runner(pg), { expectedApplied: plan.applied }), /migration_state_changed/, 'refused by the guard, not by a CREATE TABLE collision');
  await pg.close();
});

// ─── Exact --through ─────────────────────────────────────────────────────────────────────────────

test('--through must name one migration exactly: its four-digit number or its whole name', () => {
  assert.equal(migrationsThrough(all, '0009').at(-1)!.tag, '0009_qr_campaigns');
  assert.equal(migrationsThrough(all, '0009_qr_campaigns').at(-1)!.tag, '0009_qr_campaigns');
  assert.equal(migrationsThrough(all, '0000').length, 1);
  for (const ambiguous of ['', '0', '00', '000', '9', '09', '0009_', '0009_q', '0009_qr', 'qr_campaigns', ' 0009', '0009 ', '00009', '0010x', '000*']) {
    assert.throws(() => migrationsThrough(all, ambiguous), /not an exact migration/, JSON.stringify(ambiguous));
  }
});
