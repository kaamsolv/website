/**
 * The rehearsal guards (db/rehearsal-guard.ts): the whole-database emptiness check that stops the rehearsal from
 * running on anything holding application data — including data a "no users" check would miss — and the classifier
 * that decides which errors a concurrency scenario may legitimately see.
 *
 * Errors in these tests come from real PGlite/Postgres wherever possible. The few built by hand are labelled SYNTHETIC.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import {
  JOURNAL_TABLE_NAME,
  SEED_TABLES,
  classifyRehearsalError,
  listTables,
  qualified,
  refusalIfNotBrandNew,
  refusalIfNotEmpty,
  tablesWithData,
  type Query,
} from '../db/rehearsal-guard.ts';

let db: Db;
let close: () => Promise<void>;
const query: Query = async (text) => ((await db.execute(sql.raw(text))) as unknown as { rows: Record<string, unknown>[] }).rows;

before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

test('a freshly migrated database is empty: the seeded plans and the migration journal exist, and do not count', async () => {
  const names = (await listTables(query)).map(qualified);
  for (const t of ['public.auth_users', 'public.links', 'public.click_events', 'public.invoices', 'public.invoice_payments', 'public.qr_codes', 'public.plans', 'public.plan_features', JOURNAL_TABLE_NAME]) assert.ok(names.includes(t), t);
  assert.ok(((await query(`select count(*)::int as n from plan_features`))[0].n as number) > 0, 'the migrations did seed plan rows');
  assert.ok(((await query(`select count(*)::int as n from drizzle.__drizzle_migrations`))[0].n as number) > 0, 'and the journal has rows');
  assert.deepEqual(await tablesWithData(query), []);
  assert.equal(await refusalIfNotEmpty(query), null);
  assert.deepEqual([...SEED_TABLES].sort(), ['public.plan_features', 'public.plans']);
});

test('data a "no users" check would miss is caught: an anonymous short link alone makes the database not empty', async () => {
  assert.equal((await query(`select count(*)::int as n from auth_users`))[0].n, 0, 'there are no users at all');
  await db.execute(sql`insert into links (short_code, destination) values ('abc1234', 'https://example.test/private-looking-page')`);
  assert.deepEqual(await tablesWithData(query), [{ table: 'public.links', rows: 1 }]);
  const refusal = await refusalIfNotEmpty(query);
  assert.ok(refusal);
  assert.match(refusal, /public\.links: 1/);
  assert.match(refusal, /never on a copy of real data/);
  assert.ok(!refusal.includes('private-looking-page') && !refusal.includes('abc1234'), 'counts only — never the contents');
  await db.execute(sql`delete from links`);
  assert.equal(await refusalIfNotEmpty(query), null);
});

/** A value of the right type for any column the schema has; unknown types fail loudly so a new one can't be skipped. */
function sampleValue(col: { data_type: string; udt_name: string; udt_schema: string }): string {
  switch (col.data_type) {
    case 'uuid':
      return 'gen_random_uuid()';
    case 'text':
    case 'character varying':
    case 'character':
      return `'x'`;
    case 'integer':
    case 'smallint':
    case 'bigint':
    case 'numeric':
    case 'double precision':
    case 'real':
      return '1';
    case 'boolean':
      return 'false';
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return 'now()';
    case 'date':
      return 'current_date';
    case 'jsonb':
    case 'json':
      return `'{}'`;
    case 'inet':
      return `'127.0.0.1'`;
    case 'ARRAY':
      return `'{}'`;
    case 'USER-DEFINED':
      return `(select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace where t.typname = '${col.udt_name}' and n.nspname = '${col.udt_schema}' order by e.enumsortorder limit 1)::"${col.udt_schema}"."${col.udt_name}"`;
    default:
      throw new Error(`test needs a sample value for column type "${col.data_type}" (${col.udt_name}) — add it so the table is still covered`);
  }
}

test('EVERY table the schema has is covered by the check — one row in any of them is found, and a table added later cannot escape', async () => {
  const tables = (await listTables(query)).filter((t) => !SEED_TABLES.includes(qualified(t)) && qualified(t) !== JOURNAL_TABLE_NAME);
  assert.ok(tables.length >= 17, `the application's tables were found (${tables.length})`);
  const covered: string[] = [];
  await db.execute(sql.raw('begin'));
  try {
    // Foreign keys and triggers off for this transaction only, so each table can be given one row on its own;
    // check constraints dropped so a sample value never trips a business rule. Everything is rolled back below.
    await db.execute(sql.raw(`set local session_replication_role = replica`));
    for (const t of tables) {
      const ref = `"${t.schema}"."${t.name}"`;
      for (const c of await query(`select conname from pg_constraint where conrelid = '${ref}'::regclass and contype = 'c'`)) await db.execute(sql.raw(`alter table ${ref} drop constraint "${String(c.conname)}"`));
      const cols = await query(
        `select column_name, data_type, udt_name, udt_schema from information_schema.columns
          where table_schema = '${t.schema}' and table_name = '${t.name}' and is_generated = 'NEVER' and coalesce(is_identity, 'NO') = 'NO' order by ordinal_position`,
      );
      const values = cols.map((c) => sampleValue(c as { data_type: string; udt_name: string; udt_schema: string }));
      await db.execute(sql.raw(`insert into ${ref} (${cols.map((c) => `"${String(c.column_name)}"`).join(', ')}) values (${values.join(', ')})`));
      const found = (await tablesWithData(query)).find((u) => u.table === qualified(t));
      assert.ok(found && found.rows === 1, `one row in ${qualified(t)} is found`);
      assert.match((await refusalIfNotEmpty(query)) ?? '', new RegExp(qualified(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${qualified(t)} is named in the refusal`);
      covered.push(qualified(t));
      await db.execute(sql.raw(`delete from ${ref}`));
    }
  } finally {
    await db.execute(sql.raw('rollback'));
  }
  assert.equal(covered.length, tables.length, 'every one of them was exercised');
  assert.equal(await refusalIfNotEmpty(query), null, 'rolled back: the database is empty again');
});

test('the check covers every non-system schema, not just public — and quotes any name safely', async () => {
  await db.execute(sql.raw(`create schema "Odd Schema"`));
  await db.execute(sql.raw(`create table "Odd Schema"."Odd ""Name" (id int)`));
  await db.execute(sql.raw(`create schema extra`));
  await db.execute(sql.raw(`create table extra.notes (id int)`));
  try {
    assert.deepEqual(await tablesWithData(query), [], 'empty tables elsewhere do not matter');
    await db.execute(sql.raw(`insert into "Odd Schema"."Odd ""Name" values (1), (2)`));
    await db.execute(sql.raw(`insert into extra.notes values (1)`));
    const used = await tablesWithData(query);
    assert.deepEqual(used.map((u) => [u.table, u.rows]).sort(), [['Odd Schema.Odd "Name', 2], ['extra.notes', 1]]);
    assert.match((await refusalIfNotEmpty(query)) ?? '', /extra\.notes: 1/);
  } finally {
    await db.execute(sql.raw(`drop schema "Odd Schema" cascade`));
    await db.execute(sql.raw(`drop schema extra cascade`));
  }
  assert.equal(await refusalIfNotEmpty(query), null);
});

test('"brand new" means no table anywhere except an empty migration journal — production, and a half-prepared database, are refused', async () => {
  // This database is migrated (like production): refused.
  const migrated = await refusalIfNotBrandNew(query);
  assert.ok(migrated);
  assert.match(migrated, /not a brand-new database/);
  assert.match(migrated, /Production looks like this/);

  const fresh = new PGlite();
  const freshQuery: Query = async (text) => (await fresh.query<Record<string, unknown>>(text)).rows;
  try {
    assert.equal(await refusalIfNotBrandNew(freshQuery), null, 'a new database');
    await fresh.exec(`create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
    assert.equal(await refusalIfNotBrandNew(freshQuery), null, 'an EMPTY journal alone is still brand new');
    await fresh.exec(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('h', 1)`);
    assert.match((await refusalIfNotBrandNew(freshQuery)) ?? '', /1 migration\(s\) recorded/);
    await fresh.exec(`delete from drizzle.__drizzle_migrations; create table public.leftover (id int)`);
    assert.match((await refusalIfNotBrandNew(freshQuery)) ?? '', /public\.leftover/);
    await fresh.exec(`drop table public.leftover; create schema other; create table other.t (id int)`);
    assert.match((await refusalIfNotBrandNew(freshQuery)) ?? '', /other\.t/, 'a table in another schema counts');
  } finally {
    await fresh.close();
  }
});

test('the table list does not depend on what the connecting role may see (the old information_schema query did)', async () => {
  await db.execute(sql.raw(`create role limited_viewer`));
  try {
    await db.execute(sql.raw(`set role limited_viewer`));
    // What the first version of the check used: a role with no privileges sees NO tables, so a populated database would look empty.
    assert.deepEqual(await query(`select table_name from information_schema.tables where table_schema = 'public'`), [], 'information_schema hides them from this role');
    const names = (await listTables(query)).map(qualified);
    for (const t of ['public.auth_users', 'public.links', 'public.invoices', 'public.invoice_payments', 'public.plans']) assert.ok(names.includes(t), `${t} is listed`);
    // And since this role can't read them, emptiness can't be proved — so it fails closed instead of reporting "empty".
    const used = await tablesWithData(query);
    assert.ok(used.length > 0 && used.every((u) => u.rows === -1), 'every unreadable table is reported as unverifiable');
    const refusal = await refusalIfNotEmpty(query);
    assert.ok(refusal);
    assert.match(refusal, /cannot be verified/);
  } finally {
    await db.execute(sql.raw(`reset role`));
    await db.execute(sql.raw(`drop role limited_viewer`));
  }
  assert.equal(await refusalIfNotEmpty(query), null, 'back as the owner, the empty database is empty again');
});

test('a table with row-level security is never assumed empty (count(*) may not see its rows)', async () => {
  await db.execute(sql.raw(`alter table links enable row level security`));
  try {
    assert.deepEqual(await tablesWithData(query), [{ table: 'public.links', rows: -1 }]);
    assert.match((await refusalIfNotEmpty(query)) ?? '', /public\.links: cannot be verified/);
  } finally {
    await db.execute(sql.raw(`alter table links disable row level security`));
  }
  assert.deepEqual(await tablesWithData(query), []);
});

test('rehearsal errors: the ledger’s own refusals are expected, database give-ups and surprises are not', async () => {
  // A REAL ledger refusal, from the real trigger: a payment larger than the invoice, made directly in SQL.
  await db.execute(sql`insert into auth_users (name, email, email_verified) values ('g', 'g@example.test', true)`);
  const [{ id: user }] = ((await db.execute(sql`select id from auth_users limit 1`)) as unknown as { rows: { id: string }[] }).rows;
  const [{ id: invoice }] = ((await db.execute(sql`insert into invoices (user_id, number, client_name, currency, total, kind, data) values (${user}::uuid, 'E-1', 'c', 'INR', 100, 'invoice', '{}'::jsonb) returning id`)) as unknown as { rows: { id: string }[] }).rows;
  let real: unknown;
  try {
    await db.execute(sql`insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key) values (${user}::uuid, ${invoice}::uuid, 500, 'INR', current_date, 'bank', gen_random_uuid())`);
  } catch (e) {
    real = e;
  }
  assert.ok(real, 'the ledger refused the overpayment');
  assert.deepEqual(classifyRehearsalError(real, ['payment_exceeds']), { expected: true, label: 'payment_exceeds' }, 'a real, drizzle-wrapped ledger error is recognised through its cause chain');
  assert.equal(classifyRehearsalError(real, []).expected, false, 'but not when the scenario does not allow it');
  // A REAL database error that is never expected: division by zero.
  let zero: unknown;
  try {
    await db.execute(sql`select 1 / 0`);
  } catch (e) {
    zero = e;
  }
  assert.equal(classifyRehearsalError(zero, ['payment_exceeds']).expected, false);
  await db.execute(sql`delete from auth_users`);

  // SYNTHETIC: PGlite cannot deadlock or time out another session, so these error shapes are built by hand.
  const deadlock = Object.assign(new Error('deadlock detected: payment_exceeds'), { code: '40P01' });
  const wrapped = Object.assign(new Error('Failed query: …'), { cause: deadlock });
  const verdict = classifyRehearsalError(wrapped, ['payment_exceeds']);
  assert.equal(verdict.expected, false, 'a deadlock is never expected, even when the message also names an allowed rule');
  assert.match(verdict.label, /deadlock detected \[40P01\]/);
  assert.equal(classifyRehearsalError(Object.assign(new Error('could not serialize'), { code: '40001' }), ['payment_exceeds']).expected, false);
  assert.equal(classifyRehearsalError(Object.assign(new Error('canceling statement'), { code: '57014' }), ['payment_exceeds']).expected, false);
  assert.equal(classifyRehearsalError(Object.assign(new Error('could not obtain lock'), { code: '55P03' }), ['payment_exceeds']).expected, false);
  assert.equal(classifyRehearsalError(new Error('connection reset'), ['payment_exceeds']).expected, false);
  assert.equal(classifyRehearsalError(new Error('invoice_has_payments'), ['payment_exceeds']).expected, false);
  assert.equal(classifyRehearsalError('a plain string', []).expected, false);
});
