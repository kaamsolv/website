import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from './lib/site-urls';

/**
 * robots.txt. Public pages stay crawlable; the account area and the API are
 * not worth crawling (account pages are also `noindex`). Points crawlers at
 * the sitemap (app/sitemap.ts).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app/', '/api/'] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
