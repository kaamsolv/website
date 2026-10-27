/**
 * Atomic migration runner — `npm run db:migrate:atomic`. Use this, not `db:migrate`, for any Neon database that
 * matters (see docs/infra/deployment.md §"Applying a migration to production").
 *
 *   npm run db:migrate:atomic -- --expect-host <host>
 *       Read-only dry run. Shows the target host, what the database has applied, and what would run. Changes nothing.
 *
 *   npm run db:migrate:atomic -- --expect-host <host> --confirm --restore-point-taken
 *       Applies every pending migration in ONE transaction together with its journal row. If the database reports an
 *       error the whole transaction rolls back; if the connection is lost before an answer, whether it committed is
 *       unknown and the tool says so (read the journal with the dry run).
 *
 *   Optional: --lock-timeout-ms <n> (500–120000, default 5000) and --statement-timeout-ms <n> (5000–1800000, default 60000).
 *   They are set with SET LOCAL at the very start of the transaction. Conservative choices, not validated on Neon.
 *
 * It never picks a target for you: DATABASE_URL must be set in the environment of that one command (no .env file is
 * read, so a production string left in .env.local is never picked up), and --expect-host — typed by you, always, even
 * for the dry run — must match that URL's host or nothing is contacted at all. The refusal does not say what the host is.
 * Only one operator should run it at a time; the transaction also takes an advisory lock and re-checks the journal inside
 * itself, so a second simultaneous run fails cleanly instead of interleaving or applying anything twice.
 *
 * Exit codes: 0 done / dry run / nothing to apply · 1 refused or failed · 3 applied and committed, but reading the journal
 * back afterwards failed (it was NOT rolled back).
 *
 * The logic lives in db/atomic-cli.ts (tested with a fake driver); this file only supplies the real Neon driver.
 * Run with Node's native TypeScript support:  node db/migrate-atomic.mts
 */

import { resolve } from 'node:path';
import { runAtomicCli } from './atomic-cli.ts';
import { installSafeErrorOutput } from './atomic-migration.ts';

installSafeErrorOutput(); // any error that escapes prints one scrubbed line, never Node's dump of the error object

const code = await runAtomicCli({
  args: process.argv.slice(2),
  databaseUrl: process.env.DATABASE_URL?.trim(),
  migrationsFolder: resolve(import.meta.dirname, 'migrations'),
  connect: async (url) => {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return {
      query: async (text) => (await sql.query(text)) as Record<string, unknown>[],
      transaction: async (statements) => {
        await sql.transaction((txn) => statements.map((s) => txn.query(s.text, s.params ?? [])));
      },
    };
  },
  io: { out: (line) => console.log(line), err: (line) => console.error(line) },
});
process.exitCode = code; // not process.exit(): see installSafeErrorOutput (Windows + the Neon driver's open sockets)
