/**
 * What a short-link click records — and, just as importantly, what it doesn't.
 *
 * Framework-free (no `next/*`, no DOM) so a future Cloudflare Worker can reuse
 * it. Works on any object with a `get(name)` header accessor.
 *
 * Captured per click (docs/products/url-shortener.md §9), and nothing else:
 *   - device class   — a coarse bucket derived from the User-Agent
 *   - referrer host  — hostname only, never the full referring URL
 *   - country        — ISO-3166 alpha-2 from the platform's geo header
 *   - timestamp      — set by the database
 *
 * Deliberately NOT captured: IP address, the raw User-Agent, the full referrer
 * URL (paths and query strings can carry personal data), city/region, cookies.
 */

export const DEVICE_CLASSES = ['desktop', 'mobile', 'tablet', 'bot', 'unknown'] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export type ClickMeta = {
  deviceClass: DeviceClass;
  referrerHost: string | null;
  country: string | null;
};

type HeaderReader = { get(name: string): string | null };

/**
 * Link-preview fetchers, crawlers and scripted clients. A heuristic, not a
 * guarantee — it exists so previews generated when someone *pastes* a link
 * (Slack, WhatsApp, iMessage…) don't count as people clicking it. In-app
 * browsers (Facebook `FBAN`, Instagram, `LinkedInApp`) are humans and are not
 * matched: the tokens below name the fetchers specifically.
 */
const BOT_UA =
  /(bot|crawl|spider|slurp)\b|facebookexternalhit|embedly|skypeuripreview|whatsapp\/|pinterest\/|bingpreview|google-pagerenderer|headlesschrome|lighthouse|slack-imgproxy|^curl\/|^wget\/|python-requests|python-urllib|go-http-client|node-fetch|axios\/|okhttp|libwww-perl/i;
const TABLET_UA = /ipad|tablet|kindle|silk\/|playbook/i;
const MOBILE_UA = /mobi|iphone|ipod|android|windows phone|blackberry|opera mini/i;

export function deviceClassFromUserAgent(ua: string | null | undefined): DeviceClass {
  const value = (ua ?? '').trim();
  if (!value) return 'unknown';
  if (BOT_UA.test(value)) return 'bot';
  // Android tablets omit "Mobile"; Android phones include it.
  if (TABLET_UA.test(value) || (/android/i.test(value) && !/mobile/i.test(value))) return 'tablet';
  if (MOBILE_UA.test(value)) return 'mobile';
  return 'desktop';
}

const MAX_HOST_LENGTH = 253;

/** Hostname of an http(s) `Referer`, lower-cased. Anything else → null. */
export function referrerHostFrom(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    return host && host.length <= MAX_HOST_LENGTH ? host : null;
  } catch {
    return null;
  }
}

/** A two-letter country code, or null. Region and city are never read. */
export function countryFrom(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * The click to record for this request, or `null` when the request isn't a
 * click at all:
 *   - `HEAD` — Next.js answers HEAD by running the GET handler, and link
 *     unfurlers use HEAD to probe a URL without following it.
 *   - browser prefetch / prerender (`Sec-Purpose` / `Purpose` headers) — the
 *     user hasn't gone anywhere yet.
 */
export function clickMetaFromRequest(method: string, headers: HeaderReader): ClickMeta | null {
  if (method.toUpperCase() !== 'GET') return null;

  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''}`;
  if (/prefetch|prerender/i.test(purpose)) return null;

  return {
    deviceClass: deviceClassFromUserAgent(headers.get('user-agent')),
    referrerHost: referrerHostFrom(headers.get('referer')),
    // Set by Vercel on every request. Absent locally, which is fine.
    country: countryFrom(headers.get('x-vercel-ip-country')),
  };
}
