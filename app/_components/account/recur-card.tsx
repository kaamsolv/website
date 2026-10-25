'use client';

import { useCallback, useEffect, useState } from 'react';
import { SECONDARY } from './account-shell';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import { RECUR_LABELS, isRecurEvery } from '@/app/lib/invoice/recurring';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { refreshMe, useEntitlements } from '@/app/lib/me-client';

type Due = { id: string; number: string; clientName: string; currency: CurrencyCode; total: number; recurEvery: string | null; recurNext: string | null };

/**
 * Pro: "Due to repeat". A reminder, not automation — nothing is made until
 * Create is pressed. Create = the next invoice (same client and lines, next
 * number, today's date); Skip = not this time. Renders nothing for free
 * accounts and when nothing is due. The browser's own calendar date decides
 * "due" (same rule as the Overview).
 */
export function RecurCard({ onChanged }: { onChanged?: () => void }) {
  const { can } = useEntitlements();
  const allowed = can('invoice_recurring');
  const [due, setDue] = useState<Due[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/due?today=${isoDate(new Date())}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (res?.ok) setDue(((await res.json()) as { due: Due[] }).due);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function act(inv: Due, action: 'create' | 'skip') {
    setBusy(`${action}:${inv.id}`);
    setNotice(null);
    const res = await fetch(`/api/invoices/${inv.id}/recur`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, today: isoDate(new Date()) }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { id?: string; message?: string; next?: string } | undefined;
    setBusy(null);
    if (!res?.ok) {
      setNotice(body?.message ?? 'That didn’t work. Try again.');
      void load();
      return;
    }
    setNotice(
      action === 'create'
        ? `Made the next invoice from ${inv.number}. The one after that is ${body?.next ? displayDate(body.next) : 'scheduled'}.`
        : `Skipped. ${inv.number} is next due ${body?.next ? displayDate(body.next) : 'later'}.`,
    );
    await Promise.all([load(), refreshMe()]);
    onChanged?.();
  }

  if (!allowed || (due.length === 0 && !notice)) return null;
  return (
    <section aria-labelledby="due-h" className="mb-6 rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
      {due.length > 0 && (
        <>
          <h2 id="due-h" className="font-display text-lg font-bold text-ink">
            Due to repeat
          </h2>
          <p className="text-sm text-muted">These repeat on a schedule. Nothing is made until you say so.</p>
          <ul className="mt-3 divide-y divide-hair">
            {due.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {inv.number} <span className="font-normal text-strong">· {inv.clientName || 'No client'}</span>
                  </p>
                  <p className="text-sm text-muted">
                    <span className="tabular-nums font-semibold text-ink">{formatMoney(inv.total, inv.currency)}</span>
                    {' · '}
                    {isRecurEvery(inv.recurEvery) ? RECUR_LABELS[inv.recurEvery].toLowerCase() : 'repeats'}
                    {inv.recurNext ? ` · was due ${displayDate(inv.recurNext)}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void act(inv, 'create')}
                    aria-label={`Create the next invoice from ${inv.number}`}
                    className="inline-flex h-10 items-center rounded-full bg-coral-500 px-4 text-sm font-semibold text-navy-900 hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
                  >
                    {busy === `create:${inv.id}` ? 'Creating…' : 'Create invoice'}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void act(inv, 'skip')} aria-label={`Skip this one for ${inv.number}`} className={`${SECONDARY} !h-10 !px-4`}>
                    {busy === `skip:${inv.id}` ? 'Skipping…' : 'Skip this one'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {notice && (
        <p className={`text-sm font-semibold text-ink ${due.length ? 'mt-2' : ''}`} role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
