'use client';

/**
 * Browser calls to better-auth's endpoints (app/api/auth/[...all]) with plain
 * fetch — no auth client library shipped to the browser.
 */

import { clearInvoiceDraft } from './invoice/draft';
import { refreshMe } from './me-client';

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
}

/** Off to Google; comes back to `next` (a same-site path). */
export async function signInWithGoogle(next: string): Promise<void> {
  const res = await post('/sign-in/social', {
    provider: 'google',
    callbackURL: next,
    errorCallbackURL: '/login?error=google',
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok || !body.url) throw new Error('google');
  window.location.assign(body.url);
}

/**
 * Ask for a sign-in link. Resolves the same way whether or not the address has
 * an account, or was rate-limited — the page always says "check your inbox".
 */
export async function sendSignInLink(email: string, next: string): Promise<void> {
  const res = await post('/sign-in/magic-link', {
    email,
    callbackURL: next,
    newUserCallbackURL: next,
    errorCallbackURL: '/login?error=link',
  });
  if (res.status >= 500) throw new Error('server');
  if (res.status === 400) throw new Error('invalid_email');
}

export async function signOut(): Promise<void> {
  await post('/sign-out', {});
  clearInvoiceDraft();
  await refreshMe();
}
