import { redirect, notFound } from 'next/navigation';
import { getImageTool } from '@/app/lib/image/tools';
import { seoPathForSlug } from '@/app/lib/image/routes';
import type { ConverterSlug } from '@/app/lib/image/types';

/** Legacy `/image-tools/:slug` paths redirect to canonical SEO routes at `/:slug`. */
export default async function LegacyImageToolRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getImageTool(slug);
  if (!tool) notFound();
  redirect(seoPathForSlug(tool.slug as ConverterSlug));
}
