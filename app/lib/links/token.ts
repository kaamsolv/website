/**
 * Invoice link tokens. A token is 22 URL-safe characters (132 bits) derived from the link's own id and a
 * server secret, so it can't be guessed and can't be worked out from an id. The database keeps only the
 * token's SHA-256, and the same URL can be rebuilt later (to resend an email) without storing the token.
 *
 * Rotating BETTER_AUTH_SECRET changes every derived token, so existing links would stop opening: treat a
 * rotation as "revoke all invoice links" (docs/products/billing.md).
 */

import { isProductionServer } from '../runtime-platform';

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The server secret for deriving tokens. Dev and tests get a fixed one; production must have the real secret. */
export function linkSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  if (isProductionServer()) throw new Error('BETTER_AUTH_SECRET is not set; invoice links can not be made.');
  return 'kk-local-dev-invoice-link-secret';
}

export async function deriveToken(secret: string, linkId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`kk-invoice-link:${linkId}`)));
  return base64url(mac).slice(0, 22);
}

export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cheap shape check before touching the database: a wrong-looking token is a miss, never a query. */
export const isTokenShape = (s: string): boolean => /^[A-Za-z0-9_-]{22}$/.test(s);
