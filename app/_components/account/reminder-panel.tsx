'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { displayDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import { MAX_REMINDER_NOTE } from '@/app/lib/invoice/reminders';
import { MAX_PROMISE_NOTE, type PromiseStatus } from '@/app/lib/invoice/followup';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { Skeleton } from '@/app/_components/skeleton';

type State = 'sending' | 'retrying' | 'failed' | 'waiting' | 'sent' | 'skipped';
type Reminder = { id: string; kind: 'manual' | 'scheduled'; step: number | null; state: State; reason: string; createdAt: string; finishedAt: string | null; attempts: number; nextAttemptAt: string | null };
type Followup = { promisedOn: string | null; promiseNote: string; promiseSetAt: string | null; remindersPaused: boolean; status: PromiseStatus; outstanding: number };
type Data = { today: string; currency: CurrencyCode; plan: boolean; canSend: boolean; why: string | null; outstanding: number; to: string | null; replyTo: string; reminders: Reminder[]; followup: Followup | null; promisesAllowed: boolean };

const LABEL = 'block text-sm font-semibold text-ink';

/** What each state says, in words (never colour alone). */
const STATE_TEXT: Record<State, string> = {
  sending: 'Sending…',
  retrying: 'Didn’t go through. We’ll try again',
  failed: 'Couldn’t be sent',
  waiting: 'Waiting for email to be set up',
  sent: 'Sent',
  skipped: 'Not sent',
};
const STATE_STYLE: Record<State, string> = {
  sending: 'bg-wash text-strong',
  retrying: 'bg-yellowx-100 text-yellowx-600',
  failed: 'bg-danger-50 text-danger-600',
  waiting: 'bg-yellowx-100 text-yellowx-600',
  sent: 'bg-tealx-100 text-tealx-600',
  skipped: 'bg-wash text-muted',
};
const SKIP_WHY: Record<string, string> = {
  paid: 'It was paid first.',
  marked_paid: 'It was marked paid first.',
  nothing_owed: 'Nothing was owed.',
  no_email: 'No customer email.',
  bad_email: 'The customer email didn’t look right.',
  paused: 'Reminders were paused.',
  promised: 'A promised date hadn’t passed.',
  no_plan: 'Reminders are part of Pro.',
  not_found: 'The invoice was gone.',
  not_invoice: 'It’s a quotation.',
};
const PROMISE_TEXT: Record<PromiseStatus, string> = { none: '', upcoming: 'Promised', overdue: 'Promise missed', settled: 'Paid since' };

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { message?: string } }> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as T & { message?: string } };
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Chasing one invoice: send a payment reminder to the customer, see what happened to each one, pause the scheduled
 * ones, and note when the customer says they'll pay. The server decides what is allowed (plan, eligibility, limits);
 * this panel only shows it and says why not.
 */
export function ReminderPanel({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseNote, setPromiseNote] = useState('');

  const load = useCallback(async () => {
    const r = await call<Data>(`/api/invoices/${id}/reminders`);
    if (!r.ok) {
      setProblem(r.status === 404 ? 'We couldn’t find this invoice.' : 'We couldn’t load reminders. Try again in a moment.');
      return;
    }
    setProblem(null);
    setData(r.body);
    setPromiseDate((cur) => cur || r.body.followup?.promisedOn || '');
    setPromiseNote((cur) => cur || r.body.followup?.promiseNote || '');
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // While something is on its way, look again every few seconds.
  const inFlight = data?.reminders.some((r) => r.state === 'sending' || r.state === 'retrying') ?? false;
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [inFlight, load]);

  async function send() {
    setBusy(true);
    setNotice(null);
    const r = await call<{ alreadyQueued?: boolean }>(`/api/invoices/${id}/reminders`, { method: 'POST', body: JSON.stringify({ note }) });
    setBusy(false);
    setConfirming(false);
    if (r.ok) {
      setNotice(r.body.alreadyQueued ? 'A reminder for this invoice is already on its way today.' : 'Reminder on its way.');
      setNote('');
      await load();
    } else setProblem(r.body.message ?? 'We couldn’t send that. Try again in a moment.');
  }

  async function retry(rid: string) {
    setBusy(true);
    setNotice(null);
    const r = await call(`/api/invoices/${id}/reminders`, { method: 'POST', body: JSON.stringify({ retry: rid }) });
    setBusy(false);
    if (r.ok) {
      setNotice('Trying again.');
      await load();
    } else setProblem(r.body.message ?? 'We couldn’t retry that.');
  }

  async function follow(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    setProblem(null);
    const r = await call(`/api/invoices/${id}/followup`, { method: 'PUT', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) {
      setNotice(done);
      await load();
    } else setProblem(r.body.message ?? 'We couldn’t save that. Try again in a moment.');
  }

  if (problem && !data) {
    return (
      <section aria-labelledby="rem-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <h2 id="rem-h" className="font-display text-lg font-bold text-ink">Chase this payment</h2>
        <p role="alert" className="mt-2 text-sm text-danger-600">{problem}</p>
        <button type="button" className={`${SECONDARY} mt-3`} onClick={() => void load()}>Try again</button>
      </section>
    );
  }
  if (!data) return <Skeleton className="h-24" />;

  const f = data.followup;
  const hasPromise = !!f?.promisedOn;
  return (
    <section aria-labelledby="rem-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6" data-testid="reminder-panel">
      <h2 id="rem-h" className="font-display text-lg font-bold text-ink">
        Chase this payment
      </h2>
      <p className="mt-1 text-sm text-muted">Email your customer a polite reminder for what’s still owed, and keep a note of when they say they’ll pay.</p>

      {!data.plan ? (
        <p className="mt-3 rounded-xl border border-hair bg-wash px-3 py-2 text-sm text-strong" data-testid="reminder-upgrade">
          Email reminders are part of Pro. You can still share this invoice on WhatsApp above.{' '}
          <Link href="/app/billing" className="font-semibold underline">See Pro</Link>
        </p>
      ) : (
        <div className="mt-4">
          {data.canSend ? (
            confirming ? (
              <div role="group" aria-labelledby="rem-confirm-h" className="rounded-xl border border-hair bg-wash p-4" data-testid="reminder-confirm">
                <p id="rem-confirm-h" className="text-sm font-semibold text-ink">
                  Send a reminder for {formatMoney(data.outstanding, data.currency)} to {data.to}?
                </p>
                <p className="mt-1 text-xs text-muted">Replies will go to {data.replyTo}. The email has a link to view this invoice.</p>
                <label htmlFor="rem-note" className={`${LABEL} mt-3`}>
                  Add a line of your own <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea id="rem-note" className={`${INPUT} mt-1 min-h-20`} maxLength={MAX_REMINDER_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className={PRIMARY} disabled={busy} onClick={() => void send()} data-testid="reminder-send">
                    {busy ? 'Sending…' : 'Send reminder'}
                  </button>
                  <button type="button" className={SECONDARY} disabled={busy} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={PRIMARY} onClick={() => { setConfirming(true); setNotice(null); }} data-testid="reminder-open">
                Send a reminder
              </button>
            )
          ) : (
            <p className="text-sm text-muted" data-testid="reminder-why">{data.why}</p>
          )}

          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" className="h-5 w-5 accent-coral-500" checked={!!f?.remindersPaused} disabled={busy} onChange={(e) => void follow({ paused: e.target.checked }, e.target.checked ? 'Scheduled reminders paused for this invoice.' : 'Scheduled reminders will carry on.')} data-testid="reminder-pause" />
              Pause scheduled reminders for this invoice
            </label>
            <p className="mt-1 text-xs text-muted">
              Scheduled reminders are set up in{' '}
              <Link href="/app/invoices/collections" className="font-semibold underline">Payments &amp; collections</Link>.
            </p>
          </div>

          {data.reminders.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-ink">Reminders</h3>
              <ul className="mt-2 divide-y divide-hair rounded-xl border border-hair" data-testid="reminder-list">
                {data.reminders.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_STYLE[r.state]}`} data-testid="reminder-state">{STATE_TEXT[r.state]}</span>
                    <span className="text-strong">{r.kind === 'scheduled' ? `Scheduled${r.step ? `, ${r.step} days after due` : ''}` : 'You sent'}</span>
                    <span className="text-muted">{when(r.finishedAt ?? r.createdAt)}</span>
                    {r.state === 'skipped' && r.reason && <span className="text-muted">{SKIP_WHY[r.reason] ?? ''}</span>}
                    {r.state === 'retrying' && r.nextAttemptAt && <span className="text-muted">Next try {when(r.nextAttemptAt)}</span>}
                    {(r.state === 'failed' || r.state === 'waiting') && (
                      <button type="button" className="ml-auto text-sm font-semibold text-strong underline disabled:opacity-60" disabled={busy} onClick={() => void retry(r.id)} data-testid="reminder-retry">
                        Try again
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {data.promisesAllowed && (f?.outstanding ?? 0) > 0 && (
        <div className="mt-6 border-t border-hair pt-5" data-testid="promise">
          <h3 className="text-sm font-bold text-ink">Customer promised to pay</h3>
          {hasPromise && (
            <p className="mt-1 text-sm text-strong" data-testid="promise-status">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${f!.status === 'overdue' ? 'bg-danger-50 text-danger-600' : 'bg-wash text-strong'}`}>{PROMISE_TEXT[f!.status]}</span>{' '}
              {displayDate(f!.promisedOn!)}
              {f!.promiseNote && <span className="text-muted"> · {f!.promiseNote}</span>}
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-[11rem_1fr]">
            <div>
              <label htmlFor="promise-date" className={LABEL}>Promised date</label>
              <input id="promise-date" type="date" className={`${INPUT} mt-1`} min={data.today} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="promise-note" className={LABEL}>Note <span className="font-normal text-muted">(only you see this)</span></label>
              <input id="promise-note" className={`${INPUT} mt-1`} maxLength={MAX_PROMISE_NOTE} value={promiseNote} onChange={(e) => setPromiseNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={SECONDARY} disabled={busy || !promiseDate} onClick={() => void follow({ promisedOn: promiseDate, note: promiseNote }, 'Saved. Scheduled reminders wait until that date has passed.')} data-testid="promise-save">
              {hasPromise ? 'Update promise' : 'Save promise'}
            </button>
            {hasPromise && (
              <button type="button" className={SECONDARY} disabled={busy} onClick={() => { setPromiseDate(''); setPromiseNote(''); void follow({ promisedOn: null }, 'Promise cleared.'); }} data-testid="promise-clear">
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {notice && <p role="status" className="mt-3 text-sm font-semibold text-strong" data-testid="reminder-note">{notice}</p>}
      {problem && <p role="alert" className="mt-3 text-sm text-danger-600" data-testid="reminder-problem">{problem}</p>}
    </section>
  );
}
