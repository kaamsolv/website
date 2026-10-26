/**
 * Atomic migrations — plan and apply pending migrations as ONE transaction, journal row included.
 *
 * Why this exists: production runs on Neon's HTTP driver, and drizzle's `neon-http` migrator
 * (`drizzle-orm/neon-http/migrator`) sends every statement as its own request and writes the journal rows only at
 * the very end. A failure part-way through a migration such as 0010 (23 statements: tables, plpgsql
 * functions, triggers, a seed) leaves a half-applied schema with no journal row, and a re-run then fails on
 * "already exists". Here the schema statements and the journal insert are sent to the database as a single
 * transaction, so a failure the database reports rolls all of it back. That guarantee comes from Postgres and from
 * Neon's handling of a batch; it is exercised on PGlite by test/atomic-migration.test.mts and has NOT yet been
 * confirmed against Neon (docs/infra/deployment.md, step 4). A failure that never reached the database's answer —
 * a dropped connection, a gateway timeout — leaves the outcome unknown: see `classifyFailure`.
 *
 * Compatible with drizzle's migrator by construction: the same files, the same statement splitting
 * (`readMigrationFiles`), the same journal table (`drizzle.__drizzle_migrations`), and the same row (`hash` = SHA-256
 * of the file, `created_at` = the journal's `when`). A database migrated this way is seen by `npm run db:migrate` as
 * up to date, and the other way round — test/atomic-migration.test.mts proves both.
 *
 * Framework-free and driver-free: `applyAtomically` takes a function that runs a list of statements in one
 * transaction (Neon: `sql.transaction`; PGlite in tests: `pg.transaction`). Nothing here reads the environment.
 */

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export type Statement = { text: string; params?: unknown[] };
export type Migration = {
  tag: string;
  /** What drizzle records: SHA-256 of the file exactly as checked out. */
  hash: string;
  /** The same content with LF and with CRLF line endings — a checkout on another machine hashes differently. */
  acceptedHashes: string[];
  folderMillis: number;
  statements: string[];
};
export type Journal = { hash: string; createdAt: number }[];

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export const JOURNAL_SCHEMA = 'drizzle';
export const JOURNAL_TABLE = '__drizzle_migrations';

/** The migrations in a folder, in journal order, with the statements drizzle would run for each. */
export function loadMigrations(migrationsFolder: string): Migration[] {
  const files = readMigrationFiles({ migrationsFolder });
  // readMigrationFiles drops the tag; recover it from the journal, which it reads in the same order.
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as { entries: { tag: string }[] };
  const tags = journal.entries.map((e) => e.tag);
  return files.map((m, i) => {
    const tag = tags[i] ?? `#${i}`;
    // The file's hash depends on its line endings, and git on Windows turns LF into CRLF (and back) between checkouts.
    // The same migration must be recognised either way — but only these two forms, never different content.
    const text = readFileSync(`${migrationsFolder}/${tag}.sql`, 'utf8');
    const lf = text.replace(/\r\n/g, '\n');
    return {
      tag,
      hash: m.hash,
      acceptedHashes: [...new Set([m.hash, sha256(lf), sha256(lf.replace(/\n/g, '\r\n'))])],
      folderMillis: m.folderMillis,
      statements: m.sql.map((st) => st.trim()).filter((st) => st.length > 0),
    };
  });
}

/**
 * A folder holding only the first migrations of another — journal entries and SQL files — so drizzle's own migrator
 * can build a database to the state production had before the newest migrations (see db/prepare-rehearsal.mts).
 */
export function writeMigrationSubset(sourceFolder: string, tags: string[], destFolder: string): void {
  mkdirSync(join(destFolder, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(sourceFolder, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  const keep = journal.entries.filter((e) => tags.includes(e.tag));
  if (keep.length !== tags.length) throw new Error('Some migrations asked for are not in the journal.');
  for (const e of keep) cpSync(join(sourceFolder, `${e.tag}.sql`), join(destFolder, `${e.tag}.sql`));
  writeFileSync(join(destFolder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: keep }));
}

/**
 * The migrations up to and including the one `selector` names — exactly: its four-digit number ("0009") or its whole
 * tag ("0009_qr_campaigns"). Anything else ("9", "00", "0009_q") is refused rather than guessed at.
 */
export function migrationsThrough(all: Migration[], selector: string): Migration[] {
  const at = /^\d{4}$/.test(selector)
    ? all.findIndex((m) => m.tag.startsWith(`${selector}_`))
    : all.findIndex((m) => m.tag === selector);
  if (at < 0) throw new Error(`"${selector}" is not an exact migration: give its four-digit number (e.g. 0009) or its full name (e.g. 0009_qr_campaigns).`);
  return all.slice(0, at + 1);
}

export type Plan =
  | { ok: true; pending: Migration[]; applied: number; /** Things worth saying, e.g. that a hash matched only after normalising line endings. */ notes: string[] }
  | { ok: false; reason: string };

/**
 * Which migrations are pending, given what the database's journal says is applied. Stricter than drizzle (which
 * compares only the journal time): the applied rows must be exactly the first N migrations of this folder — same
 * time, same order, and the same content. "Same content" tolerates line endings: a journal row whose hash matches
 * this file with LF or with CRLF endings counts as the same migration (and a note says so). If the database has
 * migrations this folder doesn't, or genuinely different content for one it has, we stop — applying anything on top
 * of an unknown state is how a "safe" migration becomes a bad night.
 */
export function planPending(all: Migration[], journal: Journal): Plan {
  const applied = [...journal].sort((a, b) => a.createdAt - b.createdAt);
  if (applied.length > all.length) {
    return { ok: false, reason: `The database has ${applied.length} migrations recorded but this checkout only has ${all.length}. Check out the branch that matches the database.` };
  }
  const notes: string[] = [];
  for (let i = 0; i < applied.length; i++) {
    if (applied[i].createdAt !== all[i].folderMillis) {
      return { ok: false, reason: `Applied migration #${i} in the database (${all[i].tag}) has a different journal time from this checkout's. Nothing was changed.` };
    }
    if (!all[i].acceptedHashes.includes(applied[i].hash)) {
      return { ok: false, reason: `Applied migration #${i} in the database (${all[i].tag}) has different content from this checkout's file (not just line endings). Nothing was changed.` };
    }
    if (applied[i].hash !== all[i].hash) notes.push(`${all[i].tag}: recorded with different line endings than this checkout has — same content.`);
  }
  return { ok: true, pending: all.slice(applied.length), applied: applied.length, notes };
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const JOURNAL = `${q(JOURNAL_SCHEMA)}.${q(JOURNAL_TABLE)}`;

/** The reads that tell us what is applied. The table may not exist yet (a brand-new database). */
export const READ_JOURNAL_SQL = `select hash, created_at::text as created_at from ${JOURNAL} order by created_at asc`;
export const JOURNAL_EXISTS_SQL = `select to_regclass('${JOURNAL_SCHEMA}.${JOURNAL_TABLE}') is not null as present`;

/**
 * Conservative defaults for the two timeouts every migration transaction starts with. `lock_timeout`: how long a
 * statement may WAIT for a lock — the danger with `ALTER TABLE` on a live table is that it queues behind a long
 * query and then everything else queues behind it; failing after 5 s (and rolling back) is far better than stalling
 * the app. `statement_timeout`: the longest any one statement may run; 60 s is generous for these migrations. They are
 * choices, not measurements: neither has been validated on Neon (see docs/infra/deployment.md), and a migration on a
 * much larger table may need more of either, passed deliberately with `--lock-timeout-ms` / `--statement-timeout-ms`.
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 60_000;
/** The bounds the CLI accepts, so a typo can't mean "wait forever" (0 disables a timeout in Postgres) or "fail at once". */
export const LOCK_TIMEOUT_RANGE_MS = [500, 120_000] as const;
export const STATEMENT_TIMEOUT_RANGE_MS = [5_000, 1_800_000] as const;

/** One key for "a migration is being applied": two runners can't be inside their transactions at once. */
const ADVISORY_LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtext('kaamsolv:schema-migrations'))`;
/** Raised by the guard below when the journal is no longer the one the plan was made from. */
export const STATE_CHANGED = 'migration_state_changed';

export type TransactionOptions = {
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
  /** How many migrations the plan found already applied. When given, the transaction refuses to run if that is no longer true. */
  expectedApplied?: number;
};

function milliseconds(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 3_600_000) throw new Error(`${name} must be a whole number of milliseconds between 1 and 3,600,000.`);
  return value;
}

/**
 * Everything one transaction will run, in order:
 *   1. `SET LOCAL lock_timeout` and `SET LOCAL statement_timeout` — first, before anything that changes the schema
 *      (SET LOCAL lasts only until this transaction ends);
 *   2. an advisory lock, so a second runner waits (and then fails its own lock timeout) instead of interleaving;
 *   3. the journal table (what drizzle also makes) and — when `expectedApplied` is given — a check, made while the lock is
 *      held, that the journal still has exactly that many rows. The plan was read earlier, in a separate request; this makes
 *      "the state I planned from" and "the state I change" one atomic step, so a second operator who got there first
 *      makes this one fail cleanly instead of applying a migration twice;
 *   4. each pending migration's statements followed immediately by its own journal row.
 */
export function buildTransaction(pending: Migration[], opts: TransactionOptions = {}): Statement[] {
  const lock = milliseconds(opts.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS, 'lockTimeoutMs');
  const statement = milliseconds(opts.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS, 'statementTimeoutMs');
  const out: Statement[] = [
    { text: `SET LOCAL lock_timeout = '${lock}ms'` },
    { text: `SET LOCAL statement_timeout = '${statement}ms'` },
    { text: ADVISORY_LOCK_SQL },
    { text: `CREATE SCHEMA IF NOT EXISTS ${q(JOURNAL_SCHEMA)}` },
    { text: `CREATE TABLE IF NOT EXISTS ${JOURNAL} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)` },
  ];
  if (opts.expectedApplied !== undefined) {
    const n = opts.expectedApplied;
    if (!Number.isInteger(n) || n < 0) throw new Error('expectedApplied must be a whole number.');
    out.push({ text: `DO $kk$ BEGIN IF (SELECT count(*) FROM ${JOURNAL}) <> ${n} THEN RAISE EXCEPTION '${STATE_CHANGED}'; END IF; END $kk$` });
  }
  for (const m of pending) {
    for (const text of m.statements) out.push({ text });
    out.push({ text: `insert into ${JOURNAL} ("hash", "created_at") values ($1, $2)`, params: [m.hash, m.folderMillis] });
  }
  return out;
}

/** A human summary of what would run, safe to print: statement counts and the first words of each, no data. */
export function describePlan(pending: Migration[]): string[] {
  if (pending.length === 0) return ['Nothing to apply: the database already has every migration in this checkout.'];
  const lines: string[] = [];
  for (const m of pending) {
    lines.push(`${m.tag}: ${m.statements.length} statements, applied together with its journal row in one transaction`);
    for (const s of m.statements) {
      const first = s.replace(/^(--[^\n]*\n)+/g, '').replace(/\s+/g, ' ').trim();
      lines.push(`    ${first.slice(0, 90)}${first.length > 90 ? '…' : ''}`);
    }
  }
  return lines;
}

export type Runner = (statements: Statement[]) => Promise<void>;

/**
 * Run the plan as a single transaction through `run`. If the database reports an error, the transaction rolled back as
 * a whole. If `run` fails any other way (connection lost, timeout), whether it committed is unknown — classify the
 * error with `classifyFailure` and read the journal before doing anything else.
 */
export async function applyAtomically(pending: Migration[], run: Runner, opts: TransactionOptions = {}): Promise<{ applied: string[] }> {
  if (pending.length === 0) return { applied: [] };
  await run(buildTransaction(pending, opts));
  return { applied: pending.map((m) => m.tag) };
}

export type FailureKind = 'rolled_back' | 'unknown';

/**
 * What a failed `sql.transaction` tells us. A Postgres error reported by the server (it carries a five-character
 * SQLSTATE `code`, e.g. 42P07 "already exists") means the statement failed inside the transaction, so the whole
 * transaction was rolled back and the database is as it was. Anything else — the connection dropped, a gateway
 * timeout, an unreadable answer — says nothing about whether the server committed first: the outcome is UNKNOWN
 * until the journal is read again.
 */
export function classifyFailure(e: unknown): FailureKind {
  for (let cur: unknown = e, i = 0; cur && i < 4; i++) {
    const code = (cur as { code?: unknown }).code;
    // SQLSTATE: five digits/capitals, and no Postgres error class starts with E — which Node's own network codes (EPIPE, ECONNRESET…) do.
    if (typeof code === 'string' && /^[0-9A-DF-Z][0-9A-Z]{4}$/.test(code)) return 'rolled_back';
    cur = (cur as { cause?: unknown }).cause;
  }
  return 'unknown';
}

/**
 * A specific explanation for the errors an operator is most likely to meet — and ONLY for ones the database itself
 * reported (they carry a SQLSTATE, so `classifyFailure` says rolled back). A timeout the client or a gateway gave up on
 * has no such code and never gets a hint here: it stays "unknown". 55P03 is `lock_timeout` expiring, 57014 is
 * `statement_timeout` (or a cancel) expiring; P0001 with our marker is the journal-changed guard.
 */
export function failureHint(e: unknown): string | null {
  if (classifyFailure(e) !== 'rolled_back') return null; // never explain a failure the database did not report
  for (let cur: unknown = e, i = 0; cur && i < 4; i++) {
    const { code, message } = cur as { code?: unknown; message?: unknown };
    if (code === '55P03') return 'A lock could not be taken within the lock timeout — usually a long-running query on one of these tables. Nothing was changed; try again when the app is quiet, or raise --lock-timeout-ms deliberately.';
    if (code === '57014') return 'A statement ran past the statement timeout and was cancelled. Nothing was changed; if the table is large, raise --statement-timeout-ms deliberately.';
    if (typeof message === 'string' && message.includes(STATE_CHANGED)) return 'The migrations recorded in this database changed after the plan was read — most likely another run. Nothing was changed; run the dry run again.';
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

export const FAILURE_ADVICE: Record<FailureKind, string[]> = {
  rolled_back: ['The database reported the error from inside the transaction, so it was rolled back as a whole: nothing was changed.'],
  unknown: [
    'The answer did not come from the database, so it is NOT known whether the transaction committed.',
    'Do not re-run with --confirm. Run again WITHOUT --confirm to read the journal: it is written in the same transaction as the schema, so',
    '"Applied N of N" means it committed, and the previous count means it did not.',
  ],
};

/**
 * Make text safe to print: wherever the connection string, or the password inside it, appears it becomes
 * "[redacted]". Driver error messages sometimes echo what they were given; the tools print only what this returns.
 */
export function redact(text: string, connectionString: string | undefined): string {
  let out = text;
  const secrets: string[] = [];
  if (connectionString) {
    secrets.push(connectionString);
    try {
      const u = new URL(connectionString);
      if (u.password) secrets.push(u.password, decodeURIComponent(u.password));
      if (u.username) secrets.push(u.username);
    } catch {
      // not a URL: the whole string is already in the list
    }
  }
  for (const secret of new Set(secrets)) if (secret.length >= 3) out = out.split(secret).join('[redacted]');
  return out;
}

// ─── Shared by the command-line tools ──────────────────────────────────────────────────────────────

/**
 * The value after `--name`, or undefined when the flag is absent or has no value (the next word is another flag or
 * missing). Never falls back to some other argument: `indexOf(...) + 1` on a missing flag reads the FIRST argument.
 */
export function argValue(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  return value === undefined || value.startsWith('--') ? undefined : value;
}

/**
 * One safe line for an error: its name, Postgres/driver code and message, capped, and scrubbed of the connection string
 * and password. Never the error's other properties — Node's own printing of an uncaught error includes them, and
 * e.g. an invalid-URL error carries the entire input string as a property.
 */
export function describeError(e: unknown, connectionString: string | undefined): string {
  const err = e as { name?: unknown; code?: unknown; message?: unknown } | null;
  const name = typeof err?.name === 'string' ? err.name : 'Error';
  const code = typeof err?.code === 'string' ? ` [${err.code}]` : '';
  const message = typeof err?.message === 'string' ? err.message : String(e);
  return redact(`${name}${code}: ${message.slice(0, 300)}`, connectionString);
}

/**
 * Make every error that escapes — a thrown exception or a rejected top-level await — print only `describeError`
 * and exit 1, instead of Node's default dump of the error object. Install once at the top of each tool.
 */
export function installSafeErrorOutput(): void {
  // No process.exit() here or anywhere in the tools: on Windows, exiting while the Neon HTTP driver's fetch keep-alive
  // sockets are still closing trips a libuv assertion (db/link-status.mts has the same note) — it happened on the first
  // real Neon run, right after a correct "rolled back" message, and replaced the exit code with garbage. Set the exit
  // code and let the event loop drain. The unref'd timer is only a backstop for something that never lets go.
  const fail = (e: unknown) => {
    if (e instanceof StopRun) {
      process.exitCode = e.exitCode;
      return;
    }
    console.error(describeError(e, process.env.DATABASE_URL));
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
}

/**
 * Stop a tool from anywhere — even deep inside awaited code — without process.exit(): throw this. The handler above turns
 * it into the exit code and the process then ends when its connections have closed.
 */
export class StopRun extends Error {
  readonly exitCode: number;
  // No `readonly` parameter property: Node's built-in type stripping cannot handle one, and these tools run on it.
  constructor(exitCode: number) {
    super(`stopped (exit code ${exitCode})`);
    this.name = 'StopRun';
    this.exitCode = exitCode;
  }
}
