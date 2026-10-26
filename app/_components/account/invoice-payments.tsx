'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { PaymentProgress } from './payment-progress';
import { StatusBadge } from './status-badge';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import {
  MAX_NOTE,
  MAX_REFERENCE,
  METHOD_LABELS,
  PAYMENT_METHODS,
  centsToDecimal,
  parseAmount,
  paymentSummary,
  toCents,
  type PaymentMethod,
} from '@/app/lib/invoice/payments';
import type { CurrencyCode } from '@/app/lib/invoice/types';

type Facts = {
  id: string;
  number: string;
  clientName: string;
  currency: CurrencyCode;
  total: number;
  issueDate: string | null;
  dueDate: string | null;
  status: 'unpaid' | 'paid';
  amountPaid: number;
  customerId: string | null;
  customerName: string | null;
};
type Entry = {
  id: string;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string;
  note: string;
  voidedAt: string | null;
  voidReason: string;
};
type Detail = { invoice: Facts; payments: Entry[] };

const LABEL = 'block text-sm font-semibold text-ink';
const SMALL_BTN =
  'inline-flex h-10 items-center justify-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0'));

/** Whole days from `from` to `to` (YYYY-MM-DD). */
function daysBetween(from: string, to: string): number {
  const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((t(to) - t(from)) / 86_400_000);
}

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { message?: string; error?: string } }> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as T & { message?: string; error?: string } };
}

/**
 * One invoice's money: what it's for, what's been received, what's left, and every payment. Any signed-in account
 * can record payments; amounts are checked by the server against the invoice total, not by this page.
 */
export function InvoicePayments({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = isoDate(new Date());

  // Record form
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per payment: a retry or a double click can't record it twice.
  const key = useRef(newKey());
  const amountInput = useRef<HTMLInputElement>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  // Void / edit one entry
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editRef, setEditRef] = useState('');
  const [editNote, setEditNote] = useState('');
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call<Partial<Detail>>(`/api/invoices/${encodeURIComponent(id)}/payments`).catch(() => null);
    if (!r) return setProblem('Couldn’t load this invoice. Check your connection and refresh.');
    if (r.status === 404) return setProblem('notfound');
    if (!r.ok || !r.body.invoice || !r.body.payments) return setProblem(r.body.message ?? 'Couldn’t load this invoice. Refresh to try again.');
    setData({ invoice: r.body.invoice, payments: r.body.payments });
    setProblem(null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data ? paymentSummary({ total: data.invoice.total, amountPaid: data.invoice.amountPaid, status: data.invoice.status, dueDate: data.invoice.dueDate }, today) : null;

  function openForm(prefillAmount?: number) {
    if (!data || !summary) return;
    const owed = summary.state === 'marked_paid' ? data.invoice.total : summary.outstanding;
    setAmount(centsToDecimal(toCents(prefillAmount ?? owed)));
    setPaidOn(today);
    setMethod(data.invoice.currency === 'INR' ? 'upi' : 'bank');
    setReference('');
    setNote('');
    setFormError(null);
    setStep('edit');
    setOpen(true);
    requestAnimationFrame(() => amountInput.current?.focus());
  }

  // "Record payment" on the list opens this page ready to type.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!data || autoOpened.current) return;
    autoOpened.current = true;
    if (new URLSearchParams(window.location.search).get('record') === '1' && summary && (summary.outstanding > 0 || summary.state === 'marked_paid')) openForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function review() {
    if (!data || !summary) return;
    setFormError(null);
    const a = parseAmount(amount);
    if (!a.ok) return setFormError(a.message);
    const cap = summary.state === 'marked_paid' ? toCents(data.invoice.total) : toCents(summary.outstanding);
    if (a.cents > cap) {
      return setFormError(`That’s more than is owed — only ${formatMoney(cap / 100, data.invoice.currency)} is outstanding on this invoice.`);
    }
    if (!paidOn) return setFormError('Pick the date you received it.');
    if (paidOn > today) return setFormError('The date received can’t be in the future.');
    setStep('review');
    requestAnimationFrame(() => confirmBtn.current?.focus());
  }

  async function record() {
    if (!data || !summary || busy) return;
    setBusy(true);
    setFormError(null);
    const r = await call<Partial<Detail> & { duplicate?: boolean }>(`/api/invoices/${encodeURIComponent(id)}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, paidOn, method, reference, note, clientKey: key.current, today, reconcile: summary.state === 'marked_paid' }),
    }).catch(() => null);
    setBusy(false);
    if (!r) {
      setStep('edit');
      return setFormError('Couldn’t reach KaamSolv. Try again — it won’t be recorded twice.');
    }
    if (!r.ok || !r.body.invoice || !r.body.payments) {
      setStep('edit');
      if (r.body.error === 'exceeds' || r.body.error === 'legacy_paid') void load();
      return setFormError(r.body.message ?? 'That didn’t save. Try again.');
    }
    const detail: Detail = { invoice: r.body.invoice, payments: r.body.payments };
    setData(detail);
    key.current = newKey();
    setOpen(false);
    const after = paymentSummary({ total: detail.invoice.total, amountPaid: detail.invoice.amountPaid, status: detail.invoice.status, dueDate: detail.invoice.dueDate }, today);
    setNotice(
      after.state === 'paid'
        ? `Recorded. ${detail.invoice.number} is paid in full.`
        : `Recorded. ${formatMoney(after.outstanding, detail.invoice.currency)} still outstanding.`,
    );
  }

  async function voidEntry(entry: Entry) {
    setRowBusy(true);
    setRowError(null);
    const r = await call<Partial<Detail>>(`/api/invoices/${encodeURIComponent(id)}/payments/${entry.id}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason }) }).catch(() => null);
    setRowBusy(false);
    if (!r?.ok || !r.body.invoice || !r.body.payments) return setRowError(r?.body.message ?? 'Couldn’t void that. Try again.');
    setData({ invoice: r.body.invoice, payments: r.body.payments });
    setVoiding(null);
    setVoidReason('');
    setNotice(`Voided ${formatMoney(entry.amount, r.body.invoice.currency)}. It stays in the history.`);
  }

  async function saveEdit(entry: Entry) {
    setRowBusy(true);
    setRowError(null);
    const r = await call<Partial<Detail>>(`/api/invoices/${encodeURIComponent(id)}/payments/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ reference: editRef, note: editNote }) }).catch(() => null);
    setRowBusy(false);
    if (!r?.ok || !r.body.invoice || !r.body.payments) return setRowError(r?.body.message ?? 'Couldn’t save that. Try again.');
    setData({ invoice: r.body.invoice, payments: r.body.payments });
    setEditing(null);
    setNotice('Saved.');
  }

  async function clearMarked() {
    const r = await call<{ ok?: boolean }>(`/api/invoices/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ status: 'unpaid' }) }).catch(() => null);
    if (!r?.ok) return setNotice(r?.body.message ?? 'That didn’t work. Try again.');
    await load();
    setNotice('Marked unpaid.');
  }

  if (problem === 'notfound') {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">That invoice isn’t here</p>
        <p className="mt-2 text-muted">It may have been deleted. Quotations don’t take payments, so they have no payments page either.</p>
        <a href="/app/invoices" className={`${PRIMARY} mt-5`}>
          All invoices
        </a>
      </div>
    );
  }
  if (problem) return <p role="alert" className="text-strong">{problem}</p>;
  if (!data || !summary) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const inv = data.invoice;
  const money = (n: number) => formatMoney(n, inv.currency);
  const live = data.payments.filter((p) => !p.voidedAt);
  const markedPaid = summary.state === 'marked_paid';
  const canRecord = summary.outstanding > 0 || markedPaid;
  const overdueDays = summary.overdue && inv.dueDate ? daysBetween(inv.dueDate, today) : 0;
  const reviewCents = (() => {
    const a = parseAmount(amount);
    return a.ok ? a.cents : 0;
  })();
  const remainingAfter = markedPaid ? toCents(inv.total) - reviewCents : toCents(summary.outstanding) - reviewCents;

  return (
    <div className="space-y-8">
      <section aria-labelledby="pay-summary-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pay-summary-h" className="font-display text-xl font-bold text-ink">
              {inv.number || 'Untitled invoice'}
            </h2>
            <p className="mt-0.5 text-strong">{inv.clientName || 'No client yet'}</p>
            {inv.customerId && inv.customerName && (
              <p className="mt-0.5 text-sm">
                <a href={`/app/business/customers/${inv.customerId}`} className="font-semibold text-ink underline underline-offset-2 hover:text-coral-600">
                  Saved customer: {inv.customerName}
                </a>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={inv.status} amountPaid={inv.amountPaid} total={inv.total} dueDate={inv.dueDate} today={today} />
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Invoice total</dt>
            <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-ink" data-testid="pay-total">
              {money(inv.total)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Received</dt>
            <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-ink" data-testid="pay-received">
              {markedPaid ? '—' : money(summary.received)}
            </dd>
            {markedPaid && <p className="mt-1 text-sm text-muted">No payments on record</p>}
          </div>
          <div>
            <dt className="text-sm text-muted">Outstanding</dt>
            <dd className={`mt-1 font-display text-2xl font-bold tabular-nums ${summary.overdue ? 'text-danger-600' : 'text-ink'}`} data-testid="pay-outstanding">
              {money(summary.outstanding)}
            </dd>
            {inv.dueDate && summary.outstanding > 0 && (
              <p className={`mt-1 text-sm ${summary.overdue ? 'font-semibold text-danger-600' : 'text-muted'}`}>
                {summary.overdue ? `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue · was due ${displayDate(inv.dueDate)}` : `Due ${displayDate(inv.dueDate)}`}
              </p>
            )}
          </div>
        </dl>

        {summary.percent !== null && (
          <div className="mt-5">
            <PaymentProgress summary={summary} total={inv.total} currency={inv.currency} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`/invoice-generator?id=${inv.id}`} className={SECONDARY}>
            Open invoice
          </a>
          <a href="/app/invoices" className={SECONDARY}>
            All invoices
          </a>
        </div>
      </section>

      {notice && (
        <p role="status" className="rounded-lg border border-hair bg-wash p-3 text-sm font-semibold text-ink">
          {notice}
        </p>
      )}

      {markedPaid && (
        <section aria-labelledby="legacy-h" className="rounded-xl2 border border-hair bg-wash p-5">
          <h2 id="legacy-h" className="font-display text-base font-bold text-ink">
            Marked paid, with no payments on record
          </h2>
          <p className="mt-1 text-sm text-strong">
            This invoice was marked paid before KaamSolv recorded payments, so there’s no amount, date or method to show. We haven’t guessed any. It counts as settled,
            but not as money received. Add the payments you actually received to keep a proper record — or mark it unpaid if it wasn’t paid after all.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!open && (
              <button type="button" className={PRIMARY} onClick={() => openForm()}>
                Record the payments you received
              </button>
            )}
            <button type="button" className={SECONDARY} onClick={() => void clearMarked()}>
              Mark unpaid
            </button>
          </div>
        </section>
      )}

      {canRecord && !markedPaid && !open && (
        <div>
          <button type="button" className={PRIMARY} onClick={() => openForm()}>
            Record payment
          </button>
        </div>
      )}

      {open && (
        <section aria-labelledby="record-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
          <h2 id="record-h" className="font-display text-lg font-bold text-ink">
            {markedPaid ? 'Record a payment you received' : 'Record a payment'}
          </h2>

          {step === 'edit' ? (
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
              noValidate
            >
              <div>
                <label htmlFor="pay-amount" className={LABEL}>
                  Amount received ({inv.currency})
                </label>
                <input
                  id="pay-amount"
                  ref={amountInput}
                  className={`${INPUT} mt-1 tabular-nums`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={formError ? true : undefined}
                  aria-describedby="pay-owed"
                />
                <p id="pay-owed" className="mt-1 text-sm text-muted">
                  {markedPaid ? `Invoice total ${money(inv.total)}` : `${money(summary.outstanding)} outstanding`}
                </p>
              </div>
              <div>
                <label htmlFor="pay-date" className={LABEL}>
                  Date received
                </label>
                <input id="pay-date" type="date" className={`${INPUT} mt-1`} value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
              <div>
                <label htmlFor="pay-method" className={LABEL}>
                  Paid by
                </label>
                <select id="pay-method" className={`${INPUT} mt-1`} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pay-ref" className={LABEL}>
                  Reference <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="pay-ref" className={`${INPUT} mt-1`} maxLength={MAX_REFERENCE} placeholder="UTR, cheque no., transaction id" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="pay-note" className={LABEL}>
                  Note <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="pay-note" className={`${INPUT} mt-1`} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {formError && (
                <p role="alert" className="font-semibold text-danger-600 sm:col-span-2">
                  {formError}
                </p>
              )}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" className={PRIMARY}>
                  Review
                </button>
                <button type="button" className={SECONDARY} onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4">
              <p className="text-ink" data-testid="pay-review">
                Record <span className="font-bold">{money(reviewCents / 100)}</span> received on <span className="font-bold">{displayDate(paidOn)}</span> by{' '}
                <span className="font-bold">{METHOD_LABELS[method]}</span>
                {reference ? ` (${reference})` : ''}?{' '}
                {remainingAfter > 0 ? `${money(remainingAfter / 100)} will still be outstanding.` : 'That settles the invoice in full.'}
              </p>
              {markedPaid && (
                <p className="mt-2 text-sm text-strong">
                  This invoice was marked paid without payments on record. Recording this replaces that with what you actually received
                  {remainingAfter > 0 ? ` — it will show as partially paid, with ${money(remainingAfter / 100)} outstanding.` : '.'}
                </p>
              )}
              {formError && (
                <p role="alert" className="mt-3 font-semibold text-danger-600">
                  {formError}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button ref={confirmBtn} type="button" className={PRIMARY} disabled={busy} onClick={() => void record()}>
                  {busy ? 'Recording…' : 'Confirm and record'}
                </button>
                <button type="button" className={SECONDARY} disabled={busy} onClick={() => setStep('edit')}>
                  Change
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="mb-3 font-display text-lg font-bold text-ink">
          Payment history
        </h2>
        {data.payments.length === 0 ? (
          <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted">
            {markedPaid ? 'Nothing recorded yet.' : 'No payments yet. When money comes in, record it here and the balance updates itself.'}
          </p>
        ) : (
          <ul aria-label="Payments" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
            {data.payments.map((p) => (
              <li key={p.id} className="p-4" data-voided={p.voidedAt ? 'true' : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className={`font-semibold tabular-nums ${p.voidedAt ? 'text-muted line-through' : 'text-ink'}`}>
                      {money(p.amount)}
                      {p.voidedAt && <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-xs font-semibold no-underline text-strong">Voided</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {displayDate(p.paidOn)} · {METHOD_LABELS[p.method]}
                      {p.reference && <> · Ref {p.reference}</>}
                    </p>
                    {p.note && <p className="mt-1 text-sm text-strong">{p.note}</p>}
                    {p.voidedAt && <p className="mt-1 text-sm text-muted">Voided on {displayDate(p.voidedAt.slice(0, 10))}{p.voidReason ? ` — ${p.voidReason}` : ''}</p>}
                  </div>
                  {!p.voidedAt && editing !== p.id && voiding !== p.id && (
                    <div className="-mr-2 flex gap-1">
                      <button
                        type="button"
                        className={SMALL_BTN}
                        aria-label={`Edit reference and note for the ${money(p.amount)} payment`}
                        onClick={() => {
                          setEditing(p.id);
                          setEditRef(p.reference);
                          setEditNote(p.note);
                          setVoiding(null);
                          setRowError(null);
                        }}
                      >
                        Edit note
                      </button>
                      <button
                        type="button"
                        className={`${SMALL_BTN} hover:text-[#B42318] dark:hover:text-danger-600`}
                        aria-label={`Void the ${money(p.amount)} payment`}
                        onClick={() => {
                          setVoiding(p.id);
                          setVoidReason('');
                          setEditing(null);
                          setRowError(null);
                        }}
                      >
                        Void
                      </button>
                    </div>
                  )}
                </div>

                {editing === p.id && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`er-${p.id}`} className={LABEL}>
                        Reference
                      </label>
                      <input id={`er-${p.id}`} className={`${INPUT} mt-1`} maxLength={MAX_REFERENCE} value={editRef} onChange={(e) => setEditRef(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`en-${p.id}`} className={LABEL}>
                        Note
                      </label>
                      <input id={`en-${p.id}`} className={`${INPUT} mt-1`} maxLength={MAX_NOTE} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                    </div>
                    <p className="text-sm text-muted sm:col-span-2">The amount, date and method can’t be changed. If one is wrong, void this payment and record it again.</p>
                    {rowError && (
                      <p role="alert" className="font-semibold text-danger-600 sm:col-span-2">
                        {rowError}
                      </p>
                    )}
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="button" className={PRIMARY} disabled={rowBusy} onClick={() => void saveEdit(p)}>
                        {rowBusy ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className={SECONDARY} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {voiding === p.id && (
                  <div className="mt-3 rounded-lg border border-hair bg-wash p-3">
                    <p className="text-sm text-ink">
                      Void this {money(p.amount)} payment? The amount goes back to the balance. It stays in the history, marked voided — you can record the right payment afterwards.
                    </p>
                    <label htmlFor={`vr-${p.id}`} className={`${LABEL} mt-3`}>
                      Reason <span className="font-normal text-muted">(optional)</span>
                    </label>
                    <input id={`vr-${p.id}`} className={`${INPUT} mt-1`} maxLength={200} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                    {rowError && (
                      <p role="alert" className="mt-2 font-semibold text-danger-600">
                        {rowError}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button type="button" className={PRIMARY} disabled={rowBusy} onClick={() => void voidEntry(p)}>
                        {rowBusy ? 'Voiding…' : 'Void payment'}
                      </button>
                      <button type="button" className={SECONDARY} onClick={() => setVoiding(null)}>
                        Keep it
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {live.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            {live.length} payment{live.length === 1 ? '' : 's'} counted
            {data.payments.length > live.length ? `, ${data.payments.length - live.length} voided` : ''}.
          </p>
        )}
      </section>
    </div>
  );
}
