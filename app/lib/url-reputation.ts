/**
 * URL reputation screening — Google Web Risk, Lookup API (`uris.search`).
 *
 * Why Web Risk: Google's Safe Browsing API is licensed for non-commercial use
 * only and points commercial users to Web Risk (developers.google.com/safe-browsing/v4).
 * Pricing at the time of writing: free up to 100,000 lookups/month, then
 * $0.50 / 1,000 (cloud.google.com/web-risk/pricing). Needs a Google Cloud
 * project with billing enabled, the Web Risk API enabled, and an API key.
 *
 * Contract (docs/products/url-shortener.md §7):
 *   - `unsafe`       → the caller refuses the link.
 *   - `safe`         → the caller records `screened_at`.
 *   - `unavailable`  → FAIL OPEN: the caller allows the link, logs, and leaves
 *   - `not_configured`  `screened_at` null so it can be re-screened later.
 *
 * Privacy: the Lookup API sends the full destination URL to Google.
 * Security: the API key travels in the query string — redactSecrets() in
 * log-error.ts scrubs `key=` before anything is logged.
 *
 * Framework-free; takes an injectable `fetch` so it's testable and reusable
 * (e.g. by dynamic QR creation later) without coupling.
 */

export const WEB_RISK_ENDPOINT = 'https://webrisk.googleapis.com/v1/uris:search';

/** The standard lists. `SOCIAL_ENGINEERING_EXTENDED_COVERAGE` is left out: its
 *  availability for uris.search isn't documented. */
export const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'] as const;

export const DEFAULT_TIMEOUT_MS = 1500;

export type ScreenResult =
  | { status: 'safe' }
  | { status: 'unsafe'; threatTypes: string[] }
  | { status: 'unavailable'; reason: string }
  | { status: 'not_configured' };

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export async function screenUrl(
  url: string,
  options: { apiKey?: string | null; fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<ScreenResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return { status: 'not_configured' };

  const params = new URLSearchParams();
  params.set('uri', url);
  for (const t of THREAT_TYPES) params.append('threatTypes', t);
  params.set('key', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike);

  try {
    const res = await doFetch(`${WEB_RISK_ENDPOINT}?${params}`, { signal: controller.signal });
    if (!res.ok) return { status: 'unavailable', reason: `http_${res.status}` };

    const body = (await res.json()) as { threat?: { threatTypes?: unknown } } | null;
    const types = body?.threat?.threatTypes;
    if (Array.isArray(types) && types.length > 0) {
      return { status: 'unsafe', threatTypes: types.map(String) };
    }
    // `{}` is Web Risk's "no match".
    return { status: 'safe' };
  } catch (err) {
    const aborted = controller.signal.aborted;
    return { status: 'unavailable', reason: aborted ? 'timeout' : errorName(err) };
  } finally {
    clearTimeout(timer);
  }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : 'error');
