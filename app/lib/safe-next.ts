/**
 * `?next=` after sign-in: only a path on this site, never another origin
 * (no open redirect). Framework-free.
 */

export const DEFAULT_AFTER_SIGN_IN = '/app/invoices';

export function safeNextPath(input: unknown, fallback: string = DEFAULT_AFTER_SIGN_IN): string {
  if (typeof input !== 'string' || input.length > 512) return fallback;
  // One leading slash, then not a second slash or backslash ("//evil.com", "/\evil.com").
  if (!/^\/(?![/\\])/.test(input)) return fallback;
  // No control characters (a tab or newline can turn "/\t/evil.com" into "//evil.com").
  if (/[\u0000-\u001f\u007f\\]/.test(input)) return fallback;
  try {
    const url = new URL(input, 'https://kaamsolv.invalid');
    if (url.origin !== 'https://kaamsolv.invalid') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
