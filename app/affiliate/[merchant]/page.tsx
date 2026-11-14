import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PortalView, type PortalRegistration } from '@/app/_components/affiliate/portal-view';
import type { MerchantView } from '@/app/lib/affiliate/merchant';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getCurrentUser } from '@/app/lib/session';
import { affiliateScope } from '@/db/affiliate-scope';
import { getDb } from '@/db/client';
import { portalRegistration, publicMerchantBySlug } from '@/db/merchant-scope';

/**
 * A merchant's branded affiliate portal (/affiliate/{slug}). Public, drawn per request (branding comes from the
 * database, and there is no revalidation), and not indexed until registration opens (Phase 2). Shows only what the
 * merchant wrote: no account, owner or email. An unknown address is a plain 404.
 */

export const dynamic = 'force-dynamic';

async function load(slug: string): Promise<MerchantView | null> {
  try {
    return await publicMerchantBySlug(await getDb(), slug);
  } catch (e) {
    console.error('[affiliate/portal]', formatErrorForLog(e));
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ merchant: string }> }): Promise<Metadata> {
  const { merchant } = await params;
  const m = await load(merchant);
  const title = m ? m.brand.programmeName || `${m.name} affiliate programme` : 'Affiliate programme';
  return { title, description: m?.brand.programmeDescription.slice(0, 160) || undefined, robots: { index: false, follow: false } };
}

export default async function MerchantPortal({ params }: { params: Promise<{ merchant: string }> }) {
  const { merchant } = await params;
  const m = await load(merchant);
  if (!m) notFound();
  // Everyone sees open or closed; a signed-in visitor sees where they stand (applied, approved, their own page).
  let state: PortalRegistration['state'] = await portalRegistration(await getDb(), merchant).catch(() => 'closed' as const);
  try {
    const user = await getCurrentUser(await headers());
    if (user) state = (await affiliateScope(await getDb(), user.id).registrationState(merchant)) ?? state;
  } catch (e) {
    console.error('[affiliate/portal state]', formatErrorForLog(e));
  }
  return (
    <main id="main" className="min-h-screen bg-canvas">
      <PortalView name={m.name} brand={m.brand} registration={{ state, href: `/affiliate/${m.slug}/register` }} />
      <footer className="mx-auto max-w-2xl px-4 pb-10 text-xs text-muted sm:px-0">
        Affiliate programme run on{' '}
        <Link href="/" className="font-semibold underline">
          KaamSolv
        </Link>
        .{' '}
        <Link href={`/affiliate/${m.slug}/report`} className="font-semibold underline" data-testid="report-link">
          Report this page
        </Link>
      </footer>
    </main>
  );
}
