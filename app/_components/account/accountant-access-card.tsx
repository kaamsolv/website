'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { EVENT_TEXT } from '@/app/lib/invoice/accountant-access';
import { Skeleton } from '@/app/_components/skeleton';
import { Notice } from '@/app/_components/notice';

type Access = { id: string; name: string; email: string; status: 'invited' | 'active' | 'revoked'; inviteExpired: boolean; acceptedAt: string | null; revokedAt: string | null; lastOpenedAt: string | null };
type Ev = { id: string; who: string; action: string; detail: string; at: string };
type Data = { plan: boolean; access: Access[]; events: Ev[]; can: string[]; cannot: string[] };

const CARD = 'rounded-xl2 border border-hair bg-surface p-5 sm:p-6';
const LABEL = 'block text-sm font-semibold text-ink';
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; body: T & { message?: string } }> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  return { ok: res.ok, body: (await res.json().catch(() => ({}))) as T & { message?: string } };
}

/**
 * Give a named accountant their own read-only login to your books. They are invited by email, sign in as that address,
 * and see invoices, payments and customer names, nothing else. You can end it at once and see what they opened.
 */
export function AccountantAccessCard() {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<Access | null>(null);

  const load = useCallback(async () => {
    const r = await call<Data>('/api/accountant-access');
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setD(r.body);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(path: string, body: unknown, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await call(path, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    setConfirmRevoke(null);
    if (r.ok) {
      setMsg({ tone: 'ok', text: done });
      await load();
      return true;
    }
    setMsg({ tone: 'error', text: r.body.message ?? 'We couldn’t do that.' });
    await load();
    return false;
  }

  if (failed) return <Notice role="alert">We couldn’t load accountant access. Reload to try again.</Notice>;
  if (!d) return <Skeleton className="h-32" />;
  const live = d.access.filter((a) => a.status !== 'revoked');

  return (
    <section aria-labelledby="aa-h" className={CARD} data-testid="access-card">
      <h2 id="aa-h" className="font-display text-lg font-bold text-ink">Give your accountant a login</h2>
      <p className="mt-1 text-sm text-muted">They get their own sign-in with read-only access to your invoices and payments. No shared password, and you can end it any time.</p>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold text-ink">They can</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{d.can.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
        <div>
          <p className="font-semibold text-ink">They can’t</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{d.cannot.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      </div>

      {live.length > 0 && (
        <ul className="mt-4 divide-y divide-hair rounded-xl border border-hair" data-testid="access-list">
          {live.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-semibold text-ink">{a.name}</span>
              <span className="break-all text-muted">{a.email}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.status === 'active' ? 'bg-tealx-100 text-tealx-600' : a.inviteExpired ? 'bg-danger-50 text-danger-600' : 'bg-wash text-strong'}`} data-testid="access-status">
                {a.status === 'active' ? 'Has access' : a.inviteExpired ? 'Invitation expired' : 'Invited, not accepted yet'}
              </span>
              {a.status === 'active' && <span className="text-muted">{a.lastOpenedAt ? `Last opened ${when(a.lastOpenedAt)}` : 'Hasn’t opened anything yet'}</span>}
              <span className="ml-auto flex gap-3">
                {a.status === 'invited' && (
                  <button type="button" className="font-semibold text-strong underline disabled:opacity-60" disabled={busy} onClick={() => void run('/api/accountant-access/resend', { id: a.id }, 'Sent again.')}>Send again</button>
                )}
                <button type="button" className="font-semibold text-strong underline disabled:opacity-60" disabled={busy} onClick={() => setConfirmRevoke(a)} data-testid="access-revoke">{a.status === 'active' ? 'End access' : 'Cancel invitation'}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {confirmRevoke && (
        <div role="group" aria-label="Confirm" className="mt-3 rounded-xl border border-hair bg-wash p-3 text-sm" data-testid="access-revoke-confirm">
          <p className="font-semibold text-ink">{confirmRevoke.status === 'active' ? `End ${confirmRevoke.name}’s access now? They’ll lose it on their next click.` : `Cancel the invitation to ${confirmRevoke.name}?`}</p>
          <div className="mt-2 flex gap-3">
            <button type="button" className={PRIMARY} disabled={busy} onClick={() => void run('/api/accountant-access/revoke', { id: confirmRevoke.id }, 'Done. Access ended.')} data-testid="access-revoke-yes">{confirmRevoke.status === 'active' ? 'End access' : 'Cancel invitation'}</button>
            <button type="button" className={SECONDARY} onClick={() => setConfirmRevoke(null)}>Keep it</button>
          </div>
        </div>
      )}

      <form
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void run('/api/accountant-access/invite', { name, email }, 'Invitation sent. They’ll get an email with a link.').then((ok) => {
            if (ok) {
              setName('');
              setEmail('');
            }
          });
        }}
      >
        <div>
          <label htmlFor="aa-name" className={LABEL}>Their name</label>
          <input id="aa-name" className={`${INPUT} mt-1`} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="aa-email" className={LABEL}>Their email</label>
          <input id="aa-email" type="email" className={`${INPUT} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <button type="submit" className={PRIMARY} disabled={busy || !d.plan || !name.trim() || !email.trim()} data-testid="access-invite">Invite</button>
      </form>
      {!d.plan && (
        <p className="mt-2 text-sm text-strong" data-testid="access-upgrade">
          Accountant access is part of Pro. <Link href="/app/billing" className="font-semibold underline">See Pro</Link>
        </p>
      )}
      {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm font-semibold ${msg.tone === 'error' ? 'text-danger-600' : 'text-strong'}`} data-testid="access-msg">{msg.text}</p>}

      {d.events.length > 0 && (
        <div className="mt-5" data-testid="access-events">
          <h3 className="text-sm font-bold text-ink">Recent activity</h3>
          <ul className="mt-2 divide-y divide-hair rounded-xl border border-hair text-sm">
            {d.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                <span className="font-semibold text-ink">{e.who}</span>
                <span className="text-strong">{EVENT_TEXT[e.action] ?? e.action}{e.detail ? `: ${e.detail}` : ''}</span>
                <span className="text-muted">{when(e.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
