import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

/** Title, description, canonical and social tags for a tool page. */
export function toolMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', url: `${SITE_URL}${path}`, title: `${title} · KaamSolv`, description },
    twitter: { card: 'summary_large_image', title: `${title} · KaamSolv`, description },
  };
}
