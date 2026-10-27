'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRIMARY } from './account-shell';
import { priceLabel, type BillingPeriod } from '@/app/lib/billing/plans';
import { refreshMe } from '@/app/lib/me-client';
import type { BillingStatus, Price } from '@/db/billing';

type PaymentRow = Omit<BillingStatus['payments'][number], 'invoiceId'> & { invoiceUrl: string | null };
type Loaded = { subscriptions: BillingStatus['subscriptions']; payments: PaymentRow[]; configured: boolean; prices: Price[] };

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { email: string };
  theme: { color: string };
  handler: () => void;
  modal: { ondismiss: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const BLURB: Record<string, string> = {
  invoice_pro: 'Overview, payments and collections, reports, recurring reminders, no watermark.',
  qr_pro: 'Campaigns, scan breakdowns and exports for your tracked QR codes.',
  invoice_qr_bundle: 'Everything in Invoice Pro and QR Pro, for less.',
};

const PAYMENT_WORDS: Record<string, string> = {
  created: 'Started',
  paid: 'Paid',
  failed: 'Didn’t go through',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

function loadCheckoutScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Plans and billing. Buying opens Razorpay's checkout; the plan switches on when KaamSolv's server hears
 * from Razorpay that the payment went through — so after paying this page waits for that, not for the
 * checkout window to say "success".
 */
export function BillingPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'wait'; text: string } | null>(null);

  const load = useCallback(async (): Promise<Loaded | null> => {
    const res = await fetch('/api/billing/status', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json()) as Loaded;
  }, []);

  useEffect(() => {
    load().then((d) => (d ? setData(d) : setLoadError(true)));
  }, [load]);

  /** After checkout closes with "paid": wait for the server to confirm, for up to about a minute. */
  async function waitForConfirmation(before: number) {
    setNotice({ tone: 'wait', text: 'Payment received. Confirming it with Razorpay…' });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const d = await load();
      if (d && d.payments.filter((p) => p.status === 'paid').length > before) {
        setData(d);
        await refreshMe();
        setNotice({ tone: 'ok', text: 'You’re all set. Your plan is on.' });
        return;
      }
    }
    setNotice({ tone: 'wait', text: 'Still confirming. If you were charged, your plan will switch on shortly. Refresh this page in a minute.' });
  }

  async function resend(paymentId: string) {
    const res = await fetch(`/api/billing/payments/${paymentId}/resend`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string } | null;
    setNotice({ tone: res?.ok ? 'ok' : 'error', text: body?.message ?? 'We couldn’t send that. Try again in a moment.' });
  }

  async function buy(planKey: string) {
    if (!data) return;
    setBusy(planKey);
    setNotice(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey, period }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; keyId?: string; orderId?: string; amountPaise?: number; currency?: string; description?: string; email?: string } | null;
      if (!res.ok || !body?.ok || !body.keyId || !body.orderId || body.amountPaise === undefined || !body.currency) {
        setNotice({ tone: 'error', text: body?.message ?? 'We couldn’t start the payment. Nothing was charged.' });
        return;
      }
      if (!(await loadCheckoutScript()) || !window.Razorpay) {
        setNotice({ tone: 'error', text: 'The payment window didn’t load. Check your connection and try again. Nothing was charged.' });
        return;
      }
      const paidBefore = data.payments.filter((p) => p.status === 'paid').length;
      new window.Razorpay({
        key: body.keyId,
        order_id: body.orderId,
        amount: body.amountPaise,
        currency: body.currency,
        name: 'KaamSolv',
        description: body.description ?? 'KaamSolv plan',
        prefill: { email: body.email ?? '' },
        theme: { color: '#FE6336' },
        handler: () => {
          void waitForConfirmation(paidBefore);
        },
        modal: { ondismiss: () => setBusy(null) },
      }).open();
    } finally {
      setBusy((b) => (b === planKey ? null : b));
    }
  }

  if (loadError) return <p className="text-muted">We couldn’t load your plans. Refresh the page to try again.</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const ORDER = ['invoice_pro', 'qr_pro', 'invoice_qr_bundle'];
  const planKeys = [...new Set(data.prices.map((p) => p.planKey))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const priceOf = (planKey: string) => data.prices.find((p) => p.planKey === planKey && p.period === period);
  const activeNow = data.subscriptions.filter((s) => s.active);

  return (
    <div className="space-y-8">
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${notice.tone === 'error' ? 'border-danger-700 text-danger-700' : 'border-teal-300 bg-tealx-100 text-strong'}`}
          data-testid="billing-notice"
        >
          {notice.text}
        </p>
      )}

      <section aria-labelledby="yours-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <h2 id="yours-h" className="font-display text-lg font-bold text-ink">
          Your plan
        </h2>
        {activeNow.length === 0 ? (
          <p className="mt-2 text-muted" data-testid="billing-free">
            You’re on the free account. Everything free stays free.
          </p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="billing-active">
            {activeNow.map((s) => (
              <li key={s.planKey} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{s.name}</span>
                <span className="text-sm text-muted">{s.currentPeriodEnd ? `Runs until ${date(s.currentPeriodEnd)}` : 'No end date'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!data.configured ? (
        <p className="rounded-xl border border-dashed border-hair bg-surface px-5 py-8 text-center text-muted" data-testid="billing-off">
          Payments aren’t switched on yet. Plans will show here as soon as they are.
        </p>
      ) : (
        <section aria-labelledby="plans-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="plans-h" className="font-display text-lg font-bold text-ink">
              Plans
            </h2>
            <div role="group" aria-label="Billing period" className="inline-flex rounded-full border border-hair bg-wash p-1">
              {(['month', 'year'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={period === p}
                  onClick={() => setPeriod(p)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold ${period === p ? 'bg-navy-900 text-white' : 'text-strong'}`}
                >
                  {p === 'month' ? 'Monthly' : 'Yearly'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {planKeys.map((planKey) => {
              const price = priceOf(planKey);
              if (!price) return null;
              return (
                <article key={planKey} className="flex flex-col rounded-xl2 border border-hair bg-surface p-5">
                  <h3 className="font-display text-base font-bold text-ink">{price.name}</h3>
                  <p className="mt-1 text-sm text-muted">{BLURB[planKey]}</p>
                  <p className="mt-auto pt-4 font-display text-3xl font-extrabold text-ink">
                    {priceLabel(price.amountPaise)}
                    <span className="text-base font-semibold text-muted"> / {period === 'month' ? 'month' : 'year'}</span>
                  </p>
                  <button type="button" className={`${PRIMARY} mt-4`} disabled={busy !== null} onClick={() => buy(planKey)} data-testid={`buy-${planKey}`}>
                    {busy === planKey ? 'Opening…' : `Get ${price.name}`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {data.payments.length > 0 && (
        <section aria-labelledby="hist-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
          <h2 id="hist-h" className="font-display text-lg font-bold text-ink">
            Payments
          </h2>
          <ul className="mt-3 divide-y divide-hair">
            {data.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="text-ink">
                  {p.name} · {p.period === 'year' ? 'yearly' : 'monthly'}
                </span>
                <span className="text-sm text-muted">
                  {priceLabel(p.amountPaise)} · {PAYMENT_WORDS[p.status] ?? p.status} · {date(p.paidAt ?? p.createdAt)}
                </span>
                {p.status === 'paid' && (
                  <span className="flex w-full flex-wrap items-center gap-3 text-sm">
                    {p.invoiceUrl ? (
                      <a href={p.invoiceUrl} className="font-semibold text-coral-600 underline underline-offset-2" data-testid="invoice-open">
                        Invoice {p.invoiceNumber}
                      </a>
                    ) : (
                      <span className="text-muted">{p.invoiceNumber ? 'The invoice link has run out. Email it to me again for a fresh one.' : 'Your invoice is being prepared.'}</span>
                    )}
                    <button type="button" className="font-semibold text-coral-600 underline underline-offset-2" onClick={() => resend(p.id)}>
                      Email it to me again
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.configured && (
        <p className="text-sm text-muted">Paying by card, UPI or netbanking goes through Razorpay. KaamSolv never sees your card details.</p>
      )}
    </div>
  );
}
