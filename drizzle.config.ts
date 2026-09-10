/**
 * drizzle-kit configuration — schema → SQL migrations.
 *
 *   npm run db:generate   create a migration from a db/schema.ts change
 *   npm run db:migrate    apply pending migrations (see db/migrate.mts)
 *
 * `db:generate` needs only the schema file, no database connection.
 * `dbCredentials` is populated from DATABASE_URL when present so
 * `drizzle-kit studio` / `push` work against Neon; it is never required.
 */

import type { Config } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

export default {
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './db/migrations',
  strict: true,
  verbose: true,
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
} satisfies Config;
