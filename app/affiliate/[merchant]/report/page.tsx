import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PortalHeader } from '@/app/_components/affiliate/portal-view';
import { ReportForm } from '@/app/_components/affiliate/report-form';
import type { MerchantView } from '@/app/lib/affiliate/merchant';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { publicMerchantBySlug } from '@/db/merchant-scope';

/**
 * Report a portal (/affiliate/{slug}/report). Open to anyone, never indexed. Reports go to an operator, who decides;
 * nothing happens to the portal automatically. An unknown or suspended address is the same plain 404 as its portal.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report this page', robots: { index: false, follow: false } };

async function load(slug: string): Promise<MerchantView | null> {
  try {
    return await publicMerchantBySlug(await getDb(), slug);
  } catch (e) {
    console.error('[affiliate/report page]', formatErrorForLog(e));
    return null;
  }
}

export default async function ReportPage({ params }: { params: Promise<{ merchant: string }> }) {
  const { merchant } = await params;
  const m = await load(merchant);
  if (!m) notFound();
  const programme = m.brand.programmeName || `${m.name} affiliate programme`;
  return (
    <main id="main" className="min-h-screen bg-canvas">
      <PortalHeader name={m.name} brand={m.brand} heading="Report this page" />
      <div className="mx-auto max-w-lg px-4 py-8 sm:px-0">
        <div className="rounded-xl2 border border-hair bg-surface p-5 sm:p-8">
          <h1 className="font-display text-2xl font-extrabold text-ink">Report this page</h1>
          <p className="mt-1 break-words text-sm text-muted">{programme}</p>
          <p className="mt-3 text-sm text-strong">
            This page is written by {m.name}, not by KaamSolv. If it pretends to be someone else, asks for money, or promises earnings that aren’t real, tell us.
          </p>
          <ReportForm slug={m.slug} merchantName={m.name} />
          <p className="mt-6">
            <Link href={`/affiliate/${m.slug}`} className="text-sm font-semibold underline">
              Back to {programme}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
