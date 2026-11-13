'use client';

import { useState } from 'react';

export function ConfirmAccountant({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function go() {
    setState('busy');
    const res = await fetch('/api/accountant/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string } | null;
    if (res?.ok) setState('done');
    else {
      setState('error');
      setMessage(body?.message ?? 'We couldn’t confirm that. Try the link again in a moment.');
    }
  }
  if (state === 'done') {
    return (
      <p role="status" className="mt-5 rounded-xl border border-hair bg-wash px-4 py-3 font-semibold text-ink" data-testid="confirmed">
        Done. You’re confirmed. Your client’s next pack will come to this address.
      </p>
    );
  }
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => void go()}
        disabled={state === 'busy'}
        data-testid="confirm-accountant"
        className="inline-flex h-12 items-center justify-center rounded-full bg-coral-500 px-6 text-base font-semibold text-navy-900 hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 disabled:border disabled:border-hair disabled:bg-chip disabled:text-muted disabled:hover:bg-chip disabled:hover:text-muted"
      >
        {state === 'busy' ? 'Confirming…' : 'Yes, send me the packs'}
      </button>
      {state === 'error' && (
        <p role="alert" className="mt-3 text-sm text-danger-600">
          {message}
        </p>
      )}
    </div>
  );
}
