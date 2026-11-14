/**
 * Small server helpers shared by the affiliate API routes. Server only.
 */

import { fail } from '@/app/lib/api-response';
import { hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { rateLimitChecks, retryAfterSeconds, type RateLimitAction, type RateLimitCheck } from '@/app/lib/rate-limit';
import type { Db } from '@/db/links';
import { consumeRateLimits } from '@/db/rate-limits';

/** Spends one unit of each named limit; returns a ready 429 if any is used up, otherwise null. Keys are salted hashes. */
export async function overLimit(db: Db, checks: { action: RateLimitAction; who: string }[], message: string): Promise<Response | null> {
  const salt = resolveIpHashSalt();
  const all: RateLimitCheck[] = [];
  for (const c of checks) all.push(...rateLimitChecks('affiliate', c.action, await hashIp(c.who, salt)));
  const rate = await consumeRateLimits(db, all);
  if (rate.allowed) return null;
  const res = fail(429, 'rate_limited', message);
  res.headers.set('Retry-After', String(retryAfterSeconds(rate.resetAt)));
  return res;
}
