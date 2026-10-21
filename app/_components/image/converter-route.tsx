import type { Metadata } from 'next';
import { ImageToolPage } from './image-tool-page';
import { getImageTool } from '@/app/lib/image/tools';
import type { ConverterSlug } from '@/app/lib/image/types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

/**
 * Shared metadata + page for the converter routes under app/(image-converters)/.
 *
 * Each converter is its own static folder (`/jpg-to-png`, …) rather than one
 * root-level `[slug]` route: the URL Shortener owns the root dynamic segment
 * (`app/[shortCode]`), and static routes always win over it.
 */
export function converterMetadata(slug: ConverterSlug): Metadata {
  const tool = getImageTool(slug)!;
  return {
    title: tool.title,
    description: tool.description,
    alternates: { canonical: tool.path },
    openGraph: {
      type: 'website',
      url: `${SITE_URL}${tool.path}`,
      title: `${tool.title} · KaamSolv`,
      description: tool.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${tool.title} · KaamSolv`,
      description: tool.description,
    },
  };
}

export function ConverterRoute({ slug }: { slug: ConverterSlug }) {
  return <ImageToolPage slug={slug} />;
}
