/**
 * Reserved single-segment paths that must never resolve to a user short link.
 *
 * Why it exists even though Next.js route precedence already protects real
 * routes: the Cloudflare redirect Worker (Phase 2b) sits in front of the app
 * and needs its own list to decide "pass this through to Vercel" vs. "treat
 * this as a short code". Generated codes are also checked against this set and
 * regenerated on a hit, and custom slugs (Phase 3) will validate against it.
 *
 * RULE: whenever a new top-level route is added to the KaamSolv app, add its
 * first path segment here. `test/reserved-routes.test.mts` fails if an
 * `app/` route folder or an image converter slug is missing.
 *
 * Framework-free — shared by the app and the Worker (Phase 2a extraction).
 */

/** Top-level app + planned routes (from docs/kaamsolv-phase0-architecture.md §2). */
const ROUTE_SEGMENTS = [
  'url-shortener',
  'qr-code-generator',
  'i',
  'qr-generator',
  'image-tools',
  'image-compressor',
  'resize-image-in-kb',
  'word-counter',
  'character-counter',
  'case-converter',
  'text-cleaner',
  'lorem-ipsum-generator',
  'percentage-calculator',
  'discount-calculator',
  'tip-calculator',
  'split-bill-calculator',
  'age-calculator',
  'gst-calculator',
  'emi-calculator',
  'salary-calculator',
  'indian-number-to-words',
  'pdf-to-word',
  'rent-receipt-generator',
  'gratuity-calculator',
  'invoice-generator',
  'pdf-tools',
  'compress-pdf',
  'merge-pdf',
  'split-pdf',
  'pdf-to-jpg',
  'jpg-to-pdf',
  'calculators',
  'converters',
  'generators',
  'templates',
  'documents',
  'writing',
  'tools',
  'categories',
  'category',
  'blog',
  'guides',
  'pricing',
  'plans',
  'about',
  'contact',
  'feedback',
  'suggest-a-tool',
  'report',
  'report-link',
  'link-unavailable',
  'design-system',
  'login',
  'signup',
  'logout',
  'signout',
  'account',
  'app',
  'dashboard',
  'settings',
  'billing',
  'privacy',
  'terms',
  'cookies',
  'legal',
  'security',
  'abuse',
];

/** Next.js metadata / asset / framework paths. */
const FRAMEWORK_SEGMENTS = [
  '_next',
  '_vercel',
  'favicon.ico',
  'icon.svg',
  'icon.png',
  'apple-icon.png',
  'apple-touch-icon.png',
  'opengraph-image',
  'twitter-image',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'manifest.webmanifest',
  'sw.js',
  '.well-known',
];

/** Words that would be confusing or impersonating as a short code. */
const WORD_SEGMENTS = [
  'api',
  'admin',
  'administrator',
  'root',
  'system',
  'help',
  'support',
  'status',
  'docs',
  'home',
  'new',
  'edit',
  'delete',
  'create',
  'profile',
  'auth',
  'oauth',
  'callback',
  'verify',
  'confirm',
  'reset',
  'upgrade',
  'pro',
  'free',
  'premium',
  'null',
  'undefined',
  'true',
  'false',
  'test',
  'demo',
  'example',
  'kaamsolv',
  'kaamkit',
  'www',
  'mail',
  'email',
  'cdn',
  'assets',
  'vendor',
  'static',
  'public',
  'images',
  'img',
  'css',
  'js',
  'fonts',
  'media',
];

/**
 * Image converter pages at the root (`app/(image-converters)/*`). Listed here
 * rather than imported from app/lib/image so the redirect path stays light;
 * the test keeps the two in sync.
 */
const CONVERTER_SEGMENTS = [
  'jpg-to-png',
  'png-to-jpg',
  'jpg-to-webp',
  'png-to-webp',
  'webp-to-jpg',
  'webp-to-png',
  'heic-to-jpg',
  'heic-to-png',
  'avif-to-jpg',
  'avif-to-png',
];

export const RESERVED_CODES: ReadonlySet<string> = new Set(
  [...ROUTE_SEGMENTS, ...CONVERTER_SEGMENTS, ...FRAMEWORK_SEGMENTS, ...WORD_SEGMENTS].map((s) =>
    s.toLowerCase(),
  ),
);

/** Case-insensitive: is this path segment claimed by the app / off-limits? */
export function isReservedCode(segment: string): boolean {
  return RESERVED_CODES.has(segment.trim().toLowerCase());
}
