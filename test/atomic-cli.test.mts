/**
 * `db:migrate:atomic` after the safety gates (db/atomic-cli.ts), against a FAKE driver: no Neon, no network, no file read.
 * Covers the gates (and that nothing is contacted when one refuses), the dry run, the exact transaction handed to the
 * driver, "already applied", a journal that does not match, a confirmed rollback, an unknown outcome, and a read-back
 * that fails after the commit.
 *
 * Where an error shape matters it is real wherever possible: `NeonDbError` is the driver's own class, and one test makes
 * the real driver produce its transport-failure error (it fails locally, parsing a URL it cannot use — nothing is sent).
 * Shapes built by hand are labelled SYNTHETIC: the code a Neon server puts on an error has not been seen here.
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { NeonDbError, neon } from '@neondatabase/serverless';
import { runAtomicCli, type Driver } from '../db/atomic-cli.ts';
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  JOURNAL_EXISTS_SQL,
  READ_JOURNAL_SQL,
  buildTransaction,
  loadMigrations,
  type Statement,
} from '../db/atomic-migration.ts';

const FOLDER = resolve(import.meta.dirname, '../db/migrations');
const all = loadMigrations(FOLDER);
const BEFORE_LAST = all.length - 1;
const PASSWORD = 'Fake-Pw-98765';
const URL_ = `postgres://app_user:${PASSWORD}@db.example.test/neondb?sslmode=require`;
const HOST = 'db.example.test';

const row = (m: { hash: string; folderMillis: number }) => ({ hash: m.hash, created_at: String(m.folderMillis) });
const journal = (n: number) => all.slice(0, n).map(row);

type Fake = {
  driver: Driver;
  calls: string[];
  transactions: Statement[][];
  connected: string[];
};
function fake(opts: {
  rows?: Record<string, unknown>[];
  present?: boolean;
  transactionError?: unknown;
  /** What the journal read AFTER a successful transaction returns, or an error to throw. */
  readBack?: Record<string, unknown>[] | Error;
}): Fake {
  const f: Fake = { calls: [], transactions: [], connected: [], driver: undefined as unknown as Driver };
  let journalReads = 0;
  f.driver = {
    async query(text) {
      if (text === JOURNAL_EXISTS_SQL) {
        f.calls.push('journal-exists');
        return [{ present: opts.present ?? true }];
      }
      if (text === READ_JOURNAL_SQL) {
        f.calls.push('journal-read');
        if (++journalReads === 1) return opts.rows ?? journal(BEFORE_LAST);
        if (opts.readBack instanceof Error) throw opts.readBack;
        return opts.readBack ?? journal(all.length);
      }
      throw new Error(`unexpected query: ${text}`);
    },
    async transaction(statements) {
      f.calls.push('transaction');
      f.transactions.push(statements);
      if (opts.transactionError) throw opts.transactionError;
    },
  };
  return f;
}

/** `url` of null means "no DATABASE_URL at all" (undefined would just pick the default). */
async function run(args: string[], f: Fake, url: string | null = URL_) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runAtomicCli({
    args,
    databaseUrl: url ?? undefined,
    migrationsFolder: FOLDER,
    connect: async (u) => {
      f.connected.push(u);
      return f.driver;
    },
    io: { out: (l) => out.push(l), err: (l) => err.push(l) },
  });
  const text = `${out.join('\n')}\n${err.join('\n')}`;
  assert.ok(!text.includes(PASSWORD) && !text.includes('app_user') && !text.includes('postgres://'), 'no credentials are ever printed');
  return { code, out: out.join('\n'), err: err.join('\n'), text };
}
const APPLY = ['--expect-host', HOST, '--confirm', '--restore-point-taken'];

// ─── The gates: nothing is contacted ─────────────────────────────────────────────────────────────

test('every gate refuses before the driver is even created — and the refusal never says what the host is', async () => {
  const cases: [string, string[], string | null][] = [
    ['no DATABASE_URL', ['--expect-host', HOST], null],
    ['an empty DATABASE_URL', ['--expect-host', HOST], ''],
    ['a malformed DATABASE_URL', ['--expect-host', HOST], `postgres://u:${PASSWORD}@[bad/db`],
    ['no --expect-host', [], URL_],
    ['--expect-host with no value', ['--expect-host'], URL_],
    ['--expect-host followed by a flag', ['--expect-host', '--confirm'], URL_],
    ['the host as a bare argument', [HOST, '--confirm'], URL_],
    ['the wrong host', ['--expect-host', 'someone-else.example'], URL_],
    ['a different case of the right host is still an exact match test', ['--expect-host', HOST.toUpperCase()], URL_],
    ['a lock timeout of zero (which Postgres treats as "wait forever")', ['--expect-host', HOST, '--lock-timeout-ms', '0'], URL_],
    ['a lock timeout below the minimum', ['--expect-host', HOST, '--lock-timeout-ms', '100'], URL_],
    ['a lock timeout that is not a number', ['--expect-host', HOST, '--lock-timeout-ms', 'soon'], URL_],
    ['a statement timeout above the maximum', ['--expect-host', HOST, '--statement-timeout-ms', '99999999'], URL_],
    ['a timeout flag with no value', ['--expect-host', HOST, '--statement-timeout-ms'], URL_],
  ];
  for (const [what, args, url] of cases) {
    const f = fake({});
    const r = await run(args, f, url);
    assert.equal(r.code, 1, what);
    assert.equal(f.connected.length, 0, `${what}: the driver was never created`);
    assert.equal(f.calls.length, 0, `${what}: nothing was queried`);
    if (/host/.test(what) || what.includes('--expect-host')) assert.ok(!r.text.includes(HOST), `${what}: the real host is not echoed back`);
  }
});

// ─── Dry run ─────────────────────────────────────────────────────────────────────────────────────

test('the dry run reads the journal, describes the plan and the timeouts, and never opens a transaction', async () => {
  const f = fake({});
  const r = await run(['--expect-host', HOST], f);
  assert.equal(r.code, 0);
  assert.deepEqual(f.connected, [URL_]);
  assert.deepEqual(f.calls, ['journal-exists', 'journal-read'], 'only reads');
  assert.match(r.out, new RegExp(`Applied in this database: ${BEFORE_LAST} of ${all.length}\\. Pending: 1\\.`));
  assert.match(r.out, new RegExp(`${all.at(-1)!.tag}: \\d+ statements`));
  assert.match(r.out, new RegExp(`lock ${DEFAULT_LOCK_TIMEOUT_MS} ms, statement ${DEFAULT_STATEMENT_TIMEOUT_MS} ms`));
  assert.match(r.out, /not validated on Neon/);
  assert.match(r.out, /Dry run — nothing was changed/);
  assert.equal(f.transactions.length, 0);
});

test('--confirm alone, without a restore point, refuses and opens no transaction', async () => {
  const f = fake({});
  const r = await run(['--expect-host', HOST, '--confirm'], f);
  assert.equal(r.code, 1);
  assert.match(r.err, /take a Neon restore point/);
  assert.equal(f.transactions.length, 0);
});

// ─── The transaction ─────────────────────────────────────────────────────────────────────────────

test('applying opens exactly one transaction — timeouts first, then the lock and journal check, then the migration — then reads the journal back', async () => {
  const f = fake({});
  const r = await run(APPLY, f);
  assert.equal(r.code, 0, r.text);
  assert.deepEqual(f.calls, ['journal-exists', 'journal-read', 'transaction', 'journal-read'], 'the order of everything the driver was asked');
  assert.equal(f.transactions.length, 1, 'a single transaction');

  const expected = buildTransaction(all.slice(BEFORE_LAST), { expectedApplied: BEFORE_LAST });
  assert.deepEqual(f.transactions[0], expected, 'exactly the statements buildTransaction produces for this plan');
  const [lock, statement] = f.transactions[0];
  assert.equal(lock.text, `SET LOCAL lock_timeout = '${DEFAULT_LOCK_TIMEOUT_MS}ms'`);
  assert.equal(statement.text, `SET LOCAL statement_timeout = '${DEFAULT_STATEMENT_TIMEOUT_MS}ms'`);
  assert.ok(f.transactions[0].some((s) => s.text.includes(`<> ${BEFORE_LAST}`) && s.text.includes('migration_state_changed')), 'the journal-changed guard expects exactly the applied count the plan saw');
  assert.deepEqual(f.transactions[0].at(-1)?.params, [all.at(-1)!.hash, all.at(-1)!.folderMillis], 'its own journal row is the last statement');
  assert.match(r.out, new RegExp(`Committed: ${all.at(-1)!.tag}`));
  assert.match(r.out, new RegExp(`Journal now has ${all.length} rows`));
});

test('the timeouts can be set, within bounds, and reach the transaction', async () => {
  const f = fake({});
  const r = await run([...APPLY, '--lock-timeout-ms', '2000', '--statement-timeout-ms', '90000'], f);
  assert.equal(r.code, 0, r.text);
  assert.equal(f.transactions[0][0].text, `SET LOCAL lock_timeout = '2000ms'`);
  assert.equal(f.transactions[0][1].text, `SET LOCAL statement_timeout = '90000ms'`);
  assert.match(r.out, /lock 2000 ms, statement 90000 ms/);
});

// ─── Already applied, and a journal that does not match ─────────────────────────────────────────

test('when everything is already applied, nothing is done — even with --confirm', async () => {
  const f = fake({ rows: journal(all.length) });
  const r = await run(APPLY, f);
  assert.equal(r.code, 0);
  assert.match(r.out, /Nothing to apply/);
  assert.equal(f.transactions.length, 0);
  assert.deepEqual(f.calls, ['journal-exists', 'journal-read']);
});

test('a brand-new database (no journal table) plans every migration', async () => {
  const f = fake({ present: false });
  const r = await run(['--expect-host', HOST], f);
  assert.equal(r.code, 0);
  assert.match(r.out, new RegExp(`Applied in this database: 0 of ${all.length}\\. Pending: ${all.length}\\.`));
  assert.deepEqual(f.calls, ['journal-exists'], 'the journal table does not exist, so it is not read');
});

test('a journal that differs from this checkout is refused with no transaction: different content, different time, or more rows than this checkout has', async () => {
  const different = journal(BEFORE_LAST);
  different[3] = { ...different[3], hash: 'f'.repeat(64) };
  const content = await run(APPLY, fake({ rows: different }));
  assert.equal(content.code, 1);
  assert.match(content.err, /different content/);

  const retimed = journal(BEFORE_LAST);
  retimed[2] = { ...retimed[2], created_at: String(Number(retimed[2].created_at) + 1) };
  assert.match((await run(APPLY, fake({ rows: retimed }))).err, /different journal time/);

  const extra = [...journal(all.length), { hash: 'a'.repeat(64), created_at: '9999999999999' }];
  assert.match((await run(APPLY, fake({ rows: extra }))).err, /only has/);

  for (const rows of [different, retimed, extra]) {
    const f = fake({ rows });
    await run(APPLY, f);
    assert.equal(f.transactions.length, 0, 'no transaction on a state this tool does not recognise');
  }
});

test('a journal recorded with the other line endings is accepted, with a note', async () => {
  const lf = (t: string) => t.replace(/\r\n/g, '\n');
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const rows = journal(BEFORE_LAST).map((r, i) => {
    const text = readFileSync(resolve(FOLDER, `${all[i].tag}.sql`), 'utf8');
    const other = text.includes('\r\n') ? lf(text) : lf(text).replace(/\n/g, '\r\n');
    return { ...r, hash: createHash('sha256').update(other).digest('hex') };
  });
  const f = fake({ rows });
  const r = await run(['--expect-host', HOST], f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /Note: .*different line endings .*same content/);
});

// ─── A failure the database reported: rolled back ───────────────────────────────────────────────

/** SYNTHETIC server error: the driver's own error class, given a SQLSTATE the way the driver does for a server error. */
const serverError = (code: string, message: string) => Object.assign(new NeonDbError(message), { code });

test('an error the database reports means a confirmed rollback — and a timeout or a changed journal gets its own plain explanation', async () => {
  const cases: [string, unknown, RegExp][] = [
    ['already exists', serverError('42P07', 'relation "invoice_payments" already exists'), /rolled back as a whole/],
    ['statement timeout', serverError('57014', 'canceling statement due to statement timeout'), /statement timeout.*Nothing was changed/s],
    ['lock timeout', serverError('55P03', 'canceling statement due to lock timeout'), /lock timeout.*Nothing was changed/s],
    ['journal changed under us', serverError('P0001', 'migration_state_changed'), /changed after the plan was read.*run the dry run again/s],
  ];
  for (const [what, error, expectation] of cases) {
    const f = fake({ transactionError: error });
    const r = await run(APPLY, f);
    assert.equal(r.code, 1, what);
    assert.match(r.err, expectation, what);
    assert.match(r.err, /rolled back as a whole: nothing was changed/, `${what}: confirmed rollback`);
    assert.doesNotMatch(r.err, /NOT known/, `${what}: not described as unknown`);
    assert.deepEqual(f.calls, ['journal-exists', 'journal-read', 'transaction'], `${what}: no read-back after a rollback`);
  }
});

// ─── A failure the database did not report: outcome unknown ─────────────────────────────────────

test('a failure that never reached the database’s answer is "outcome unknown" — never "rolled back"', async () => {
  // REAL: the driver's own transport-failure error. neon() cannot use this URL, so it throws locally and sends nothing.
  let realTransport: unknown;
  try {
    await neon('postgres://u:p@127.0.0.1:1/db').query('select 1');
  } catch (e) {
    realTransport = e;
  }
  assert.ok(realTransport instanceof NeonDbError, 'the real driver produced a NeonDbError for the transport failure');
  assert.equal((realTransport as { code?: unknown }).code, undefined, 'and it carries no SQLSTATE');

  const cases: [string, unknown][] = [
    ['a real driver transport failure', realTransport],
    ['SYNTHETIC: a gateway timeout from Neon’s HTTP endpoint', Object.assign(new NeonDbError('Server error (HTTP status 504): gateway timeout'), {})],
    ['SYNTHETIC: the client giving up (an AbortSignal timeout)', new DOMException('The operation was aborted due to timeout', 'TimeoutError')],
    ['SYNTHETIC: a reset connection', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
  ];
  for (const [what, error] of cases) {
    const f = fake({ transactionError: error });
    const r = await run(APPLY, f);
    assert.equal(r.code, 1, what);
    assert.match(r.err, /NOT known whether the transaction committed/, what);
    assert.match(r.err, /Do not re-run with --confirm/, what);
    assert.doesNotMatch(r.err, /rolled back as a whole/, `${what}: never claims a rollback`);
    assert.deepEqual(f.calls, ['journal-exists', 'journal-read', 'transaction'], `${what}: it does not guess by reading back`);
  }
});

test('a timeout the CLIENT hit is never explained as a database timeout, even if its message says so', async () => {
  // SYNTHETIC: a transport error whose text happens to mention a statement timeout, but which carries no SQLSTATE.
  const f = fake({ transactionError: new Error('fetch failed: canceling statement due to statement timeout') });
  const r = await run(APPLY, f);
  assert.match(r.err, /NOT known/);
  assert.doesNotMatch(r.err, /Nothing was changed; if the table is large/);
});

// ─── After the commit ───────────────────────────────────────────────────────────────────────────

test('if reading the journal back fails AFTER the commit, it says the migration was applied — not rolled back — and exits 3', async () => {
  const f = fake({ readBack: new Error('read ECONNRESET') });
  const r = await run(APPLY, f);
  assert.equal(r.code, 3);
  assert.match(r.out, new RegExp(`Committed: ${all.at(-1)!.tag}`));
  assert.match(r.err, /WAS applied and committed.*not rolled back/s);
  assert.match(r.err, /Run the dry run/);
  assert.doesNotMatch(r.err, /rolled back as a whole|NOT known/);
});

test('if the journal read back has the wrong number of rows, it says so and exits 3', async () => {
  const f = fake({ readBack: journal(BEFORE_LAST) });
  const r = await run(APPLY, f);
  assert.equal(r.code, 3);
  assert.match(r.err, /was committed, but the journal has \d+ rows and \d+ were expected/);
});

// ─── Scrubbing ──────────────────────────────────────────────────────────────────────────────────

test('even an error whose own message contains the connection string is printed scrubbed', async () => {
  const f = fake({ transactionError: new Error(`could not connect to ${URL_} as app_user with ${PASSWORD}`) });
  const r = await run(APPLY, f); // run() itself asserts that no credential appears anywhere
  assert.equal(r.code, 1);
  assert.match(r.err, /\[redacted\]/);
});
