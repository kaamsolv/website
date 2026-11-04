'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { displayDate } from '@/app/lib/invoice/defaults';
import { RECUR_EVERY, RECUR_LABELS, type RecurEvery } from '@/app/lib/invoice/recurring';
import { MAX_AUTO_RUNS, type AutoState } from '@/app/lib/invoice/recurring-auto';

type Run = { id: string; dueOn: string; status: 'created' | 'skipped' | 'failed' | 'started'; reason: string; createdInvoiceId: string | null; createdNumber: string | null; at: string };
type Data = { today: string; plan: boolean; recurEvery: string | null; recurNext: string | null; autoCreate: boolean; paused: boolean; endsOn: string | null; maxRuns: number | null; runsDone: number; state: AutoState; runs: Run[] };

const LABEL = 'block text-sm font-semibold text-ink';
const STATE_TEXT: Record<AutoState, string> = { off: 'Off: you’re reminded, nothing is made for you', active: 'On', paused: 'Paused', ended: 'Finished' };
const WHY: Record<string, string> = {
  limit: 'You’d reached your saved-invoice limit. Make room, then use “Due to repeat” on the invoice list.',
  no_plan: 'Repeating invoices is part of Pro.',
  interrupted: 'It stopped part-way. Check the invoice list before making it by hand.',
  not_due: 'It had already been taken care of.',
  not_found: 'The invoice was gone.',
};

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { message?: string } }> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as T & { message?: string } };
}

/**
 * Repeat this invoice. Pick how often and the next date, then choose whether the next invoice is made for you on that
 * day (India date) or you are just reminded. Made invoices are plain copies: never emailed or shared automatically.
 */
export function RecurringCard({ id }: { id: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [every, setEvery] = useState<RecurEvery>('month');
  const [next, setNext] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [maxRuns, setMaxRuns] = useState('');
  const [confirmOn, setConfirmOn] = useState(false);

  const load = useCallback(async () => {
    const r = await call<Data>(`/api/invoices/${id}/automation`);
    if (!r.ok) return setHidden(true);
    setD(r.body);
    setEndsOn(r.body.endsOn ?? '');
    setMaxRuns(r.body.maxRuns ? String(r.body.maxRuns) : '');
    if (r.body.recurEvery && (RECUR_EVERY as readonly string[]).includes(r.body.recurEvery)) setEvery(r.body.recurEvery as RecurEvery);
    setNext((cur) => cur || r.body.recurNext || r.body.today);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveSchedule(stop: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await call(`/api/invoices/${id}/recurring`, { method: 'PUT', body: JSON.stringify(stop ? { every: null } : { every, next }) });
    setBusy(false);
    if (r.ok) {
      setMsg({ tone: 'ok', text: stop ? 'Stopped. This invoice no longer repeats.' : 'Saved.' });
      if (stop) setNext('');
      await load();
    } else setMsg({ tone: 'error', text: r.body.message ?? 'We couldn’t save that.' });
  }

  async function saveAuto(body: { autoCreate: boolean; paused?: boolean }, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await call(`/api/invoices/${id}/automation`, { method: 'PUT', body: JSON.stringify({ ...body, endsOn: endsOn || null, maxRuns: maxRuns ? Number(maxRuns) : null }) });
    setBusy(false);
    setConfirmOn(false);
    if (r.ok) {
      setMsg({ tone: 'ok', text: done });
      await load();
    } else setMsg({ tone: 'error', text: r.body.message ?? 'We couldn’t save that.' });
  }

  if (hidden) return null;
  if (!d) return <div className="h-24 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;
  const scheduled = !!d.recurEvery && !!d.recurNext;

  return (
    <section aria-labelledby="rc2-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6" data-testid="recurring-card">
      <h2 id="rc2-h" className="font-display text-lg font-bold text-ink">Repeat this invoice</h2>
      <p className="mt-1 text-sm text-muted">For retainers and regular work. Dates are India dates. Each new invoice is a copy with the next invoice number, today’s date and your usual days to pay. It isn’t emailed to anyone.</p>
      {!d.plan && (
        <p className="mt-3 rounded-xl border border-hair bg-wash px-3 py-2 text-sm text-strong" data-testid="recurring-upgrade">
          Repeating invoices is part of Pro. <Link href="/app/billing" className="font-semibold underline">See Pro</Link>
        </p>
      )}

      <fieldset className="mt-4 grid gap-3 sm:grid-cols-[12rem_12rem]" disabled={busy || !d.plan}>
        <legend className="sr-only">How often</legend>
        <div>
          <label htmlFor="rc-every" className={LABEL}>How often</label>
          <select id="rc-every" className={`${INPUT} mt-1`} value={every} onChange={(e) => setEvery(e.target.value as RecurEvery)}>
            {RECUR_EVERY.map((r) => (
              <option key={r} value={r}>{RECUR_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rc-next" className={LABEL}>Next one on</label>
          <input id="rc-next" type="date" className={`${INPUT} mt-1`} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={SECONDARY} disabled={busy || !d.plan || !next} onClick={() => void saveSchedule(false)} data-testid="recurring-save">
          {scheduled ? 'Update schedule' : 'Repeat this invoice'}
        </button>
        {scheduled && (
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => void saveSchedule(true)} data-testid="recurring-stop">Stop repeating</button>
        )}
      </div>

      {scheduled && (
        <div className="mt-6 border-t border-hair pt-5" data-testid="recurring-auto">
          <h3 className="text-sm font-bold text-ink">Make it for me</h3>
          <p className="mt-1 text-sm text-strong">
            Status: <span className="font-semibold" data-testid="recurring-state">{STATE_TEXT[d.state]}</span>
            {' · '}Next: {displayDate(d.recurNext!)}
            {d.runsDone > 0 && ` · ${d.runsDone} made so far`}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_12rem]">
            <div>
              <label htmlFor="rc-ends" className={LABEL}>Stop after <span className="font-normal text-muted">(optional)</span></label>
              <input id="rc-ends" type="date" min={d.today} className={`${INPUT} mt-1`} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <div>
              <label htmlFor="rc-max" className={LABEL}>Or after this many <span className="font-normal text-muted">(optional)</span></label>
              <input id="rc-max" inputMode="numeric" className={`${INPUT} mt-1`} value={maxRuns} max={MAX_AUTO_RUNS} onChange={(e) => setMaxRuns(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </div>
          </div>
          {confirmOn ? (
            <div role="group" aria-labelledby="rc-confirm" className="mt-3 rounded-xl border border-hair bg-wash p-4" data-testid="recurring-confirm">
              <p id="rc-confirm" className="text-sm font-semibold text-ink">
                From {displayDate(d.recurNext!)}, a new invoice will be saved in your account on each due date, without asking. You can pause or turn this off any time.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" className={PRIMARY} disabled={busy} onClick={() => void saveAuto({ autoCreate: true, paused: false }, 'Done. Invoices will be made on their due dates.')} data-testid="recurring-confirm-yes">Turn on</button>
                <button type="button" className={SECONDARY} disabled={busy} onClick={() => setConfirmOn(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {d.state === 'off' || d.state === 'ended' ? (
                <button type="button" className={PRIMARY} disabled={busy || !d.plan} onClick={() => setConfirmOn(true)} data-testid="recurring-auto-on">
                  {d.state === 'ended' ? 'Start again' : 'Create automatically'}
                </button>
              ) : (
                <>
                  <button type="button" className={SECONDARY} disabled={busy} onClick={() => void saveAuto({ autoCreate: true, paused: d.state !== 'paused' }, d.state === 'paused' ? 'Resumed.' : 'Paused. Nothing will be made until you resume.')} data-testid="recurring-pause">
                    {d.state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button type="button" className={SECONDARY} disabled={busy} onClick={() => void saveAuto({ autoCreate: false }, 'Turned off. You’ll be reminded instead.')} data-testid="recurring-auto-off">Turn off</button>
                  <button type="button" className={SECONDARY} disabled={busy} onClick={() => void saveAuto({ autoCreate: true, paused: d.paused }, 'Saved.')}>Save stop settings</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {d.runs.length > 0 && (
        <div className="mt-6" data-testid="recurring-runs">
          <h3 className="text-sm font-bold text-ink">What happened</h3>
          <ul className="mt-2 divide-y divide-hair rounded-xl border border-hair">
            {d.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{displayDate(r.dueOn)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'created' ? 'bg-tealx-100 text-tealx-600' : r.status === 'failed' ? 'bg-danger-50 text-danger-600' : 'bg-wash text-strong'}`}>
                  {r.status === 'created' ? 'Made' : r.status === 'failed' ? 'Couldn’t make it' : 'Skipped'}
                </span>
                {r.createdInvoiceId && <Link href={`/app/invoices/${r.createdInvoiceId}`} className="font-semibold text-strong underline">{r.createdNumber ?? 'Open'}</Link>}
                {r.status !== 'created' && r.reason && <span className="text-muted">{WHY[r.reason] ?? ''}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {msg && (
        <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm font-semibold ${msg.tone === 'error' ? 'text-danger-600' : 'text-strong'}`} data-testid="recurring-msg">{msg.text}</p>
      )}
    </section>
  );
}
