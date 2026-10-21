'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { sendSignInLink, signInWithGoogle } from '@/app/lib/auth-client';
import { refreshMe } from '@/app/lib/me-client';

/** Both sign-in methods come back via /login, so the session is seen here first. */
const returnVia = (next: string) => `/login?next=${encodeURIComponent(next)}`;

const ERRORS = {
  link: 'That sign-in link has expired or was already used. Get a new one below.',
  google: 'Google sign-in didn’t finish. Try again, or use your email.',
} as const;

export function LoginForm({
  next,
  google,
  email: emailAvailable,
  error,
}: {
  next: string;
  google: boolean;
  /** False in production until the email service is set up — then it's Google only. */
  email: boolean;
  error: keyof typeof ERRORS | null;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [problem, setProblem] = useState<string | null>(error ? ERRORS[error] : null);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    setState('sending');
    try {
      await sendSignInLink(email.trim(), returnVia(next));
      setState('sent');
    } catch (err) {
      setState('error');
      setProblem(
        err instanceof Error && err.message === 'invalid_email'
          ? 'That doesn’t look like an email address. Check it and try again.'
          : 'Couldn’t send the link just now. Try again in a minute.',
      );
    }
  }

  async function onGoogle() {
    setProblem(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle(returnVia(next));
    } catch {
      setGoogleBusy(false);
      setProblem('Couldn’t reach Google. Try again, or use your email.');
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-xl2 border border-hair bg-surface p-6" role="status">
        <Icon name="mail" className="h-6 w-6 text-coral-600" />
        <h2 className="mt-3 font-display text-xl font-bold text-ink">Check your inbox</h2>
        <p className="mt-2 text-strong">
          If <strong className="break-all">{email.trim()}</strong> is a real address, a sign-in link is on its way. It works once
          and expires in 15 minutes.
        </p>
        <p className="mt-3 text-sm text-muted">Nothing after a few minutes? Check spam, or ask for a new link.</p>
        <button type="button" onClick={() => setState('idle')} className={`${SECONDARY} mt-5`}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl2 border border-hair bg-surface p-6">
      {problem && (
        <p className="rounded-lg border border-[#B42318]/30 bg-[#B42318]/5 p-3 text-sm font-medium text-[#B42318] dark:text-coral-400" role="alert">
          {problem}
        </p>
      )}

      {google && (
        <>
          <button type="button" onClick={onGoogle} disabled={googleBusy} className={`${SECONDARY} h-12 w-full`}>
            <GoogleMark />
            {googleBusy ? 'Opening Google…' : 'Continue with Google'}
          </button>
          {emailAvailable && (
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-hair" /> or <span className="h-px flex-1 bg-hair" />
            </div>
          )}
        </>
      )}

      {!google && !emailAvailable && (
        <p className="text-strong" role="status">
          Signing in isn’t available right now. You can still make and download invoices without an account.
        </p>
      )}

      {emailAvailable && (
      <form onSubmit={onEmail} className="space-y-3" noValidate>
        <label htmlFor="login-email" className="block text-sm font-semibold text-ink">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={INPUT}
        />
        <button type="submit" disabled={state === 'sending' || !email.trim()} className={`${PRIMARY} h-12 w-full`}>
          {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
      )}

      <p className="text-xs text-muted">
        New here? This creates your free account. By continuing you agree to the{' '}
        <a href="/terms" className="underline">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline">
          Privacy policy
        </a>
        .
      </p>
    </div>
  );
}

/** Signed in already: note it for the header, then go where they were heading. */
export function SignedInRedirect({ next }: { next: string }) {
  useEffect(() => {
    void refreshMe().finally(() => window.location.replace(next));
  }, [next]);
  return (
    <p className="text-strong">
      <a href={next} className="font-semibold underline">
        Continue
      </a>
    </p>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
