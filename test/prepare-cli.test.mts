/**
 * `db:rehearsal:prepare` after its safety gates (db/prepare-cli.ts), against a fake driver and — for the real flow —
 * in-memory PGlite with drizzle's own migrator. No Neon, no network. Covers the gates (nothing is contacted when one
 * refuses), exact `--through`, a database that is not brand new, the dry run, applying the right migrations in order,
 * and a migration that fails part-way.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { runPrepareCli, type PrepareDriver } from '../db/prepare-cli.ts';
import { READ_JOURNAL_SQL, loadMigrations } from '../db/atomic-migration.ts';

const FOLDER = resolve(import.meta.dirname, '../db/migrations');
const all = loadMigrations(FOLDER);
const PASSWORD = 'Fake-Pw-98765';
const URL_ = `postgres://app_user:${PASSWORD}@db.example.test/neondb`;
const HOST = 'db.example.test';
const NEON = ['--expect-host', HOST, '--non-production'];

type Harness = { driver: PrepareDriver; connects: (string | null)[]; migratedFolders: string[]; migratedTags: string[][]; pg: () => Promise<PGlite>; close: () => Promise<void> };

/**
 * A real in-memory PGlite behind the driver interface, recording what `migrate` was asked to apply. The database is
 * created only when something first uses it, so a test whose gate refuses never starts one (and has nothing to close).
 */
async function harness(opts: { failMigrationAfter?: boolean; setup?: (pg: PGlite) => Promise<void> } = {}): Promise<Harness> {
  let instance: PGlite | undefined;
  const pg = async () => {
    if (!instance) {
      instance = new PGlite();
      await opts.setup?.(instance);
    }
    return instance;
  };
  const h: Harness = { connects: [], migratedFolders: [], migratedTags: [], pg, close: async () => void (await instance?.close()), driver: undefined as unknown as PrepareDriver };
  h.driver = {
    query: async (text) => (await (await pg()).query<Record<string, unknown>>(text)).rows,
    migrate: async (folder) => {
      h.migratedFolders.push(folder);
      h.migratedTags.push((JSON.parse(readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }).entries.map((e) => e.tag));
      const db = await pg();
      if (opts.failMigrationAfter) {
        await db.exec('create table public.half_migrated (id int)');
        throw new Error(`stopped part-way (test) ${URL_}`);
      }
      await migrate(drizzle(db), { migrationsFolder: folder });
    },
  };
  return h;
}

async function run(args: string[], h: Harness, url: string | null = URL_) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runPrepareCli({
    args,
    databaseUrl: url ?? undefined,
    migrationsFolder: FOLDER,
    connect: async (u) => {
      h.connects.push(u);
      return h.driver;
    },
    io: { out: (l) => out.push(l), err: (l) => err.push(l) },
  });
  const text = `${out.join('\n')}\n${err.join('\n')}`;
  assert.ok(!text.includes(PASSWORD) && !text.includes('app_user') && !text.includes('postgres://'), 'no credentials are ever printed');
  return { code, out: out.join('\n'), err: err.join('\n'), text };
}
const journalCount = async (h: Harness) => ((await (await h.pg()).query(READ_JOURNAL_SQL)).rows.length);

test('every gate refuses before the driver is created, and the refusal does not say what the host is', async () => {
  const cases: [string, string[], string | null][] = [
    ['no DATABASE_URL', ['--expect-host', HOST, '--non-production'], null],
    ['a malformed DATABASE_URL', NEON, `postgres://u:${PASSWORD}@[bad/db`],
    ['no --expect-host', ['--non-production'], URL_],
    ['the host as a bare argument', [HOST, '--non-production'], URL_],
    ['--expect-host with no value', ['--expect-host', '--non-production'], URL_],
    ['the wrong host', ['--expect-host', 'someone-else.example', '--non-production'], URL_],
    ['no --non-production', ['--expect-host', HOST], URL_],
  ];
  for (const [what, args, url] of cases) {
    const h = await harness();
    const r = await run(args, h, url);
    assert.equal(r.code, 1, what);
    assert.equal(h.connects.length, 0, `${what}: the driver was never created`);
    assert.equal(h.migratedFolders.length, 0, `${what}: nothing migrated`);
    if (what.includes('host')) assert.ok(!r.text.includes(HOST), `${what}: the real host is not echoed back`);
    await h.close();
  }
});

test('--through must be exact, and may not apply everything', async () => {
  for (const bad of ['9', '00', '0', '0009_q', '', '9999', 'qr_campaigns']) {
    const h = await harness();
    const r = await run([...NEON, '--through', bad], h);
    assert.equal(r.code, 1, JSON.stringify(bad));
    assert.match(r.err, /not an exact migration/, JSON.stringify(bad));
    assert.equal(h.connects.length, 0, JSON.stringify(bad));
    await h.close();
  }
  for (const everything of ['0010', '0010_invoice_payments']) {
    const h = await harness();
    const r = await run([...NEON, '--through', everything], h);
    assert.equal(r.code, 1, everything);
    assert.match(r.err, /would apply every migration/);
    assert.equal(h.connects.length, 0);
    await h.close();
  }
  const h = await harness();
  const ok = await run([...NEON, '--through', '0005_gst_invoice'], h);
  assert.equal(ok.code, 0, ok.text);
  assert.match(ok.out, /Would apply 6 of 11 migrations/, 'the full name works too');
  await h.close();
});

test('--local needs no URL and no host, and connects to nothing but the in-memory database', async () => {
  const h = await harness();
  const r = await run(['--local'], h, null);
  assert.equal(r.code, 0, r.text);
  assert.deepEqual(h.connects, [null], 'asked for the local database, never a URL');
  await h.close();
});

test('a database that is not brand new is refused and nothing is migrated: production-like, a leftover table, a table in another schema, or a recorded migration', async () => {
  const setups: [string, (pg: PGlite) => Promise<void>, RegExp][] = [
    ['already fully migrated (like production)', async (pg) => void (await migrate(drizzle(pg), { migrationsFolder: FOLDER })), /not a brand-new database/],
    ['a leftover table', (pg) => pg.exec('create table public.leftover (id int)').then(() => undefined), /public\.leftover/],
    ['a table in another schema', (pg) => pg.exec('create schema other; create table other.t (id int)').then(() => undefined), /other\.t/],
    ['a recorded migration', (pg) => pg.exec(`create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint); insert into drizzle.__drizzle_migrations (hash, created_at) values ('h', 1)`).then(() => undefined), /1 migration\(s\) recorded/],
  ];
  for (const [what, setup, expected] of setups) {
    const h = await harness({ setup });
    const r = await run([...NEON, '--confirm'], h);
    assert.equal(r.code, 1, what);
    assert.match(r.err, expected, what);
    assert.equal(h.migratedFolders.length, 0, `${what}: migrate was never called`);
    await h.close();
  }
});

test('the dry run checks the database and describes the plan but migrates nothing', async () => {
  const h = await harness();
  const r = await run(NEON, h);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /Would apply 10 of 11 migrations.*0000_powerful_masque … 0009_qr_campaigns/);
  assert.match(r.out, /Left for the atomic runner: 0010_invoice_payments/);
  assert.match(r.out, /Dry run — nothing was changed/);
  assert.equal(h.migratedFolders.length, 0);
  assert.equal(((await (await h.pg()).query(`select to_regclass('drizzle.__drizzle_migrations') is not null as there`)).rows[0] as { there: boolean }).there, false, 'not even the journal table was created');
  await h.close();
});

test('--confirm applies exactly migrations 0000–0009, in journal order, with drizzle’s migrator — and a second run is then refused', async () => {
  const h = await harness();
  const r = await run([...NEON, '--confirm'], h);
  assert.equal(r.code, 0, r.text);
  assert.equal(h.migratedFolders.length, 1, 'migrate called once');
  assert.deepEqual(h.migratedTags[0], all.slice(0, 10).map((m) => m.tag), 'exactly the first ten, in order — never 0010');
  assert.ok(!existsSync(h.migratedFolders[0]), 'the temporary folder was removed');
  assert.equal(await journalCount(h), 10);
  assert.match(r.out, /Done: 10 migrations applied and recorded/);
  assert.equal((await (await h.pg()).query(`select to_regclass('public.invoice_payments') is not null as there`)).rows[0]?.there, false, '0010 was not applied');

  const again = await run([...NEON, '--confirm'], h);
  assert.equal(again.code, 1, 'now it looks like production, so it refuses');
  assert.match(again.err, /not a brand-new database/);
  assert.equal(h.migratedFolders.length, 1, 'and migrates nothing more');
  await h.close();
});

test('a migration that fails part-way is reported as possibly half-applied, with the credentials scrubbed and the temporary folder removed', async () => {
  const h = await harness({ failMigrationAfter: true });
  const r = await run([...NEON, '--confirm'], h);
  assert.equal(r.code, 1);
  assert.match(r.err, /failed part-way/);
  assert.match(r.err, /half-migrated/);
  assert.match(r.err, /delete it and create a new one/);
  assert.match(r.err, /\[redacted\]/);
  assert.ok(!existsSync(h.migratedFolders[0]), 'the temporary folder was removed');
  await h.close();
});

test('if the journal does not have the expected number of rows afterwards, it says so', async () => {
  const h = await harness();
  const real = h.driver;
  // "succeeds" but writes nothing: the journal reads back empty (a real drizzle migrate would have created and filled it).
  h.driver = { ...real, migrate: async () => undefined, query: async (text) => (text === READ_JOURNAL_SQL ? [] : real.query(text)) };
  const r = await run([...NEON, '--confirm'], h);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unexpected: the journal has 0 rows, expected 10/);
  await h.close();
});
