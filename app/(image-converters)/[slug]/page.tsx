import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ImageToolPage } from '@/app/_components/image/image-tool-page';
import { getImageTool } from '@/app/lib/image/tools';
import { isConverterSlug } from '@/app/lib/image/routes';
import { CONVERTER_SLUGS } from '@/app/lib/image/types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

export function generateStaticParams() {
  return CONVERTER_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getImageTool(slug);
  if (!tool) return {};

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

export default async function ImageConverterRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isConverterSlug(slug)) notFound();
  return <ImageToolPage slug={slug} />;
}
