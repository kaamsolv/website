import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApplyForm } from '@/app/_components/affiliate/apply-form';
import { PortalHeader } from '@/app/_components/affiliate/portal-view';
import { APPLY_BLOCK_MESSAGES, type RegistrationState } from '@/app/lib/affiliate/application';
import { readableOn } from '@/app/lib/affiliate/merchant';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getCurrentUser } from '@/app/lib/session';
import { affiliateScope } from '@/db/affiliate-scope';
import { getDb } from '@/db/client';
import { portalRegistration, publicMerchantBySlug } from '@/db/merchant-scope';

/**
 * Apply to a merchant's programme (/affiliate/{slug}/register). You need to be signed in (a verified email), so
 * a signed-out visitor is sent to sign in and brought straight back. Drawn per request, never indexed, and a
 * merchant with no open programme shows a plain "closed" message instead of a form.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Apply to join', robots: { index: false, follow: false } };

export default async function RegisterPage({ params }: { params: Promise<{ merchant: string }> }) {
  const { merchant } = await params;
  let view = null;
  let state: RegistrationState | 'signed_out' | null = null;
  let displayName = '';
  try {
    const db = await getDb();
    view = await publicMerchantBySlug(db, merchant);
    if (view) {
      const user = await getCurrentUser(await headers());
      if (!user) {
        state = (await portalRegistration(db, merchant)) === 'open' ? 'signed_out' : 'closed';
      } else {
        const me = affiliateScope(db, user.id);
        state = await me.registrationState(merchant);
        displayName = (await me.profile())?.displayName ?? user.name;
      }
    }
  } catch (e) {
    console.error('[affiliate/register]', formatErrorForLog(e));
    notFound();
  }
  if (!view || !state) notFound();

  const programme = view.brand.programmeName || `${view.name} affiliate programme`;

  return (
    <main id="main" className="min-h-screen bg-canvas">
      <PortalHeader name={view.name} brand={view.brand} heading="Apply to join" />
      <div className="mx-auto max-w-lg px-4 py-8 sm:px-0">
        <div className="rounded-xl2 border border-hair bg-surface p-5 sm:p-8">
          <h1 className="font-display text-2xl font-extrabold text-ink">Apply to join</h1>
          <p className="mt-1 break-words text-sm text-muted">{programme}</p>

          {state === 'open' && <ApplyForm slug={view.slug} merchantName={view.name} defaultName={displayName} />}

          {state === 'signed_out' && (
            <div className="mt-5">
              <p className="text-strong">Sign in to apply, so {view.name} knows the application is really yours. It takes a minute.</p>
              <Link
                href={`/login?next=${encodeURIComponent(`/affiliate/${view.slug}/register`)}`}
                className="mt-4 inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-bold"
                style={{ backgroundColor: view.brand.brandColour, color: readableOn(view.brand.brandColour) }}
              >
                Sign in to apply
              </Link>
            </div>
          )}

          {state === 'pending' && <p className="mt-5 text-strong" role="status">You’ve applied. {view.name} will review it.</p>}
          {state === 'approved' && <p className="mt-5 text-strong" role="status">You’re in. Welcome to {programme}.</p>}
          {state === 'suspended' && <p className="mt-5 text-strong" role="status">{APPLY_BLOCK_MESSAGES.suspended}</p>}
          {state === 'cooldown' && <p className="mt-5 text-strong" role="status">{APPLY_BLOCK_MESSAGES.cooldown}</p>}
          {state === 'closed' && <p className="mt-5 text-strong" role="status">{APPLY_BLOCK_MESSAGES.closed}</p>}
          {state === 'own_programme' && <p className="mt-5 text-strong" role="status">{APPLY_BLOCK_MESSAGES.own_programme}</p>}

          <p className="mt-6">
            <Link href={`/affiliate/${view.slug}`} className="text-sm font-semibold underline">
              Back to {programme}
            </Link>
          </p>
        </div>
        <p className="mt-6 text-xs text-muted">
          Affiliate programme run on{' '}
          <Link href="/" className="font-semibold underline">
            KaamSolv
          </Link>
          .{' '}
          <Link href={`/affiliate/${view.slug}/report`} className="font-semibold underline">
            Report this page
          </Link>
        </p>
      </div>
    </main>
  );
}
