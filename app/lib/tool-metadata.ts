import type { Metadata } from 'next';
import { TOOLS } from './catalogue';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

/** The picture shown when a tool page is shared (WhatsApp, X, LinkedIn, Slack…). One brand image for now (public/og-default.png). */
export const OG_IMAGE = { url: '/og-default.png', width: 1200, height: 630, alt: 'KaamSolv: small tools for everyday problems' } as const;

/**
 * Everything a search engine or a link preview reads about a tool page: title, description, keywords (from the catalogue),
 * canonical and an en-IN language alternate, Open Graph and Twitter cards with an image, and the robots rules that allow
 * large previews. Only tags that are accurate for the page.
 */
export function toolMetadata(path: string, title: string, description: string): Metadata {
  const tool = TOOLS.find((t) => t.url === path);
  const shareTitle = `${title} · KaamSolv`;
  return {
    title,
    description,
    ...(tool ? { keywords: [tool.name, ...tool.keywords, 'free', 'online', 'KaamSolv'] } : {}),
    authors: [{ name: 'KaamSolv', url: SITE_URL }],
    alternates: { canonical: path, languages: { 'en-IN': path, 'x-default': path } },
    openGraph: { type: 'website', url: `${SITE_URL}${path}`, siteName: 'KaamSolv', locale: 'en_IN', title: shareTitle, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: shareTitle, description, images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }] },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  };
}
