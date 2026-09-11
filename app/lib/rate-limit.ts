/**
 * Rate limits for anonymous use — the one place the numbers live.
 *
 * Framework-free. The counting itself happens in Postgres (db/rate-limits.ts)
 * so limits are shared across instances and survive redeploys; this module only
 * describes *what* to count.
 *
 * `ANONYMOUS_LIMITS` is the seed of the future entitlement boundary
 * (docs/kaamkit-phase0-architecture.md §7): when accounts exist, a signed-in
 * plan swaps in its own table here instead of limits being scattered through
 * route handlers.
 *
 * `scope` is part of every key so another product (e.g. dynamic QR creation)
 * can reuse the same limiter later without sharing a counter with this one.
 */

export type RateLimitRule = { limit: number; windowSeconds: number; window: string };

export const ANONYMOUS_LIMITS = {
  /** Creating short links. */
  create: [
    { limit: 12, windowSeconds: 60, window: '1m' },
    { limit: 100, windowSeconds: 24 * 60 * 60, window: '1d' },
  ],
  /** Reporting a link. */
  report: [{ limit: 5, windowSeconds: 60 * 60, window: '1h' }],
} as const satisfies Record<string, readonly RateLimitRule[]>;

export type RateLimitAction = keyof typeof ANONYMOUS_LIMITS;

export type RateLimitCheck = { key: string; limit: number; windowSeconds: number };

/**
 * One check per window for this action and caller. The caller identity is
 * always a salted hash (app/lib/ip-hash.ts) — never a raw IP.
 */
export function rateLimitChecks(
  scope: string,
  action: RateLimitAction,
  callerHash: string,
): RateLimitCheck[] {
  return ANONYMOUS_LIMITS[action].map((rule) => ({
    key: `${scope}:${action}:${rule.window}:${callerHash}`,
    limit: rule.limit,
    windowSeconds: rule.windowSeconds,
  }));
}

/** Whole seconds until a window resets, never less than 1. */
export function retryAfterSeconds(resetAt: Date, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
}
