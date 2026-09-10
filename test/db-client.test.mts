/**
 * Guards on driver selection in db/client.ts.
 *
 * These cover the failure mode that broke the first Preview deployment: with no
 * DATABASE_URL the client silently fell back to PGlite, which cannot write to a
 * read-only serverless filesystem, so a config mistake surfaced as an
 * unreadable 500 instead of saying what was wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../db/client.ts';

/** getDb() memoises on globalThis; clear it so each case starts cold. */
function resetDbCache() {
  delete (globalThis as { __kkDb?: unknown }).__kkDb;
}

/** Run `fn` with the given env, restoring whatever was there before. */
async function withEnv(
  patch: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetDbCache();
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetDbCache();
  }
}

test('throws an actionable error when DATABASE_URL is missing on Vercel', async () => {
  await withEnv({ DATABASE_URL: undefined, VERCEL: '1', VERCEL_ENV: 'preview' }, async () => {
    await assert.rejects(getDb(), (err: Error) => {
      assert.match(err.message, /DATABASE_URL is not set for this deployment/);
      assert.match(err.message, /VERCEL_ENV=preview/);
      assert.match(err.message, /REDEPLOY/);
      return true;
    });
  });
});

test('rejects a truncated or quote-wrapped DATABASE_URL', async () => {
  await withEnv({ DATABASE_URL: '"postgresql://user@host/db"', VERCEL: '1' }, async () => {
    await assert.rejects(getDb(), /not a postgres:\/\/ connection string/);
  });
});

test('accepts a well-formed connection string without connecting', async () => {
  await withEnv(
    { DATABASE_URL: 'postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require', VERCEL: '1' },
    async () => {
      const db = await getDb();
      assert.ok(db, 'expected a Drizzle instance');
    },
  );
});

test('a failed connection is not cached — the next request retries', async () => {
  await withEnv({ DATABASE_URL: undefined, VERCEL: '1' }, async () => {
    await assert.rejects(getDb());
    // Without clearing the memo, every later call would await the same
    // rejected promise even once the environment is fixed.
    assert.equal((globalThis as { __kkDb?: unknown }).__kkDb, undefined);

    process.env.DATABASE_URL = 'postgresql://u:p@ep-x.aws.neon.tech/neondb';
    assert.ok(await getDb(), 'expected the retry to succeed');
  });
});

// The local PGlite branch is deliberately not exercised here: instantiating it
// writes a .pglite/ directory and holds a lock on it. It is covered in practice
// by every `next dev` run, and the data layer itself is covered against real
// PGlite in db-links.test.mts.
