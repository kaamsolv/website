/**
 * Builds the state production is in BEFORE the newest migration, on a brand-new empty non-production Neon database —
 * so the rehearsal of `db:migrate:atomic` starts from the same place the real run will, and with journal rows
 * written by drizzle's own migrator (statement by statement, exactly how production's were).
 *
 *   DATABASE_URL=<empty non-production Neon database> npm run db:rehearsal:prepare -- --expect-host <host> --non-production
 *       Dry run: shows what would be applied. Contacts the database to check it is empty; changes nothing.
 *
 *   … --expect-host <host> --non-production --confirm
 *       Applies migrations 0000 up to (and including) --through (default 0009) with drizzle's migrator.
 *
 *   npm run db:rehearsal:prepare -- --local --confirm
 *       The same on in-memory PGlite: a self-check that needs no database.
 *
 * Safety (all must hold or it stops before writing anything):
 *   • DATABASE_URL must be set in that command's environment — no .env file is read;
 *   • --expect-host must match its host (the refusal does not say what the host is) and --non-production must be given,
 *     every time, dry run included;
 *   • the database must be brand new: no table in any non-system schema, and nothing in the migration journal;
 *   • --through must be exact (a four-digit number such as 0009, or a full migration name) and must leave at least one
 *     migration for the atomic runner to apply;
 *   • only the host is ever printed; every error is one line scrubbed of the connection string and password.
 * Never point this at production: production already has these migrations, and the emptiness check would refuse it.
 *
 * The logic lives in db/prepare-cli.ts (tested with a fake driver); this file only supplies the real drivers.
 * Run with Node's native TypeScript support:  node db/prepare-rehearsal.mts
 */

import { resolve } from 'node:path';
import { installSafeErrorOutput } from './atomic-migration.ts';
import { runPrepareCli } from './prepare-cli.ts';

installSafeErrorOutput(); // any error that escapes prints one scrubbed line, never Node's dump of the error object

const code = await runPrepareCli({
  args: process.argv.slice(2),
  databaseUrl: process.env.DATABASE_URL?.trim(),
  migrationsFolder: resolve(import.meta.dirname, 'migrations'),
  connect: async (url) => {
    if (url === null) {
      const { PGlite } = await import('@electric-sql/pglite');
      const { drizzle } = await import('drizzle-orm/pglite');
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      const pg = new PGlite();
      const db = drizzle(pg);
      return {
        query: async (text) => (await pg.query<Record<string, unknown>>(text)).rows,
        migrate: (folder) => migrate(db, { migrationsFolder: folder }),
        close: () => pg.close(),
      };
    }
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    const { migrate } = await import('drizzle-orm/neon-http/migrator');
    const sql = neon(url);
    const db = drizzle(sql);
    return {
      query: async (text) => (await sql.query(text)) as Record<string, unknown>[],
      migrate: (folder) => migrate(db, { migrationsFolder: folder }),
    };
  },
  io: { out: (line) => console.log(line), err: (line) => console.error(line) },
});
process.exitCode = code; // not process.exit(): see installSafeErrorOutput (Windows + the Neon driver's open sockets)
