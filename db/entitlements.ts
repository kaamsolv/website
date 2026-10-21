/**
 * Entitlement resolution — "what may this user do right now?" (CLAUDE.md §25).
 *
 * Computed on every request from `plan_features`, never copied into a table of
 * its own: a signed-in user gets the `free_account` plan; each subscription
 * that is `active` and inside its period adds its plan. So a lapsed or missed
 * webhook can't leave stale access behind, and a manual grant is one row.
 *
 * Framework-free; takes an explicit `db` like the rest of db/.
 */

import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { ENTITLEMENT_KEYS, type EntitlementKey, type ResolvedEntitlements } from '../app/lib/entitlements.ts';
import type { Db } from './links.ts';
import { planFeatures, subscriptions } from './schema.ts';

export const FREE_ACCOUNT_PLAN = 'free_account';

const KNOWN = new Set<string>(ENTITLEMENT_KEYS);

/** Merge plan rows: a key's limit is the most generous one granted (null = unlimited). */
export function mergeFeatures(rows: readonly { featureKey: string; limitValue: number | null }[]): ResolvedEntitlements {
  const limits: Partial<Record<EntitlementKey, number | null>> = {};
  for (const row of rows) {
    if (!KNOWN.has(row.featureKey)) continue;
    const key = row.featureKey as EntitlementKey;
    const prev = limits[key];
    if (!(key in limits)) limits[key] = row.limitValue;
    else if (prev !== null) limits[key] = row.limitValue === null ? null : Math.max(prev as number, row.limitValue);
  }
  return { keys: Object.keys(limits) as EntitlementKey[], limits };
}

/** Anonymous visitors get nothing server-side (the free tool needs no entitlement). */
export async function getEntitlements(db: Db, userId: string | null, now: Date = new Date()): Promise<ResolvedEntitlements> {
  if (!userId) return { keys: [], limits: {} };

  const free = await db
    .select({ featureKey: planFeatures.featureKey, limitValue: planFeatures.limitValue })
    .from(planFeatures)
    .where(eq(planFeatures.planKey, FREE_ACCOUNT_PLAN));

  const paid = await db
    .select({ featureKey: planFeatures.featureKey, limitValue: planFeatures.limitValue })
    .from(subscriptions)
    .innerJoin(planFeatures, eq(planFeatures.planKey, subscriptions.planKey))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
        or(isNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, sql`${now.toISOString()}::timestamptz`)),
      ),
    );

  return mergeFeatures([...free, ...paid]);
}
