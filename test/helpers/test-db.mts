/**
 * A throwaway in-memory PGlite database with the real migrations applied.
 * Real Postgres (WASM), exact schema parity with Neon — the approved local /
 * test approach (docs/infra/deployment.md §1).
 */

import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../db/schema.ts';
import type { Db } from '../../db/links.ts';

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../../db/migrations');

export async function makeTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db: db as unknown as Db,
    close: () => client.close(),
  };
}
