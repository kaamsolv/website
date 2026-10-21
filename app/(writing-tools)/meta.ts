import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

/** Shared metadata shape for the writing tools. */
export function writingMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', url: `${SITE_URL}${path}`, title: `${title} · KaamSolv`, description },
    twitter: { card: 'summary_large_image', title: `${title} · KaamSolv`, description },
  };
}

export const TEXT_PRIVACY_FAQ = {
  q: 'Is my text saved or sent anywhere?',
  a: 'No. Everything happens in your browser. Your text isn’t sent to KaamSolv, and it’s gone when you close the page.',
};
