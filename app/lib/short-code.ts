/**
 * Short-code generation for the KaamSolv URL Shortener.
 *
 * Alphabet: Base62 (`0-9A-Za-z`) — pasted, not typed, so ambiguous glyphs
 * are not excluded.
 *
 * Uniqueness / collision strategy (implemented at the DB layer in Phase 2a,
 * stated here so the generator stays dumb):
 *   - `links.short_code` carries a UNIQUE constraint — the database is the
 *     single arbiter of uniqueness, never an in-app "is it taken?" check.
 *   - On insert conflict, `POST /api/shorten` regenerates and retries
 *     (up to `MAX_ATTEMPTS`), then increases `length` by one and keeps going.
 *   - `DEFAULT_LENGTH` is a runtime constant, not an architectural
 *     assumption. At length 7 the space is 62^7 ≈ 3.5e12; the birthday
 *     collision probability stays below ~1e-6 well past a million links, and
 *     the retry loop makes the system self-healing regardless of length.
 *   - Codes are random (CSPRNG), so sequential IDs are never exposed and
 *     trivial enumeration is impractical.
 *
 * Framework-free (no `next/*`, no DOM). Uses the Web Crypto API, which is
 * available in Node 18+, Vercel functions, and Cloudflare Workers alike.
 */

export const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const DEFAULT_LENGTH = 7;
export const MIN_LENGTH = 4;
export const MAX_LENGTH = 32;

/** Suggested regenerate-and-retry budget before bumping the length. */
export const MAX_ATTEMPTS = 5;

const CODE_SHAPE = new RegExp(`^[0-9A-Za-z]{${MIN_LENGTH},${MAX_LENGTH}}$`);

/**
 * Unbiased Base62 code via rejection sampling over the crypto byte stream
 * (256 is not a multiple of 62, so raw `byte % 62` would skew toward the
 * first 8 symbols).
 */
export function generateShortCode(length: number = DEFAULT_LENGTH): string {
  const len = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, Math.floor(length)));
  const out: string[] = [];
  const max = 256 - (256 % BASE62.length); // 248 — reject bytes >= this

  while (out.length < len) {
    const bytes = new Uint8Array(len - out.length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= max) continue;
      out.push(BASE62[b % BASE62.length]);
      if (out.length === len) break;
    }
  }
  return out.join('');
}

/** Is this string shaped like a short code at all? (routing / slug checks) */
export function isValidShortCodeShape(code: string): boolean {
  return CODE_SHAPE.test(code);
}
