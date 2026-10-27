'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRIMARY, SECONDARY } from './account-shell';
import { displayDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';

type Candidate = { id: string; number: string; kind: 'invoice' | 'quote'; clientName: string; issueDate: string | null; total: number; currency: string; clientGstin: string };

/**
 * Invoices and quotations that were typed in with exactly this customer's name but were never connected to the
 * saved customer, so they aren't in the totals. They are only *listed*: nothing is ticked, nothing is connected
 * until the owner ticks some and confirms — a same-named client might be a different person. Connecting changes
 * only which saved customer the invoice belongs to; what is printed on it stays as typed.
 */
export function CustomerLinkReview({
  customerId,
  customerName,
  onChanged,
  version,
}: {
  customerId: string;
  customerName: string;
  /** Called after a connect, so the totals and history refresh. */
  onChanged: () => void;
  /** Changes whenever something else on the page connected or disconnected an invoice, so this list is read again. */
  version: number;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [customerGstin, setCustomerGstin] = useState('');
  const [capped, setCapped] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set()); // nothing is ticked by default
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/unlinked`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return setCandidates([]);
    const body = (await res.json()) as { candidates: Candidate[]; capped: boolean; customerGstin: string };
    setCandidates(body.candidates);
    setCapped(body.capped);
    setCustomerGstin(body.customerGstin ?? '');
    setTicked((cur) => new Set([...cur].filter((id) => body.candidates.some((c) => c.id === id))));
  }, [customerId]);
  useEffect(() => void load(), [load, version]);

  async function connect() {
    const ids = [...ticked];
    if (!ids.length) return;
    if (!window.confirm(`Connect ${ids.length} ${ids.length === 1 ? 'invoice' : 'invoices'} to ${customerName}? What’s printed on them stays exactly as it was typed.`)) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/links`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'connect', invoiceIds: ids }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { changed?: number; skipped?: number; message?: string };
    setBusy(false);
    if (!res?.ok) return setNotice(body.message ?? 'That didn’t work. Try again.');
    setTicked(new Set());
    setNotice(`Connected ${body.changed ?? 0}${body.skipped ? `; ${body.skipped} couldn’t be (already connected, or not found)` : ''}.`);
    await load();
    onChanged();
  }

  if (!candidates || candidates.length === 0) return null;
  const gstinNote = (c: Candidate) => {
    if (!c.clientGstin) return null;
    if (!customerGstin) return `GSTIN typed on it: ${c.clientGstin}`;
    return c.clientGstin.toUpperCase() === customerGstin.toUpperCase() ? null : `GSTIN differs: ${c.clientGstin}`;
  };
  const allTicked = ticked.size === candidates.length;

  return (
    <section aria-labelledby="review-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6" data-testid="link-review">
      <h2 id="review-h" className="font-display text-lg font-bold text-ink">
        Typed in with this name, but not connected
      </h2>
      <p className="mt-1 text-sm text-strong">
        {candidates.length}
        {capped ? '+' : ''} {candidates.length === 1 ? 'document was' : 'documents were'} typed in as “{customerName}” without picking this saved customer, so {candidates.length === 1 ? 'it isn’t' : 'they aren’t'} counted
        above. We haven’t connected {candidates.length === 1 ? 'it' : 'them'} — the same name can be a different client. Tick the ones that are this customer, then connect.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={SECONDARY} onClick={() => setTicked(allTicked ? new Set() : new Set(candidates.map((c) => c.id)))}>
          {allTicked ? 'Untick all' : 'Tick all listed'}
        </button>
        <button type="button" className={PRIMARY} disabled={busy || ticked.size === 0} onClick={() => void connect()}>
          {busy ? 'Connecting…' : ticked.size ? `Connect ${ticked.size} selected` : 'Connect selected'}
        </button>
        {notice && (
          <span role="status" className="text-sm font-semibold text-ink">
            {notice}
          </span>
        )}
      </div>
      <ul aria-label="Not connected" className="mt-3 divide-y divide-hair overflow-hidden rounded-lg border border-hair">
        {candidates.map((c) => {
          const note = gstinNote(c);
          return (
            <li key={c.id} className="flex items-start gap-3 p-3">
              <input
                type="checkbox"
                aria-label={`Select ${c.number}`}
                className="mt-1 h-5 w-5 shrink-0 accent-[#FE6336]"
                checked={ticked.has(c.id)}
                onChange={(e) =>
                  setTicked((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    return next;
                  })
                }
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <a href={`/invoice-generator?id=${c.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                    {c.number || 'Untitled'}
                  </a>
                  {c.kind === 'quote' && <span className="rounded-full border border-hair bg-wash px-2 py-0.5 text-xs font-semibold text-strong">Quote</span>}
                  <span className="tabular-nums font-semibold text-ink">{formatMoney(c.total, c.currency as CurrencyCode)}</span>
                  {c.issueDate && <span className="text-sm text-muted">{displayDate(c.issueDate)}</span>}
                </p>
                {note && <p className="mt-0.5 text-sm font-semibold text-danger-600">{note}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {capped && <p className="mt-2 text-sm text-muted">Showing the first 50. Connect these and the rest will be listed.</p>}
    </section>
  );
}
