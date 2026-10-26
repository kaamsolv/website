/**
 * Atomic migration runner — `npm run db:migrate:atomic`. Use this, not `db:migrate`, for any Neon database that
 * matters (see docs/infra/deployment.md §"Applying a migration to production").
 *
 *   npm run db:migrate:atomic -- --expect-host <host>
 *       Read-only dry run. Shows the target host, what the database has applied, and what would run. Changes nothing.
 *
 *   npm run db:migrate:atomic -- --expect-host <host> --confirm --restore-point-taken
 *       Applies every pending migration in ONE transaction together with its journal row: all of it commits or none
 *       of it does.
 *
 * It never picks a target for you: DATABASE_URL must be set in the environment of that one command (no .env file is
 * read, so a production string left in .env.local is never picked up), and --expect-host — typed by you, always, even
 * for the dry run — must equal that URL's host or nothing is contacted at all.
 *
 * Why not `db:migrate`: drizzle's neon-http migrator runs each statement as a separate request and records the
 * journal only at the end, so a failure part-way leaves a half-applied migration (db/atomic-migration.ts).
 * Only reads DATABASE_URL (never prints it — the host only). Production use is a deliberate, approved step.
 *
 * Run with Node's native TypeScript support:  node db/migrate-atomic.mts
 */

import { resolve } from 'node:path';
import { describeDatabaseTarget } from './load-env.mts';
import { JOURNAL_EXISTS_SQL, READ_JOURNAL_SQL, applyAtomically, describePlan, loadMigrations, planPending, redact } from './atomic-migration.ts';

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'migrations');

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const stop = (message: string): never => {
  console.error(redact(message, process.env.DATABASE_URL));
  process.exit(1);
};

const url = process.env.DATABASE_URL?.trim();
if (!url) stop('DATABASE_URL is not set in the environment of this command. This tool is for Neon databases and reads no .env file; local development uses `npm run db:migrate` (PGlite).');
let host: string;
try {
  host = new URL(url as string).hostname;
} catch {
  host = stop('DATABASE_URL could not be read as a URL.');
}

// The operator must name the database they mean, every time, before anything is contacted — dry run included.
if (valueOf('--expect-host') !== host) stop(`Refusing: --expect-host must be exactly "${host}" (the host DATABASE_URL points at). Nothing was contacted.`);
console.log(`Target: ${describeDatabaseTarget()}`);

const { neon } = await import('@neondatabase/serverless');
const sql = neon(url as string);

const all = loadMigrations(MIGRATIONS_FOLDER);
const present = ((await sql.query(JOURNAL_EXISTS_SQL)) as { present: boolean }[])[0]?.present === true;
const rows = present ? ((await sql.query(READ_JOURNAL_SQL)) as { hash: string; created_at: string }[]) : [];
const plan = planPending(all, rows.map((r) => ({ hash: r.hash, createdAt: Number(r.created_at) })));
if (!plan.ok) stop(`Stopped: ${plan.reason}`);
if (!plan.ok) process.exit(1);

console.log(`Applied in this database: ${plan.applied} of ${all.length}. Pending: ${plan.pending.length}.`);
for (const line of describePlan(plan.pending)) console.log(line);

if (!flag('--confirm')) {
  console.log('\nDry run — nothing was changed. To apply: add --confirm --restore-point-taken');
  process.exit(0);
}
if (plan.pending.length === 0) process.exit(0);
if (!flag('--restore-point-taken')) stop('Refusing to apply: take a Neon restore point (or branch) first, then add --restore-point-taken.');

console.log('\nApplying in one transaction…');
try {
  const done = await applyAtomically(plan.pending, async (statements) => {
    await sql.transaction((txn) => statements.map((s) => txn.query(s.text, s.params ?? [])));
  });
  console.log(`Committed: ${done.applied.join(', ')} (statements and journal rows together).`);
} catch (e) {
  const err = e as { message?: string; code?: string };
  console.error(redact(`The transaction failed${err.code ? ` [${err.code}]` : ''}: ${(err.message ?? String(e)).slice(0, 300)}`, url));
  console.error('A failed transaction is rolled back as a whole, so the database should be exactly as it was.');
  console.error('If the connection dropped before an answer arrived, the outcome is unknown: re-run WITHOUT --confirm to read the journal (it is committed with the schema, so it tells the truth).');
  process.exit(1);
}

// Read it back.
const after = (await sql.query(READ_JOURNAL_SQL)) as { hash: string; created_at: string }[];
console.log(`Journal now has ${after.length} rows (expected ${all.length}).`);
