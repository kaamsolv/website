/**
 * Affiliate Manager, Phase 3A: referral links and the programme's destination (docs/products/affiliate-manager.md).
 *
 * Framework-free (imports use `.ts` so plain-Node operator commands can load it). An affiliate's link is
 * `kaamsolv.com/{business-slug}/{code}`. The destination is where a visitor lands, set once per programme by the
 * business: never read from the link, so a link can't be pointed anywhere else.
 */

import { checkDestinationPolicy } from '../destination-policy.ts';
import { generateShortCode } from '../short-code.ts';
import { validateDestinationUrl } from '../url-validation.ts';

export const LINK_CODE_LENGTH = 8;
export const LINK_DESTINATION_MAX = 500;
/** The query parameter added to the destination so the store's own tools (and, later, a connector) can see who sent the visitor. */
export const REF_PARAM = 'ref';
/** The public host a link shows. */
export const LINK_HOST = 'kaamsolv.com';

const CODE_RE = /^[0-9A-Za-z]{6,12}$/;
export const isLinkCodeShape = (code: string): boolean => CODE_RE.test(code);
export const generateLinkCode = (): string => generateShortCode(LINK_CODE_LENGTH);

/** What an affiliate copies. */
export const linkPath = (slug: string, code: string): string => `/${slug}/${code}`;
export const linkLabel = (slug: string, code: string): string => `${LINK_HOST}${linkPath(slug, code)}`;

export type DestinationCheck = { ok: true; value: string } | { ok: false; error: string; message: string };

/**
 * The programme's destination: where visitors land. Blank is allowed (links then lead to the programme page).
 * https only; no passwords in the address; nothing private or local; not KaamSolv itself; no open URL shorteners.
 */
export function cleanDestination(input: unknown): DestinationCheck {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { ok: true, value: '' };
  if (raw.length > LINK_DESTINATION_MAX) {
    return { ok: false, error: 'destination_long', message: `That address is too long. Keep it under ${LINK_DESTINATION_MAX} characters.` };
  }
  const bad = (error: string, message: string): DestinationCheck => ({ ok: false, error, message });
  const checked = validateDestinationUrl(raw);
  if (!checked.ok) {
    return bad('destination_invalid', 'That doesn’t look like a web address. Try something like https://yourstore.com.');
  }
  const url = new URL(checked.normalized);
  if (url.protocol !== 'https:') return bad('destination_https', 'Use an https address, like https://yourstore.com.');
  const host = checked.hostname;
  if (host === LINK_HOST || host.endsWith(`.${LINK_HOST}`)) {
    return bad('destination_self', 'That’s a KaamSolv address. Add your own store or page.');
  }
  if (!checkDestinationPolicy(host).ok) {
    return bad('destination_shortener', 'Use your store’s own address, not a link-shortener address.');
  }
  return checked.normalized.length <= LINK_DESTINATION_MAX
    ? { ok: true, value: checked.normalized }
    : bad('destination_long', `That address is too long. Keep it under ${LINK_DESTINATION_MAX} characters.`);
}

/** The destination with `?ref=CODE` added; any query or #fragment already there is kept, and an existing `ref` is replaced. */
export function withRef(destination: string, code: string): string {
  const url = new URL(destination);
  url.searchParams.set(REF_PARAM, code);
  return url.toString();
}

/** Plain words for the "recorded clicks" figure. It counts requests we recorded, not people. */
export const CLICKS_NOTE =
  'Counts the clicks we recorded on your link. Previews that apps like WhatsApp fetch are skipped when we can tell, but this isn’t a count of people or of different visitors.';

export type ClickCounts = { days7: number; days30: number; all: number };
export const NO_CLICKS: ClickCounts = { days7: 0, days30: 0, all: 0 };
