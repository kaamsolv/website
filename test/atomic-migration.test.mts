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
import {
  applyAtomically,
  buildTransaction,
  describePlan,
  loadMigrations,
  planPending,
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
  if (!drift.ok) assert.match(drift.reason, /doesn't match/);
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
  assert.ok(tx[0].text.startsWith('CREATE SCHEMA IF NOT EXISTS') && tx[1].text.startsWith('CREATE TABLE IF NOT EXISTS'));
  assert.equal(tx.length, 2 + pending.reduce((n, m) => n + m.statements.length + 1, 0));
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
