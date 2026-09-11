/**
 * Destination policy — destinations KaamKit won't shorten, on top of the URL
 * validation in url-validation.ts (which already refuses our own short links,
 * private networks, credentials and non-http(s) schemes).
 *
 * Framework-free and reusable by a future dynamic-QR flow.
 *
 * Other URL shorteners are refused because a chain (kaamkit.com → bit.ly → ?)
 * hides the real destination from screening and from the person clicking; the
 * destination can also be changed later without KaamKit knowing.
 *
 * Only *open, general-purpose* shorteners are listed — services where anyone
 * can point a link anywhere. First-party short domains that only ever lead to
 * their own site (youtu.be, amzn.to, fb.me, wa.me …) are deliberately allowed.
 * t.co and lnkd.in are included: anyone can mint one by posting a link.
 */

const URL_SHORTENER_HOSTS = new Set([
  '1url.com',
  'adf.ly',
  'bit.do',
  'bit.ly',
  'bitly.com',
  'bl.ink',
  'buff.ly',
  'clck.ru',
  'cutt.ly',
  'dub.sh',
  'goo.gl',
  'is.gd',
  'kutt.it',
  'lnkd.in',
  'ow.ly',
  'rb.gy',
  'rebrand.ly',
  's.id',
  'shorte.st',
  'shorturl.at',
  'shorturl.com',
  'soo.gd',
  'surl.li',
  't.co',
  't.ly',
  'tiny.cc',
  'tiny.one',
  'tinyurl.com',
  'trib.al',
  'u.to',
  'v.gd',
]);

export type DestinationPolicyResult = { ok: true } | { ok: false; reason: 'url_shortener' };

/** `hostname` must already be lower-cased (validateDestinationUrl does this). */
export function checkDestinationPolicy(hostname: string): DestinationPolicyResult {
  // Match the host itself and any subdomain of it (e.g. `www.bit.ly`).
  const labels = hostname.replace(/\.$/, '').split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (URL_SHORTENER_HOSTS.has(labels.slice(i).join('.'))) {
      return { ok: false, reason: 'url_shortener' };
    }
  }
  return { ok: true };
}
