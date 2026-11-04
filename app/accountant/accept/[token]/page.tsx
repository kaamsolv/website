import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AcceptInvite } from './accept';
import { getCurrentUser } from '@/app/lib/session';
import { ACCESS_CAN, ACCESS_CANNOT } from '@/app/lib/invoice/accountant-access';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { peekInvite } from '@/db/accountant-access';

/**
 * Where a named accountant accepts an invitation (/accountant/accept/<token>). Opening the page changes nothing; it
 * says who is asking and what access means, and asks the person to sign in as the invited address. A wrong, used or
 * expired link is the same plain 404.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accept the invitation' };

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let who: Awaited<ReturnType<typeof peekInvite>> = null;
  try {
    who = await peekInvite(await getDb(), token);
  } catch (e) {
    console.error('[accountant/accept]', formatErrorForLog(e));
  }
  if (!who) notFound();
  const user = await getCurrentUser(await headers());
  const next = encodeURIComponent(`/accountant/accept/${token}`);
  const same = !!user && user.email.trim().toLowerCase() === who.email;

  return (
    <main id="main" className="kk-container py-12">
      <div className="mx-auto max-w-lg rounded-xl2 border border-hair bg-surface p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-ink">View {who.businessName || 'this business'}’s books</h1>
        <p className="mt-3 text-strong">Hi {who.name}. {who.businessName || 'A KaamSolv user'} has invited you to view their sales invoices and payments, read-only.</p>
        <h2 className="mt-4 text-sm font-bold text-ink">You can</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{ACCESS_CAN.map((c) => <li key={c}>{c}</li>)}</ul>
        <h2 className="mt-4 text-sm font-bold text-ink">You can’t</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{ACCESS_CANNOT.map((c) => <li key={c}>{c}</li>)}</ul>
        {!user ? (
          <div className="mt-6">
            <p className="text-sm text-strong">Sign in with <strong>{who.email}</strong> to accept. If you don’t have an account yet, signing in with that address makes one.</p>
            <Link href={`/login?next=${next}`} className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-coral-500 px-6 text-base font-semibold text-navy-900 hover:bg-coral-600 hover:text-white" data-testid="accept-signin">Sign in to accept</Link>
          </div>
        ) : same ? (
          <AcceptInvite token={token} />
        ) : (
          <p role="alert" className="mt-6 rounded-xl border border-hair bg-wash px-4 py-3 text-sm text-strong" data-testid="accept-wrong">
            You’re signed in as {user.email}, but this invitation is for {who.email}. Sign out, then sign in with {who.email}. The link still works.
          </p>
        )}
      </div>
    </main>
  );
}
