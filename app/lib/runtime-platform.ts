/**
 * Where is this code running, for the few places where the host decides which
 * request headers can be trusted (client IP, country).
 *
 * Framework-free. Cloudflare Workers sets `navigator.userAgent` to
 * 'Cloudflare-Workers' (compatibility flag `global_navigator`, on by default);
 * Node reports 'Node.js/<version>'. Detected rather than configured, so a
 * missing setting can never select the spoofable header on Cloudflare.
 */
export function isCloudflareWorkers(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

/**
 * True for a deployed/production server: `NODE_ENV=production` (set by
 * `next build`/`next start`, Vercel, and OpenNext on Workers) or `VERCEL`.
 * False under `next dev` and the test runner — the only places where the local
 * fallbacks (dev salt, PGlite) are allowed.
 */
export function isProductionServer(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.VERCEL);
}

/** A short, secret-free label for error messages. */
export function deploymentLabel(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL) return `VERCEL_ENV=${env.VERCEL_ENV ?? 'unknown'}`;
  return isCloudflareWorkers() ? 'Cloudflare Workers' : `NODE_ENV=${env.NODE_ENV ?? 'unset'}`;
}
