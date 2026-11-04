'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { displayDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import { DEFAULT_SCHEDULE_DAYS, MAX_SCHEDULE_DAY, MAX_SCHEDULE_STEPS } from '@/app/lib/invoice/reminders';
import type { CurrencyCode } from '@/app/lib/invoice/types';

const CARD = 'rounded-xl2 border border-hair bg-surface p-5 sm:p-6';

type Settings = { plan: boolean; enabled: boolean; days: number[]; replyTo: string; dailyLimit: number };
type Promise_ = { invoiceId: string; number: string; clientName: string; currency: CurrencyCode; outstanding: number; dueDate: string | null; promisedOn: string; note: string; status: 'upcoming' | 'overdue' };

/**
 * Scheduled payment reminders for the whole account: off until you turn it on, then an email to the customer on the
 * days after the due date that you pick. It skips anything paid, paused or promised. The server holds the rules.
 */
export function ReminderSettingsCard() {
  const [s, setS] = useState<Settings | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetch('/api/invoices/reminder-settings', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Settings>) : null))
      .then((b) => {
        if (!b) return setFailed(true);
        setS(b);
        setDays(b.days.map(String));
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  async function save(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    const parsed = days.map((d) => Number(d));
    const res = await fetch('/api/invoices/reminder-settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, days: parsed }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { message?: string; days?: number[] } | null;
    if (res?.ok) {
      setS((cur) => (cur ? { ...cur, enabled, days: body?.days ?? parsed } : cur));
      setMsg({ tone: 'ok', text: enabled ? 'Done. Reminders are on.' : 'Done. Scheduled reminders are off.' });
    } else setMsg({ tone: 'error', text: body?.message ?? 'We couldn’t save that. Try again in a moment.' });
  }

  if (failed) return null;
  if (!s) return <div className="h-24 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  return (
    <section aria-labelledby="rs-h" className={CARD} data-testid="reminder-settings">
      <h2 id="rs-h" className="font-display text-lg font-bold text-ink">
        Automatic payment reminders
      </h2>
      <p className="mt-1 text-sm text-muted">
        Email customers whose invoice is still unpaid, on the days you choose after its due date. We skip invoices that are paid, paused, or have a promised date that hasn’t passed. Replies go to {s.replyTo}. At most {s.dailyLimit} a day.
      </p>
      {!s.plan && (
        <p className="mt-3 rounded-xl border border-hair bg-wash px-3 py-2 text-sm text-strong">
          Reminders are part of Pro. <Link href="/app/billing" className="font-semibold underline">See Pro</Link>
        </p>
      )}
      <fieldset className="mt-4" disabled={busy}>
        <legend className="text-sm font-semibold text-ink">Remind on these days after the due date</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {days.map((d, i) => (
            <label key={i} className="inline-flex items-center gap-1 text-sm text-strong">
              <span className="sr-only">Reminder {i + 1}, days after due date</span>
              <input
                inputMode="numeric"
                className={`${INPUT} h-11 w-20 text-center`}
                value={d}
                onChange={(e) => setDays((cur) => cur.map((v, j) => (j === i ? e.target.value.replace(/\D/g, '').slice(0, 2) : v)))}
                aria-label={`Reminder ${i + 1}, days after due date`}
              />
              days
              {days.length > 1 && (
                <button type="button" className="ml-1 rounded-full px-2 text-lg font-semibold text-muted hover:bg-wash" aria-label={`Remove reminder ${i + 1}`} onClick={() => setDays((cur) => cur.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </label>
          ))}
          {days.length < MAX_SCHEDULE_STEPS && (
            <button type="button" className="text-sm font-semibold text-strong underline" onClick={() => setDays((cur) => [...cur, String(Math.min(MAX_SCHEDULE_DAY, (Number(cur[cur.length - 1]) || 0) + 7))])}>
              Add a day
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">From 1 to {MAX_SCHEDULE_DAY} days. Usual: {DEFAULT_SCHEDULE_DAYS.join(', ')}.</p>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {s.enabled ? (
          <>
            <button type="button" className={PRIMARY} disabled={busy} onClick={() => void save(true)}>Save days</button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => void save(false)}>Turn off</button>
          </>
        ) : (
          <button type="button" className={PRIMARY} disabled={busy || !s.plan} onClick={() => void save(true)} data-testid="reminders-on">Turn on reminders</button>
        )}
        <span className="text-sm font-semibold text-strong" data-testid="reminders-state">{s.enabled ? 'On' : 'Off'}</span>
      </div>
      {msg && (
        <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm font-semibold ${msg.tone === 'error' ? 'text-danger-600' : 'text-strong'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

/** Invoices where the customer has said when they'll pay: missed promises first. Not the same as the invoice due date. */
export function PromisesCard() {
  const [rows, setRows] = useState<Promise_[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/invoices/promises', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ promises: Promise_[] }>) : null))
      .then((b) => (b ? setRows(b.promises) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <p role="alert" className="text-sm text-danger-600">We couldn’t load promised payments. Reload to try again.</p>;
  if (!rows) return <div className="h-20 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;
  const missed = rows.filter((r) => r.status === 'overdue').length;
  return (
    <section aria-labelledby="pr-h" className={CARD} data-testid="promises-card">
      <h2 id="pr-h" className="font-display text-lg font-bold text-ink">
        Promised payments
      </h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No promises noted. When a customer says when they’ll pay, add it on the invoice and it shows up here.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{missed > 0 ? `${missed} promised ${missed === 1 ? 'date has' : 'dates have'} passed with money still owed.` : 'Nothing missed so far.'}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">Invoices with a promised payment date</caption>
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className="py-1 pr-3 font-semibold">Invoice</th>
                  <th scope="col" className="py-1 pr-3 font-semibold">Customer</th>
                  <th scope="col" className="py-1 pr-3 text-right font-semibold">Owed</th>
                  <th scope="col" className="py-1 pr-3 font-semibold">Invoice due</th>
                  <th scope="col" className="py-1 font-semibold">Promised</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {rows.map((r) => (
                  <tr key={r.invoiceId} data-testid="promise-row">
                    <td className="py-2 pr-3"><Link href={`/app/invoices/${r.invoiceId}`} className="font-semibold text-ink underline">{r.number}</Link></td>
                    <td className="py-2 pr-3 text-strong">{r.clientName || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-strong">{formatMoney(r.outstanding, r.currency)}</td>
                    <td className="py-2 pr-3 text-muted">{r.dueDate ? displayDate(r.dueDate) : '—'}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'overdue' ? 'bg-danger-50 text-danger-600' : 'bg-wash text-strong'}`}>
                        {r.status === 'overdue' ? 'Missed' : 'Promised'}
                      </span>{' '}
                      {displayDate(r.promisedOn)}
                      {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
