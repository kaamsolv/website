/**
 * Shared, database-backed fixed-window rate limiting (2b.2).
 *
 * Replaces the Phase 1 in-memory limiter, which reset on every deploy and was
 * per-instance. Postgres is the single source of truth, so limits hold across
 * instances and restarts — without introducing Redis (deferred).
 *
 * One statement, one round trip: a multi-row upsert that, per key, either
 * starts a fresh window (count = 1) or increments the live one, and RETURNs the
 * resulting counts. Concurrent requests serialise on the row lock, so counts
 * are exact. What to count lives in app/lib/rate-limit.ts.
 */

import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { RateLimitCheck } from '../app/lib/rate-limit.ts';
import type { Db } from './links.ts';
import { rateLimits } from './schema.ts';

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; resetAt: Date };

export async function consumeRateLimits(
  db: Db,
  checks: readonly RateLimitCheck[],
): Promise<RateLimitDecision> {
  if (checks.length === 0) return { allowed: true };

  const rows = await db
    .insert(rateLimits)
    .values(
      checks.map((c) => ({
        key: c.key,
        count: 1,
        resetAt: sql`now() + (${c.windowSeconds}::double precision * interval '1 second')`,
      })),
    )
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // The existing row is `rate_limits`; the proposed one is `excluded`.
        count: sql`case when ${rateLimits.resetAt} <= now() then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= now() then excluded.reset_at else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ key: rateLimits.key, count: rateLimits.count, resetAt: rateLimits.resetAt });

  // Any exceeded window blocks; report the latest reset so a retry won't just
  // hit the next window's limit.
  let blockedUntil: Date | null = null;
  for (const row of rows) {
    const check = checks.find((c) => c.key === row.key);
    if (check && row.count > check.limit && (!blockedUntil || row.resetAt > blockedUntil)) {
      blockedUntil = row.resetAt;
    }
  }
  return blockedUntil ? { allowed: false, resetAt: blockedUntil } : { allowed: true };
}

/**
 * Delete windows that ended over an hour ago. Called occasionally from `after()`
 * so the table stays small without a cron job. Never throws.
 */
export async function pruneRateLimits(db: Db): Promise<void> {
  try {
    await db.delete(rateLimits).where(lt(rateLimits.resetAt, sql`now() - interval '1 hour'`));
  } catch {
    // Housekeeping only.
  }
}

/**
 * How many times a key was counted in its live window. Reads only; a window
 * that has already ended counts as 0. Used for the image daily cap, which
 * shows the count without spending one.
 */
export async function readRateLimitCount(db: Db, key: string): Promise<number> {
  const rows = await db
    .select({ count: rateLimits.count, resetAt: rateLimits.resetAt })
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .limit(1);
  const row = rows[0];
  if (!row || row.resetAt.getTime() <= Date.now()) return 0;
  return row.count;
}

/**
 * Undo one count on a live window, for a file that was counted but then
 * didn't convert. Never goes below zero.
 */
export async function giveBackRateLimit(db: Db, key: string): Promise<void> {
  await db
    .update(rateLimits)
    .set({ count: sql`${rateLimits.count} - 1` })
    .where(and(eq(rateLimits.key, key), gt(rateLimits.count, 0), gt(rateLimits.resetAt, sql`now()`)));
}
