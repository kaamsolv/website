/**
 * Free daily limit for the Image Kit converters and the compressor.
 *
 * Framework-free: the server route and the browser both read it. Enforced on
 * the server by a per-day counter keyed on the salted IP hash (see
 * app/api/image-quota). The image itself is never sent, only the count.
 */

/** Files a visitor can convert each day without signing in. */
export const FREE_DAILY_IMAGE_LIMIT = 25;

/**
 * Files a signed-in person can convert each day. Owner's rule: after the free
 * 25, sign in. 100 is a placeholder number, to be confirmed by the owner.
 */
export const SIGNED_IN_DAILY_IMAGE_LIMIT = 100;

/** Scope for the shared rate-limit table, so the counter never mixes with another product's. */
export const IMAGE_QUOTA_SCOPE = 'image-quota';

/**
 * The calendar day in India time (UTC+5:30, no daylight saving), as YYYY-MM-DD.
 * The counter key includes it, so the free day restarts at midnight IST.
 */
export function indiaDayKey(now: number = Date.now()): string {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
