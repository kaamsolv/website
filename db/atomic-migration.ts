/**
 * Atomic migrations — plan and apply pending migrations as ONE transaction, journal row included.
 *
 * Why this exists: production runs on Neon's HTTP driver, and drizzle's `neon-http` migrator
 * (`drizzle-orm/neon-http/migrator`) sends every statement as its own request and writes the journal rows only at
 * the very end. A failure part-way through a migration such as 0010 (23 statements: tables, plpgsql
 * functions, triggers, a seed) leaves a half-applied schema with no journal row, and a re-run then fails on
 * "already exists". Here the schema statements and the journal insert go to the database as a single transaction,
 * so they succeed or fail together.
 *
 * Compatible with drizzle's migrator by construction: the same files, the same statement splitting
 * (`readMigrationFiles`), the same journal table (`drizzle.__drizzle_migrations`), and the same row (`hash` = SHA-256
 * of the file, `created_at` = the journal's `when`). A database migrated this way is seen by `npm run db:migrate` as
 * up to date, and the other way round — test/atomic-migration.test.mts proves both.
 *
 * Framework-free and driver-free: `applyAtomically` takes a function that runs a list of statements in one
 * transaction (Neon: `sql.transaction`; PGlite in tests: `pg.transaction`). Nothing here reads the environment.
 */

import { readFileSync } from 'node:fs';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export type Statement = { text: string; params?: unknown[] };
export type Migration = { tag: string; hash: string; folderMillis: number; statements: string[] };
export type Journal = { hash: string; createdAt: number }[];

export const JOURNAL_SCHEMA = 'drizzle';
export const JOURNAL_TABLE = '__drizzle_migrations';

/** The migrations in a folder, in journal order, with the statements drizzle would run for each. */
export function loadMigrations(migrationsFolder: string): Migration[] {
  const files = readMigrationFiles({ migrationsFolder });
  // readMigrationFiles drops the tag; recover it from the journal, which it reads in the same order.
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as { entries: { tag: string }[] };
  const tags = journal.entries.map((e) => e.tag);
  return files.map((m, i) => ({
    tag: tags[i] ?? `#${i}`,
    hash: m.hash,
    folderMillis: m.folderMillis,
    statements: m.sql.map((s) => s.trim()).filter((s) => s.length > 0),
  }));
}

export type Plan =
  | { ok: true; pending: Migration[]; applied: number }
  | { ok: false; reason: string };

/**
 * Which migrations are pending, given what the database's journal says is applied. Stricter than drizzle: the
 * applied rows must be exactly the first N migrations of this folder (same hash, same time, same order). If the
 * database has migrations this folder doesn't, or different content for one it has, we stop — applying anything
 * on top of an unknown state is how a "safe" migration becomes a bad night.
 */
export function planPending(all: Migration[], journal: Journal): Plan {
  const applied = [...journal].sort((a, b) => a.createdAt - b.createdAt);
  if (applied.length > all.length) {
    return { ok: false, reason: `The database has ${applied.length} migrations recorded but this checkout only has ${all.length}. Check out the branch that matches the database.` };
  }
  for (let i = 0; i < applied.length; i++) {
    if (applied[i].hash !== all[i].hash || applied[i].createdAt !== all[i].folderMillis) {
      return {
        ok: false,
        reason: `Applied migration #${i} in the database (${all[i].tag}) doesn't match this checkout's file (different content or time). Nothing was changed.`,
      };
    }
  }
  return { ok: true, pending: all.slice(applied.length), applied: applied.length };
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const JOURNAL = `${q(JOURNAL_SCHEMA)}.${q(JOURNAL_TABLE)}`;

/** The reads that tell us what is applied. The table may not exist yet (a brand-new database). */
export const READ_JOURNAL_SQL = `select hash, created_at::text as created_at from ${JOURNAL} order by created_at asc`;
export const JOURNAL_EXISTS_SQL = `select to_regclass('${JOURNAL_SCHEMA}.${JOURNAL_TABLE}') is not null as present`;

/**
 * Everything one transaction will run, in order: make sure the journal exists (what drizzle does too), then each
 * pending migration's statements followed immediately by its own journal row.
 */
export function buildTransaction(pending: Migration[]): Statement[] {
  const out: Statement[] = [
    { text: `CREATE SCHEMA IF NOT EXISTS ${q(JOURNAL_SCHEMA)}` },
    { text: `CREATE TABLE IF NOT EXISTS ${JOURNAL} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)` },
  ];
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

/** Run the plan as a single transaction through `run`. If `run` throws, nothing was committed (the transaction rolled back). */
export async function applyAtomically(pending: Migration[], run: Runner): Promise<{ applied: string[] }> {
  if (pending.length === 0) return { applied: [] };
  await run(buildTransaction(pending));
  return { applied: pending.map((m) => m.tag) };
}

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
