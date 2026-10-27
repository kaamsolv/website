'use client';

import { useEffect, useState } from 'react';
import { PRIMARY, SECONDARY } from './account-shell';
import { displayDate } from '@/app/lib/invoice/defaults';
import { invoicesHref } from '@/app/lib/invoice/filters';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import type { Cadence } from '@/app/lib/notify/schedule';
import type { Receivables } from '@/db/collections';

type Loaded = Receivables & { message: string | null; whatsappHref: string | null };

const CADENCE_LABELS: Record<Cadence, string> = { off: 'Don’t email me', weekly: 'Every Monday', monthly: 'On the 1st of each month' };

/**
 * "Where things stand today": what is owed, what is overdue, what falls due soon, what came in this month, and a short
 * summary to copy or share on WhatsApp or have emailed on a schedule. Every figure comes from /api/invoices/receivables
 * (the same ledger as the rest of this page); this only lays it out. One currency at a time, never summed.
 */
export function ReceivablesCard({ today, currency }: { today: string; currency: CurrencyCode | null }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [cadence, setCadence] = useState<Cadence>('off');
  const [available, setAvailable] = useState(true);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ today });
    if (currency) q.set('currency', currency);
    fetch(`/api/invoices/receivables?${q}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null))
      .then((b) => (b ? setData(b) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [today, currency]);

  useEffect(() => {
    fetch('/api/notifications/prefs', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { summaryCadence?: Cadence; available?: boolean } | null) => {
        if (b?.summaryCadence) setCadence(b.summaryCadence);
        if (b && b.available === false) setAvailable(false);
      })
      .catch(() => undefined);
  }, []);

  async function saveCadence(next: Cadence) {
    setNote(null);
    const res = await fetch('/api/notifications/prefs', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaryCadence: next }),
    }).catch(() => null);
    if (res?.ok) {
      setCadence(next);
      setNote({ tone: 'ok', text: next === 'off' ? 'Done. No summary emails.' : `Done. You’ll get it ${next === 'weekly' ? 'every Monday' : 'on the 1st of each month'} at about 9 am India time.` });
    } else {
      const body = (await res?.json().catch(() => null)) as { message?: string } | null;
      setNote({ tone: 'error', text: body?.message ?? 'We couldn’t save that. Try again in a moment.' });
    }
  }

  async function copy() {
    if (!data?.message) return;
    try {
      await navigator.clipboard.writeText(data.message);
      setNote({ tone: 'ok', text: 'Copied.' });
    } catch {
      setNote({ tone: 'error', text: 'Couldn’t copy. Select the message and copy it.' });
    }
  }

  if (failed) return null; // The rest of the page still works; this is an extra.
  if (!data) return <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const cur = data.currency;
  const money = (n: number) => formatMoney(n, cur);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const stat = (id: string, label: string, amount: number, sub: string, href?: string) => {
    const body = (
      <>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 whitespace-nowrap font-display text-lg font-extrabold text-ink sm:text-2xl" data-testid={id}>
          {money(amount)}
        </p>
        <p className="text-xs text-muted">{sub}</p>
      </>
    );
    return href ? (
      <a href={href} className="block rounded-xl border border-hair bg-surface p-4 hover:bg-wash">
        {body}
      </a>
    ) : (
      <div className="rounded-xl border border-hair bg-surface p-4">{body}</div>
    );
  };

  return (
    <section aria-labelledby="rc-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6" data-testid="receivables-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rc-h" className="font-display text-xl font-bold text-ink">
          Where things stand
        </h2>
        <p className="text-sm text-muted">
          As of {displayDate(data.today)} · {cur}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stat('rc-outstanding', 'Outstanding', data.outstanding.amount, plural(data.outstanding.count, 'invoice'), invoicesHref({ state: 'outstanding', currency: cur }))}
        {stat('rc-overdue', 'Overdue', data.overdue.amount, plural(data.overdue.count, 'invoice'), invoicesHref({ state: 'overdue', currency: cur }))}
        {stat('rc-received', 'Received this month', data.receivedThisMonth.amount, plural(data.receivedThisMonth.count, 'payment'))}
        {stat('rc-due-today', 'Due today', data.dueToday.amount, plural(data.dueToday.count, 'invoice'))}
        {stat('rc-due7', 'Due in the next 7 days', data.dueNext7.amount, plural(data.dueNext7.count, 'invoice'))}
        {stat('rc-due30', 'Due in the next 30 days', data.dueNext30.amount, `${plural(data.dueNext30.count, 'invoice')}, includes the next 7`)}
      </div>
      {data.partlyPaid.count > 0 && (
        <p className="mt-3 text-sm text-strong" data-testid="rc-partly">
          {plural(data.partlyPaid.count, 'invoice')} partly paid, {money(data.partlyPaid.remaining)} still owed on them.
        </p>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-ink">Next due</h3>
          {data.upcoming.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nothing is due from today on.</p>
          ) : (
            <ul className="mt-1 divide-y divide-hair" data-testid="rc-upcoming">
              {data.upcoming.map((u) => (
                <li key={u.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <a href={`/app/invoices/${u.id}`} className="min-w-0 truncate font-semibold text-ink underline-offset-2 hover:underline">
                    {u.number} · {u.clientName || 'No name'}
                  </a>
                  <span className="shrink-0 text-muted">
                    {money(u.balance)} · {displayDate(u.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">Latest payments</h3>
          {data.recentPayments.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No payments recorded yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-hair" data-testid="rc-recent">
              {data.recentPayments.map((p, i) => (
                <li key={`${p.invoiceId}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <a href={`/app/invoices/${p.invoiceId}`} className="min-w-0 truncate font-semibold text-ink underline-offset-2 hover:underline">
                    {p.number} · {p.clientName || 'No name'}
                  </a>
                  <span className="shrink-0 text-muted">
                    {money(p.amount)} · {displayDate(p.paidOn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-hair pt-5">
        <h3 className="text-sm font-bold text-ink">Share or email this summary</h3>
        {data.message && (
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-hair bg-wash p-3 font-sans text-sm text-strong [overflow-wrap:anywhere]" data-testid="rc-message">
            {data.message}
          </pre>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {data.whatsappHref && (
            <a href={data.whatsappHref} target="_blank" rel="noopener noreferrer" className={PRIMARY} data-testid="rc-whatsapp">
              Share on WhatsApp
            </a>
          )}
          <button type="button" className={SECONDARY} onClick={copy} data-testid="rc-copy">
            Copy message
          </button>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            Email it to me
            <select
              value={cadence}
              disabled={!available && cadence === 'off'}
              onChange={(e) => saveCadence(e.target.value as Cadence)}
              className="h-11 rounded-xl border border-hair bg-fieldbg px-3 text-sm font-semibold text-ink"
              data-testid="rc-cadence"
            >
              {(Object.keys(CADENCE_LABELS) as Cadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          WhatsApp opens with the message filled in; you choose who gets it and press send. The email goes only to your own address, at about 9 am India time, and only
          when you’ve turned it on.
        </p>
        {note && (
          <p role="status" className={`mt-2 text-sm font-semibold ${note.tone === 'error' ? 'text-danger-700' : 'text-strong'}`} data-testid="rc-note">
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
