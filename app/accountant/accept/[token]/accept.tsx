'use client';

import { useState } from 'react';

export function AcceptInvite({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function go() {
    setState('busy');
    const res = await fetch('/api/accountant-access/accept', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string } | null;
    if (res?.ok) {
      window.location.assign('/accountant/clients');
      return;
    }
    setState('error');
    setMessage(body?.message ?? 'We couldn’t accept that. Try again in a moment.');
  }
  return (
    <div className="mt-6">
      <button type="button" onClick={() => void go()} disabled={state === 'busy'} data-testid="accept-invite" className="inline-flex h-12 items-center justify-center rounded-full bg-coral-500 px-6 text-base font-semibold text-navy-900 hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 disabled:border disabled:border-hair disabled:bg-chip disabled:text-muted disabled:hover:bg-chip disabled:hover:text-muted">
        {state === 'busy' ? 'Accepting…' : 'Accept the invitation'}
      </button>
      {state === 'error' && <p role="alert" className="mt-3 text-sm text-danger-600">{message}</p>}
    </div>
  );
}
