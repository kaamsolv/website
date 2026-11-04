import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfirmAccountant } from './confirm';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { peekVerification } from '@/db/accountant';

/**
 * Where an accountant confirms they want to get a client's monthly pack (/accountant/confirm/<token>). Opening the page
 * changes nothing (mail scanners open links): the button does. Never indexed; no referrer; a wrong, used or expired
 * link is the same plain 404.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' };

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let who: Awaited<ReturnType<typeof peekVerification>> = null;
  try {
    who = await peekVerification(await getDb(), token);
  } catch (e) {
    console.error('[accountant/confirm]', formatErrorForLog(e));
  }
  if (!who) notFound();
  return (
    <main id="main" className="kk-container py-12">
      <div className="mx-auto max-w-lg rounded-xl2 border border-hair bg-surface p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-ink">Confirm your email</h1>
        <p className="mt-3 text-strong">
          Hi {who.accountantName}. {who.businessName || 'A KaamSolv user'} would like to send you a monthly pack of their sales invoices and payments, as a handover for your books.
        </p>
        <p className="mt-2 text-sm text-muted">You’ll get one email a month with a link to download a ZIP. It isn’t a GST return. You don’t need an account.</p>
        <ConfirmAccountant token={token} />
      </div>
    </main>
  );
}
