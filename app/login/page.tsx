import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AccountShell } from '../_components/account/account-shell';
import { LoginForm, SignedInRedirect } from '../_components/account/login-form';
import { googleConfigured } from '@/app/lib/auth';
import { emailSignInAvailable } from '@/app/lib/email';
import { safeNextPath } from '@/app/lib/safe-next';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in or sign up to KaamSolv — with Google or a link sent to your email. No passwords.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: false },
};

/**
 * One page for logging in and signing up. Both Google and the email link come
 * back here (`/login?next=…`); once signed in, this page forwards to `next`.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const user = await getCurrentUser(await headers());

  if (user) {
    return (
      <AccountShell title="You’re signed in" intro="Taking you there…" narrow>
        <SignedInRedirect next={next} />
      </AccountShell>
    );
  }

  const error = sp.error === 'link' ? 'link' : sp.error === 'google' ? 'google' : null;
  return (
    <AccountShell title="Log in or sign up" intro="Save invoices and reuse your details. Free, no password." narrow>
      <LoginForm next={next} google={googleConfigured()} email={emailSignInAvailable()} error={error} />
    </AccountShell>
  );
}
