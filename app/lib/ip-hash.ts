/**
 * Salted IP hashing — how KaamKit tells callers apart without storing who they
 * are. Used for rate-limit keys, `links.created_ip_hash` and
 * `link_reports.reporter_ip_hash`. The raw IP is never persisted or logged.
 *
 * Framework-free; uses Web Crypto (Node 18+, Vercel, Cloudflare Workers).
 */

/** Used only off-platform (local dev, tests). Never valid on Vercel. */
const LOCAL_DEV_SALT = 'kaamkit-local-dev-salt';

/**
 * The salt for this environment.
 *
 * On Vercel `KK_IP_HASH_SALT` is required: rate limiting depends on it, and a
 * silent fallback to a well-known salt would make the hashes reversible for
 * anyone who reads this file. Missing → throw, with a message that says what to
 * set. Locally a fixed dev salt keeps setup at zero.
 */
export function resolveIpHashSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.KK_IP_HASH_SALT?.trim();
  if (salt) return salt;
  if (env.VERCEL) {
    throw new Error(
      `KK_IP_HASH_SALT is not set for this deployment (VERCEL_ENV=${env.VERCEL_ENV ?? 'unknown'}). ` +
        'Set it on the matching Vercel environment and REDEPLOY — rate limiting depends on it.',
    );
  }
  return LOCAL_DEV_SALT;
}

/** Hex SHA-256 of `ip + salt`. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}${salt}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The client IP as Vercel reports it. Vercel sets `x-forwarded-for` itself, so
 * on-platform the first entry is trustworthy; off-platform it can be spoofed,
 * which only matters for local testing. `'local'` when absent.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim() || 'local';
  return headers.get('x-real-ip')?.trim() || 'local';
}
