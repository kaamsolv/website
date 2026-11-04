'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { AccountantAccessCard } from './accountant-access-card';
import { displayDate } from '@/app/lib/invoice/defaults';
import { DEFAULT_DAY, DEFAULT_HOUR, MAX_DAY, MAX_NAME, PACK_SECTIONS, SECTION_LABELS, type PackSection } from '@/app/lib/invoice/accountant';

type Settings = { name: string; email: string; enabled: boolean; day: number; hour: number; timezone: string; sections: PackSection[]; verified: boolean; confirmationPending: boolean };
type Pack = { id: string; period: string; state: 'sending' | 'retrying' | 'failed' | 'waiting' | 'sent' | 'skipped'; reason: string; sentAt: string | null; expiresAt: string | null; linkLive: boolean; downloads: number; lastDownloadedAt: string | null; attempts: number; nextAttemptAt: string | null };
type Data = { plan: boolean; today: string; replyTo: string; settings: Settings | null; packs: Pack[]; next: { date: string; hour: number; now: boolean } | null; lastMonth: { period: string; label: string }; coverage: string[] };
type Preview = { summary: { label: string; asOf: string; currencies: string[]; files: { name: string; rows: number | null; note?: string }[] } };

const LABEL = 'block text-sm font-semibold text-ink';
const CARD = 'rounded-xl2 border border-hair bg-surface p-5 sm:p-6';
const STATE_TEXT: Record<Pack['state'], string> = { sending: 'Sending…', retrying: 'Didn’t go through. We’ll try again', failed: 'Couldn’t be sent', waiting: 'Waiting for email to be set up', sent: 'Sent', skipped: 'Not sent' };
const STATE_STYLE: Record<Pack['state'], string> = { sending: 'bg-wash text-strong', retrying: 'bg-yellowx-100 text-yellowx-600', failed: 'bg-danger-50 text-danger-600', waiting: 'bg-yellowx-100 text-yellowx-600', sent: 'bg-tealx-100 text-tealx-600', skipped: 'bg-wash text-muted' };
const SKIP_WHY: Record<string, string> = {
  nothing_to_report: 'No invoices or payments that month.',
  turned_off: 'Sending was off.',
  not_confirmed: 'The accountant’s email wasn’t confirmed.',
  no_plan: 'Part of Pro.',
};
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'am' : 'pm'}`;
const monthLabel = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { message?: string } }> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as T & { message?: string } };
}

/**
 * Accountant Connect: who gets the monthly pack, when, and what is in it, plus what has been sent. The server holds
 * every rule (plan, confirmed address, limits); this page shows them and says why not.
 */
export function AccountantConnect() {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState(DEFAULT_DAY);
  const [hour, setHour] = useState(DEFAULT_HOUR);
  const [sections, setSections] = useState<PackSection[]>([...PACK_SECTIONS]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = useCallback(async () => {
    const r = await call<Data>('/api/accountant');
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setD(r.body);
    const s = r.body.settings;
    if (s) {
      setName(s.name);
      setEmail(s.email);
      setEnabled(s.enabled);
      setDay(s.day);
      setHour(s.hour);
      setSections(s.sections);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const inFlight = d?.packs.some((p) => p.state === 'sending' || p.state === 'retrying') ?? false;
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [inFlight, load]);

  const fail = (text: string) => setMsg({ tone: 'error', text });
  const ok = (text: string) => setMsg({ tone: 'ok', text });

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await call<{ addressChanged?: boolean }>('/api/accountant', { method: 'PUT', body: JSON.stringify({ name, email, enabled, day, hour, sections }) });
    setBusy(false);
    if (!r.ok) return fail(r.body.message ?? 'We couldn’t save that.');
    ok(r.body.addressChanged ? 'Saved. Confirm this email address so we can start sending.' : 'Saved.');
    await load();
  }
  async function verify() {
    setBusy(true);
    setMsg(null);
    const r = await call('/api/accountant/verify', { method: 'POST', body: '{}' });
    setBusy(false);
    if (r.ok) {
      ok('Sent. Ask your accountant to open the email and press Confirm.');
      await load();
    } else fail(r.body.message ?? 'We couldn’t send that.');
  }
  async function runPreview() {
    setBusy(true);
    setMsg(null);
    setPreview(null);
    const r = await call<Preview>('/api/accountant/preview');
    setBusy(false);
    if (r.ok) setPreview(r.body);
    else fail(r.body.message ?? 'We couldn’t build the preview.');
  }
  async function retry(id: string) {
    setBusy(true);
    const r = await call('/api/accountant/retry', { method: 'POST', body: JSON.stringify({ packId: id }) });
    setBusy(false);
    if (r.ok) {
      ok('Trying again.');
      await load();
    } else fail(r.body.message ?? 'We couldn’t retry that.');
  }
  async function revoke() {
    setBusy(true);
    const r = await call<{ ended?: number }>('/api/accountant/revoke', { method: 'POST', body: '{}' });
    setBusy(false);
    setConfirmRevoke(false);
    if (r.ok) {
      ok(r.body.ended ? 'Done. Links already sent no longer work.' : 'No live links to end.');
      await load();
    } else fail(r.body.message ?? 'We couldn’t do that.');
  }
  const toggle = (s: PackSection) => setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  if (failed) return (
    <div className={CARD}>
      <p role="alert" className="text-danger-600">We couldn’t load this. Try again in a moment.</p>
      <button type="button" className={`${SECONDARY} mt-3`} onClick={() => void load()}>Try again</button>
    </div>
  );
  if (!d) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;
  const s = d.settings;
  const confirmed = !!s?.verified;

  return (
    <div className="space-y-6" data-testid="accountant-connect">
      {!d.plan && (
        <p className="rounded-xl border border-hair bg-wash px-4 py-3 text-sm text-strong" data-testid="ac-upgrade">
          Accountant Connect is part of Pro: the monthly pack, and a login for your accountant. {s || d.packs.length > 0 ? 'What you set up is kept, and you can still switch it off or end access below. ' : ''}
          <Link href="/app/billing" className="font-semibold underline">See Pro</Link>
        </p>
      )}
      <section aria-labelledby="ac-h" className={CARD}>
        <h2 id="ac-h" className="font-display text-lg font-bold text-ink">Your accountant</h2>
        <p className="mt-1 text-sm text-muted">We email them a link to a ZIP of last month’s invoices, tax totals and payments. Replies come to {d.replyTo}. They don’t need an account.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ac-name" className={LABEL}>Name</label>
            <input id="ac-name" className={`${INPUT} mt-1`} maxLength={MAX_NAME} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ac-email" className={LABEL}>Email</label>
            <input id="ac-email" type="email" className={`${INPUT} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <p className="mt-3 text-sm text-strong" data-testid="ac-confirmed">
          {confirmed ? 'Email confirmed by your accountant.' : s?.confirmationPending ? 'Waiting for your accountant to confirm. The link works for 48 hours.' : s?.email ? 'Not confirmed yet. We won’t send anything until your accountant confirms.' : 'Save their name and email first.'}
        </p>
        {s?.email && !confirmed && (
          <button type="button" className={`${SECONDARY} mt-3`} disabled={busy || !d.plan} onClick={() => void verify()} data-testid="ac-verify">
            {s.confirmationPending ? 'Send the confirmation again' : 'Send confirmation email'}
          </button>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-[8rem_10rem]">
          <div>
            <label htmlFor="ac-day" className={LABEL}>Day of month</label>
            <select id="ac-day" className={`${INPUT} mt-1`} value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: MAX_DAY }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ac-hour" className={LABEL}>Time</label>
            <select id="ac-hour" className={`${INPUT} mt-1`} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>{hourLabel(n)}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">India time (Asia/Kolkata). The pack covers the month that just ended, so on 5 Nov it holds October.</p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-ink">Include</legend>
          <div className="mt-2 grid gap-2">
            {PACK_SECTIONS.map((x) => (
              <label key={x} className="flex items-center gap-2 text-sm text-strong">
                <input type="checkbox" className="h-5 w-5 accent-coral-500" checked={sections.includes(x)} onChange={() => toggle(x)} />
                {SECTION_LABELS[x]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" className="h-5 w-5 accent-coral-500" checked={enabled} disabled={!confirmed || (!d.plan && !enabled)} onChange={(e) => setEnabled(e.target.checked)} data-testid="ac-enabled" />
          Send the pack every month
        </label>
        {!confirmed && <p className="mt-1 text-xs text-muted">Available once your accountant has confirmed their email.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={PRIMARY} disabled={busy || !name.trim() || !email.trim() || sections.length === 0} onClick={() => void save()} data-testid="ac-save">Save</button>
          <span className="text-sm text-strong" data-testid="ac-next">
            {s?.enabled && confirmed && d.next ? (d.next.now ? 'Goes out on the next run, within about 15 minutes.' : `Next pack: ${displayDate(d.next.date)}, ${hourLabel(d.next.hour)}.`) : 'Not scheduled.'}
          </span>
        </div>
      </section>

      <section aria-labelledby="ac-t" className={CARD}>
        <h2 id="ac-t" className="font-display text-lg font-bold text-ink">Try it first</h2>
        <p className="mt-1 text-sm text-muted">See what {d.lastMonth.label}’s pack would hold. Nothing is emailed from here.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={SECONDARY} disabled={busy || !d.plan} onClick={() => void runPreview()} data-testid="ac-preview">Preview {d.lastMonth.label}</button>
          {d.plan ? (
            <a className={SECONDARY} href={`/api/accountant/pack?period=${d.lastMonth.period}`} data-testid="ac-download">Download a test ZIP</a>
          ) : (
            <button type="button" className={SECONDARY} disabled data-testid="ac-download">Download a test ZIP</button>
          )}
        </div>
        {preview && (
          <div className="mt-4" data-testid="ac-preview-result">
            <p className="text-sm font-semibold text-ink">{preview.summary.label}: {preview.summary.files.length} files{preview.summary.currencies.length ? ` · ${preview.summary.currencies.join(', ')}` : ''}</p>
            <ul className="mt-2 divide-y divide-hair rounded-xl border border-hair text-sm">
              {preview.summary.files.map((f) => (
                <li key={f.name} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="break-all text-strong">{f.name}</span>
                  <span className="text-muted">{f.rows !== null ? `${f.rows} row${f.rows === 1 ? '' : 's'}` : f.note ?? ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <h3 className="mt-5 text-sm font-bold text-ink">What it covers, and what it doesn’t</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {d.coverage.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ac-hist" className={CARD}>
        <h2 id="ac-hist" className="font-display text-lg font-bold text-ink">Sent so far</h2>
        {d.packs.length === 0 ? (
          <p className="mt-1 text-sm text-muted" data-testid="ac-empty">Nothing sent yet. The first pack goes out on your chosen day.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted" data-testid="ac-last">
              {(() => {
                const last = d.packs.find((p) => p.state === 'sent');
                return last?.sentAt ? `Last sent: ${monthLabel(last.period)} pack, ${when(last.sentAt)}.` : 'Nothing has been delivered yet.';
              })()}
            </p>
            <ul className="mt-3 divide-y divide-hair rounded-xl border border-hair" data-testid="ac-history">
              {d.packs.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="font-semibold text-ink">{monthLabel(p.period)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_STYLE[p.state]}`}>{STATE_TEXT[p.state]}</span>
                  {p.sentAt && <span className="text-muted">{when(p.sentAt)}</span>}
                  {p.state === 'sent' && <span className="text-muted">{p.downloads} download{p.downloads === 1 ? '' : 's'}{p.linkLive && p.expiresAt ? ` · link works until ${displayDate(p.expiresAt.slice(0, 10))}` : ' · link ended'}</span>}
                  {p.state === 'skipped' && p.reason && <span className="text-muted">{SKIP_WHY[p.reason] ?? ''}</span>}
                  {(p.state === 'retrying' || p.state === 'failed') && p.reason && <span className="text-muted">Reason: {p.reason}</span>}
                  {p.state === 'retrying' && p.nextAttemptAt && <span className="text-muted">Next try {when(p.nextAttemptAt)}</span>}
                  {(p.state === 'failed' || p.state === 'waiting') && (
                    <button type="button" className="ml-auto text-sm font-semibold text-strong underline disabled:opacity-60" disabled={busy || !d.plan} onClick={() => void retry(p.id)} data-testid="ac-retry">Try again</button>
                  )}
                </li>
              ))}
            </ul>
            {confirmRevoke ? (
              <div role="group" aria-label="End links" className="mt-3 rounded-xl border border-hair bg-wash p-3 text-sm" data-testid="ac-revoke-confirm">
                <p className="font-semibold text-ink">End every download link already sent? Your accountant would need a new pack.</p>
                <div className="mt-2 flex gap-3">
                  <button type="button" className={PRIMARY} disabled={busy} onClick={() => void revoke()}>End the links</button>
                  <button type="button" className={SECONDARY} onClick={() => setConfirmRevoke(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              d.packs.some((p) => p.linkLive) && (
                <button type="button" className={`${SECONDARY} mt-3`} onClick={() => setConfirmRevoke(true)} data-testid="ac-revoke">End download links</button>
              )
            )}
          </>
        )}
      </section>
      <AccountantAccessCard />
      {msg && (
        <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`text-sm font-semibold ${msg.tone === 'error' ? 'text-danger-600' : 'text-strong'}`} data-testid="ac-msg">{msg.text}</p>
      )}
    </div>
  );
}
