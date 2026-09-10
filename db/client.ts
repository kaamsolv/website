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
 *                            **Local development only** — on Vercel a missing
 *                            `DATABASE_URL` throws with an actionable message
 *                            instead, because PGlite cannot write to a
 *                            read-only filesystem and a silent fallback turns a
 *                            config mistake into an unreadable 500.
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
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    // Catch a truncated or quote-wrapped paste here, with a message that says
    // what to look at — rather than letting the driver fail obscurely later.
    if (!/^postgres(ql)?:\/\//i.test(url)) {
      throw new Error(
        'DATABASE_URL is set but is not a postgres:// connection string. ' +
          'Check the environment settings for a truncated or quoted value.',
      );
    }
    return drizzleNeon(url, { schema }) as unknown as Db;
  }

  // No DATABASE_URL. On a deployed environment that is always a
  // misconfiguration, and the PGlite fallback below cannot work there anyway
  // (read-only filesystem) — so fail loudly instead of failing obscurely.
  if (process.env.VERCEL) {
    throw new Error(
      `DATABASE_URL is not set for this deployment (VERCEL_ENV=${
        process.env.VERCEL_ENV ?? 'unknown'
      }). Set it on the matching Vercel environment and REDEPLOY — Vercel binds ` +
        'environment variables when a deployment is created, so editing the ' +
        'variable does not affect deployments that already exist.',
    );
  }

  // Genuine local development. Imported dynamically so a deployed bundle
  // (which always has DATABASE_URL) never needs the PGlite WASM payload.
  const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
  ]);

  const pg = new PGlite(PGLITE_DIR);
  return drizzlePglite(pg, { schema }) as unknown as Db;
}

/** The shared Drizzle instance. `await` it — the PGlite path is async. */
export function getDb(): Promise<Db> {
  globalForDb.__kkDb ??= createClient().catch((err: unknown) => {
    // Never cache a failed connection: without this one transient failure
    // wedges the whole instance, since every later request awaits the same
    // rejected promise. Clearing it lets the next request try again.
    globalForDb.__kkDb = undefined;
    throw err;
  });
  return globalForDb.__kkDb;
}
