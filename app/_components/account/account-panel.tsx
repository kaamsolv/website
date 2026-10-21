'use client';

import { useState } from 'react';
import { INPUT, SECONDARY } from './account-shell';
import { signOut } from '@/app/lib/auth-client';
import { clearInvoiceDraft } from '@/app/lib/invoice/draft';
import { refreshMe, useEntitlements, useMe } from '@/app/lib/me-client';

export function AccountPanel({ email }: { email: string }) {
  const me = useMe();
  const { can, limit } = useEntitlements();
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [signingOut, setSigningOut] = useState(false);

  const plan = can('invoice_watermark_remove') ? 'Invoice Pro' : 'Free account';
  const saveLimit = limit('invoice_save');
  const saved = me.status === 'signed-in' ? me.usage.invoiceSave : null;

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    window.location.assign('/');
  }

  async function onDelete(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== 'DELETE') return;
    setState('deleting');
    const res = await fetch('/api/me', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    }).catch(() => null);
    if (!res?.ok) {
      setState('error');
      return;
    }
    clearInvoiceDraft();
    await refreshMe();
    window.location.assign('/?account=deleted');
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="you-h" className="rounded-xl2 border border-hair bg-surface p-6">
        <h2 id="you-h" className="sr-only">
          Your account
        </h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted">Signed in as</dt>
            <dd className="break-all font-semibold text-ink">{email}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Plan</dt>
            <dd className="font-semibold text-ink">{plan}</dd>
          </div>
          {saved !== null && (
            <div>
              <dt className="text-sm text-muted">Saved invoices</dt>
              <dd className="font-semibold text-ink">
                {saveLimit === null ? saved : `${saved} of ${saveLimit}`}{' '}
                <a href="/app/invoices" className="ml-1 text-sm font-medium underline">
                  View
                </a>
              </dd>
            </div>
          )}
        </dl>
        <button type="button" onClick={onSignOut} disabled={signingOut} className={`${SECONDARY} mt-6`}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      <section aria-labelledby="delete-h" className="rounded-xl2 border border-[#B42318]/30 bg-surface p-6">
        <h2 id="delete-h" className="font-display text-lg font-bold text-ink">
          Delete my account
        </h2>
        <p className="mt-2 text-sm text-strong">
          This deletes your account, saved invoices and business details for good. PDFs you’ve already downloaded aren’t
          affected.
        </p>
        <form onSubmit={onDelete} className="mt-4 space-y-3">
          <label htmlFor="delete-confirm" className="block text-sm font-semibold text-ink">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={INPUT}
          />
          <button
            type="submit"
            disabled={confirm !== 'DELETE' || state === 'deleting'}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#B42318] px-5 text-sm font-semibold text-white hover:bg-[#912018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === 'deleting' ? 'Deleting…' : 'Delete my account'}
          </button>
          {state === 'error' && (
            <p className="text-sm font-medium text-[#B42318] dark:text-coral-400" role="alert">
              Couldn’t delete it just now. Try again, or email kaamsolv@gmail.com.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
