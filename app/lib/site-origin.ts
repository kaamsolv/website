import { SITE_ORIGIN } from './site-urls';

/** KaamSolv's public address: the configured one, else the live site (production) or localhost. */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  return env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || (process.env.NODE_ENV === 'production' ? SITE_ORIGIN : 'http://localhost:3000');
}
