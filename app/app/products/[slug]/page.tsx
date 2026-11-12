import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { ProductPage } from '@/app/_components/account/product-page';
import { productBySlug } from '@/app/lib/products';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = productBySlug((await params).slug);
  return { title: p ? p.name : 'Products' };
}

/** A product's page in the workspace: what it gives you, and how to get it. Signed-in only, like the rest of /app. */
export default async function ProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) notFound();
  const user = await getCurrentUser(await headers());
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/products/${slug}`)}`);

  return (
    <AccountShell workspace title={product.name} intro={product.status === 'soon' ? 'Not available yet.' : 'What it gives you, and how to get it.'}>
      <ProductPage product={product} />
    </AccountShell>
  );
}
