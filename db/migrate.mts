/**
 * Migration runner — `npm run db:migrate`.
 *
 *   DATABASE_URL set   → applies db/migrations/ to that Neon database
 *   DATABASE_URL unset → applies them to the local PGlite store (.pglite/)
 *
 * Production migrations are a deliberate manual step (docs/infra/deployment.md
 * §7): run this against the Neon primary before/with the deploy that needs it.
 * It is never part of the Vercel build.
 *
 * Run with Node's native TypeScript support:  node db/migrate.mts
 */

import { resolve } from 'node:path';
import { describeDatabaseTarget, loadLocalEnv } from './load-env.mts';

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'migrations');

loadLocalEnv();
console.log(`Target: ${describeDatabaseTarget()}`);

const url = process.env.DATABASE_URL;

if (url) {
  const { neon } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-http');
  const { migrate } = await import('drizzle-orm/neon-http/migrator');
  const db = drizzle(neon(url));
  console.log('Applying migrations to Neon…');
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const db = drizzle(new PGlite('.pglite'));
  console.log('Applying migrations to local PGlite (.pglite/)…');
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

console.log('Migrations applied.');
