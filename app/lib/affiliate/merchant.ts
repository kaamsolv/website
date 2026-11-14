/**
 * Affiliate Manager, Phase 1 — the merchant rules (docs/products/affiliate-manager.md).
 *
 * Framework-free: db/schema.ts, the API, the editor and the tests all import it. A merchant is a business that
 * runs an affiliate programme; each owner has exactly one. Its public portal lives at
 * `kaamsolv.com/affiliate/{slug}` (paths, not subdomains: DECISIONS 2026-10-22).
 */

import { isReservedCode } from '../reserved-routes.ts';

export const PORTAL_PREFIX = '/affiliate/';
export const PORTAL_HOST = 'kaamsolv.com';

export const DEFAULT_BRAND_COLOUR = '#FE6336';
export const BRAND_COLOUR_RE = /^#[0-9A-Fa-f]{6}$/;

/** Same ceiling as the invoice logo: a downscaled data URL (≈ 200 KB of image). */
export const MERCHANT_LOGO_MAX_CHARS = 280_000;

export const MERCHANT_LIMITS = { name: 80, programmeName: 80, programmeDescription: 500, terms: 10_000 } as const;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Words that would collide with a route under /affiliate, or read as official KaamSolv pages. */
export const RESERVED_MERCHANT_SLUGS: ReadonlySet<string> = new Set([
  'register', 'login', 'signup', 'logout', 'join', 'apply', 'new', 'edit', 'delete', 'create',
  'admin', 'api', 'app', 'account', 'settings', 'billing', 'dashboard', 'help', 'support', 'status',
  'terms', 'privacy', 'about', 'contact', 'marketplace', 'discover', 'programmes', 'programs',
  'kaamsolv', 'kaamkit', 'official', 'www', 'static', 'assets',
  // Files the app serves from its root (robots.txt, sitemap.xml, icon.svg …), kept so a business can't share their names.
  'robots', 'sitemap', 'icon', 'manifest', 'favicon',
]);

export const MERCHANT_STATUSES = ['active', 'suspended'] as const;
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number];
export const SUSPENDED_REASON_MAX = 300;

/** What an owner is told when an action needs a live programme, or the plan that holds one. */
export const SUSPENDED_OWNER_MESSAGE = 'Your programme is suspended, so this isn’t available right now. Contact us if you think that’s a mistake.';
export const NOT_ALLOWED_MESSAGE = 'Running an affiliate programme isn’t open to every account yet. Contact us and we’ll set you up.';

/**
 * Names a business page must not take, because they would pass for KaamSolv, an official body or a payment provider.
 * Brand names are matched anywhere in the address (nobody has them by accident); the plain words only as a whole word
 * between hyphens, so "riverbank-travel" is fine and "bank-offers" is not. A small list, not a promise: an operator can
 * suspend a look-alike that gets through (npm run affiliate:merchant).
 */
export const BLOCKED_SLUG_BRANDS: readonly string[] = ['kaamsolv', 'kaamkit', 'razorpay', 'paytm', 'phonepe', 'googlepay', 'npci', 'incometax', 'aadhaar', 'uidai'];
export const BLOCKED_SLUG_WORDS: ReadonlySet<string> = new Set(['bank', 'govt', 'gov', 'government', 'official', 'verified', 'secure', 'helpdesk', 'customercare', 'refund', 'rbi', 'sebi', 'upi']);

export type MerchantBrand = {
  logo: string | null;
  brandColour: string;
  programmeName: string;
  programmeDescription: string;
  terms: string;
};

/** What the public portal may show. No owner id, no email: nothing that identifies the account. */
export type MerchantView = { slug: string; name: string; brand: MerchantBrand };

export const portalPath = (slug: string): string => `${PORTAL_PREFIX}${slug}`;
export const portalLabel = (slug: string): string => `${PORTAL_HOST}${portalPath(slug)}`;

/** A suggested address from a business name: "Wandernest Tales" → "wandernest-tales". '' if nothing usable. */
export function slugFromName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s.length >= 3 ? s : '';
}

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: 'slug_invalid' | 'slug_reserved' | 'slug_blocked'; message: string };

export function checkSlug(input: unknown): SlugCheck {
  const slug = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!SLUG_RE.test(slug) || slug.includes('--')) {
    return { ok: false, error: 'slug_invalid', message: 'Use 3 to 40 letters, numbers or single hyphens, starting and ending with a letter or number.' };
  }
  // Referral links are kaamsolv.com/{slug}/{code}: an address that is also a real top-level page would be shadowed.
  if (RESERVED_MERCHANT_SLUGS.has(slug) || isReservedCode(slug)) {
    return { ok: false, error: 'slug_reserved', message: 'That address is kept for KaamSolv. Try another.' };
  }
  if (BLOCKED_SLUG_BRANDS.some((b) => slug.includes(b)) || slug.split('-').some((w) => BLOCKED_SLUG_WORDS.has(w))) {
    return { ok: false, error: 'slug_blocked', message: 'That address looks like an official, financial or KaamSolv name, so it isn’t available. Try your business name.' };
  }
  return { ok: true, slug };
}

export function isAcceptableLogo(logo: unknown): logo is string {
  return (
    typeof logo === 'string' &&
    logo.length <= MERCHANT_LOGO_MAX_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)
  );
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK = '#0C2248';
const WHITE = '#FFFFFF';
/** Deep Navy or white, whichever reads better on the merchant's colour. */
export function readableOn(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK;
}

export type MerchantInput = { name: string; brand: MerchantBrand };
export type CleanResult = { ok: true; value: MerchantInput } | { ok: false; error: string; message: string };

/** Checks the editor's body. Brand fields are replaced as a whole: what is sent is what is kept. */
export function cleanMerchantInput(body: unknown): CleanResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '');
  const name = text(b.name).replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'name_required', message: 'Add your business name.' };
  if (name.length > MERCHANT_LIMITS.name) return { ok: false, error: 'name_long', message: `Keep the business name under ${MERCHANT_LIMITS.name} characters.` };

  const programmeName = text(b.programmeName).replace(/\s+/g, ' ');
  if (programmeName.length > MERCHANT_LIMITS.programmeName) return { ok: false, error: 'programme_name_long', message: `Keep the programme name under ${MERCHANT_LIMITS.programmeName} characters.` };
  const programmeDescription = text(b.programmeDescription);
  if (programmeDescription.length > MERCHANT_LIMITS.programmeDescription) return { ok: false, error: 'description_long', message: `Keep the description under ${MERCHANT_LIMITS.programmeDescription} characters.` };
  const terms = text(b.terms);
  if (terms.length > MERCHANT_LIMITS.terms) return { ok: false, error: 'terms_long', message: `Keep the terms under ${MERCHANT_LIMITS.terms.toLocaleString('en-IN')} characters.` };

  const colour = typeof b.brandColour === 'string' ? b.brandColour.trim() : DEFAULT_BRAND_COLOUR;
  if (!BRAND_COLOUR_RE.test(colour)) return { ok: false, error: 'colour_invalid', message: 'Use a colour like #FE6336.' };

  const logo = b.logo ?? null;
  if (logo !== null && !isAcceptableLogo(logo)) return { ok: false, error: 'bad_logo', message: 'That logo is too big to save. Try a smaller PNG, JPG or WebP.' };

  return { ok: true, value: { name, brand: { logo, brandColour: colour.toUpperCase(), programmeName, programmeDescription, terms } } };
}

/**
 * A programme address from what someone pastes: a full link ("https://kaamsolv.com/affiliate/their-name?x=1"), a
 * path ("/affiliate/their-name/register"), or just the name ("their-name"). null if it isn't one.
 */
export function programmeSlugFromInput(input: unknown): string | null {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return null;
  const inLink = /\/affiliate\/([a-z0-9-]+)/i.exec(text);
  const candidate = inLink ? inLink[1] : /^[a-z0-9-]+$/i.test(text) ? text : '';
  const checked = checkSlug(candidate);
  return checked.ok ? checked.slug : null;
}
