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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'migrations');

// Load .env.local / .env for local runs (Next does this for the app, not for
// standalone scripts). No dependency — a tiny hand parser is enough here.
for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

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
