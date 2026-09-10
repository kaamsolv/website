/**
 * Database client for the KaamKit URL Shortener.
 *
 * Driver selection is by environment, never by code branch in a tool:
 *
 *   - `DATABASE_URL` set   → Neon over HTTP (`@neondatabase/serverless`).
 *                            Used on Vercel Production and Preview. HTTP, so it
 *                            is fine on both the Node and (legacy) Edge runtime.
 *   - `DATABASE_URL` unset → PGlite (real Postgres in WASM), persisted to
 *                            `.pglite/` so links survive `next dev` restarts.
 *                            Local development only.
 *
 * `DATABASE_URL` is a server secret. This module is server-only — it must never
 * be imported from a Client Component. Nothing here reads `NEXT_PUBLIC_*`.
 *
 * Tests do not use this module; they build their own in-memory PGlite instance
 * (see test/helpers/test-db.mts) for full isolation.
 */

import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import * as schema from './schema.ts';
import type { Db } from './links.ts';

const PGLITE_DIR = '.pglite';

// Cache the instance across HMR reloads in dev (each reload re-evaluates the
// module, and PGlite holds an exclusive lock on its data directory).
const globalForDb = globalThis as unknown as { __kkDb?: Promise<Db> };

async function createClient(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    return drizzleNeon(url, { schema }) as unknown as Db;
  }

  // Local dev fallback. Imported dynamically so the production bundle (which
  // always has DATABASE_URL) never needs the PGlite WASM payload.
  const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
  ]);

  const pg = new PGlite(PGLITE_DIR);
  return drizzlePglite(pg, { schema }) as unknown as Db;
}

/** The shared Drizzle instance. `await` it — the PGlite path is async. */
export function getDb(): Promise<Db> {
  globalForDb.__kkDb ??= createClient();
  return globalForDb.__kkDb;
}
