/**
 * Destination-URL validation for the KaamSolv URL Shortener.
 *
 * Runs on the shorten path (`POST /api/shorten`). Goals, in order:
 *   1. never accept something that becomes an unsafe redirect
 *   2. reject clearly-broken input with a message a human can act on
 *   3. normalise lightly so equivalent links don't create noise
 *
 * Deliberately framework-free (no `next/*`, no DOM) so it can move into the
 * shared `packages/link-core` in Phase 2a and be imported by both the Vercel
 * app and the Cloudflare Worker.
 */

export const MAX_URL_LENGTH = 2048;

/** Only these schemes ever produce a redirect. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Hosts we must never redirect to (SSRF-ish / internal-routing hygiene). */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '169.254.169.254', // cloud instance metadata
  'metadata.google.internal',
]);

/** Our own short-link hosts — shortening one of our short links is a loop. */
const OWN_HOSTS = new Set(['kaamsolv.com', 'www.kaamsolv.com']);

export type UrlValidationOk = { ok: true; normalized: string; hostname: string };

export type UrlValidationErrorReason =
  | 'empty'
  | 'too_long'
  | 'unparseable'
  | 'unsupported_scheme'
  | 'has_credentials'
  | 'blocked_host'
  | 'private_host'
  | 'self_reference'
  | 'control_chars';

export type UrlValidationError = { ok: false; reason: UrlValidationErrorReason };
export type UrlValidationResult = UrlValidationOk | UrlValidationError;

/** RFC-1918 / loopback / link-local ranges, checked against a literal IPv4 host. */
function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (isPrivateIpv4(h)) return true;
  if (h === '[::1]' || h === '[::]' || h === '::1') return true;
  return false;
}

/** A short-code path segment shape — used to spot "shorten my own short link". */
const SHORT_CODE_PATH = /^\/[0-9A-Za-z]{4,32}\/?$/;

/** C0 control chars, DEL, or any whitespace anywhere in the value. */
function hasControlOrWhitespace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Bare-domain heuristic — `example.com`, `sub.example.co.uk/path`, not `foo`. */
const BARE_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/.*)?$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Accepts a raw string from the URL field. Adds `https://` only when the
 * input has no scheme *and* looks like a bare domain — never for ambiguous
 * or scheme-bearing input (so `javascript:…` can't be smuggled through).
 */
export function validateDestinationUrl(raw: string): UrlValidationResult {
  const input = (raw ?? '').trim();

  if (!input) return { ok: false, reason: 'empty' };
  if (input.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' };
  if (hasControlOrWhitespace(input)) return { ok: false, reason: 'control_chars' };

  const candidate = !HAS_SCHEME.test(input) && BARE_DOMAIN.test(input) ? `https://${input}` : input;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: 'unsupported_scheme' };
  if (url.username || url.password) return { ok: false, reason: 'has_credentials' };

  const hostname = url.hostname.toLowerCase();
  if (!hostname || !hostname.includes('.')) return { ok: false, reason: 'blocked_host' };
  if (isPrivateOrLocalHost(hostname)) return { ok: false, reason: 'private_host' };

  if (OWN_HOSTS.has(hostname) && SHORT_CODE_PATH.test(url.pathname)) {
    return { ok: false, reason: 'self_reference' };
  }

  // Light normalisation: lowercase host, drop default ports. Path/query/hash kept as given.
  url.hostname = hostname;
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  const normalized = url.toString();
  if (normalized.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' };

  return { ok: true, normalized, hostname };
}

/** One friendly sentence per failure — KaamSolv voice, plain English. */
export function messageForReason(reason: UrlValidationErrorReason): string {
  switch (reason) {
    case 'empty':
      return 'Paste a URL to shorten.';
    case 'too_long':
      return 'That URL is too long. Try a shorter link.';
    case 'unsupported_scheme':
      return 'We can only shorten http and https links.';
    case 'has_credentials':
      return "That link has a username or password in it — we can't shorten those.";
    case 'private_host':
    case 'blocked_host':
      return "That address can't be reached from the open web.";
    case 'self_reference':
      return "That's already a KaamSolv short link.";
    case 'control_chars':
    case 'unparseable':
    default:
      return "That doesn't look like a valid URL. Check the link and try again.";
  }
}
