import type { MetadataRoute } from 'next';
import { sitemapUrls } from './lib/site-urls';

// Built once at build time from the catalogue; see app/lib/site-urls.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapUrls().map((url) => ({ url }));
}
