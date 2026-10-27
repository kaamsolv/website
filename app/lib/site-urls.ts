import { LIVE_TOOLS } from './catalogue';

/**
 * The URLs listed in /sitemap.xml (served by app/sitemap.ts). This file is not
 * called sitemap.ts on purpose: Next treats that name as a route anywhere in app/.
 *
 * Only canonical, public, indexable pages: the home page, the catalogue's live
 * tools, and a short list of public pages. Planned tools aren't listed (they
 * have no page). Account and app routes, sign-in, short links, reports, the
 * design system, API routes and the old /image-tools/* redirects never appear.
 *
 * New catalogue tools are included automatically when their status becomes
 * 'live'. A new public page that isn't a catalogue tool (like /about) has to
 * be added to PUBLIC_PAGES below; test/sitemap.test.mts checks every listed
 * path has a real, indexable page.
 */
export const SITE_ORIGIN = 'https://kaamsolv.com';

/** Public, indexable pages that aren't catalogue tools. */
export const PUBLIC_PAGES = ['/', '/tools', '/pdf-tools', '/about', '/contact', '/privacy', '/terms', '/refund-policy'] as const;

/** Paths (no origin), unique, in a stable order: public pages first, then live tools. */
export function sitemapPaths(): string[] {
  return [...new Set<string>([...PUBLIC_PAGES, ...LIVE_TOOLS.map((t) => t.url)])];
}

/** Absolute canonical URLs. The root is `https://kaamsolv.com/`; every other path has no trailing slash. */
export function sitemapUrls(): string[] {
  return sitemapPaths().map((p) => `${SITE_ORIGIN}${p}`);
}
