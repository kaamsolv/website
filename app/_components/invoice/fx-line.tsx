'use client';

import { useEffect, useState } from 'react';
import { FX_CURRENCIES, FX_NOTE, fromInr, toInr, type FxRate, type InrRates } from '@/app/lib/invoice/fx';
import { displayDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { useEntitlements } from '@/app/lib/me-client';

/**
 * Pro: currency reference rates (Frankfurter, via /api/fx). Rupees per USD /
 * EUR / GBP / AED. Null until loaded, and stays null if the rates aren't
 * available — callers just show nothing then. On screen only; never printed.
 */
export function useFxRates(): InrRates | null {
  const { can } = useEntitlements();
  const allowed = can('invoice_fx_rates');
  const [rates, setRates] = useState<InrRates | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    fetch('/api/fx', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { rates?: InrRates } | null) => live && b?.rates && Object.keys(b.rates).length > 0 && setRates(b.rates))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [allowed]);
  return allowed ? rates : null;
}

/** "1 USD = ₹94.80 · rate of 23 Oct · Frankfurter". */
export const rateText = (code: string, rate: FxRate) =>
  `1 ${code} = ${formatMoney(rate.rate, 'INR')}${rate.date ? ` · rate of ${displayDate(rate.date)}` : ''} · Frankfurter`;

/**
 * Under the toolbar in the editor: what this invoice is worth in rupees today
 * (foreign currency), or in a currency you pick (rupee invoice). Reference
 * only — not on the PDF, and not a figure for GST.
 */
export function FxLine({ currency, total }: { currency: CurrencyCode; total: number }) {
  const rates = useFxRates();
  const [other, setOther] = useState<(typeof FX_CURRENCIES)[number]>('USD');
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  if (!rates || !(total > 0)) return null;

  const foreign = currency !== 'INR';
  const rate = foreign ? rates[currency as (typeof FX_CURRENCIES)[number]] : rates[other];
  if (!rate) return null;
  const code = foreign ? currency : other;
  const amount = foreign ? formatMoney(toInr(total, rate), 'INR') : formatMoney(fromInr(total, rate), code);

  return (
    <section aria-label="Currency rate" className="mb-4 rounded-xl2 border border-hair bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-ink" data-testid="fx-line">
          <span className="font-semibold">≈ {amount}</span>
          <span className="text-muted"> · {rateText(code, rate)}</span>
        </p>
        {!foreign && (
          <label className="flex items-center gap-2 text-muted">
            <span className="sr-only sm:not-sr-only">See in</span>
            <select
              value={other}
              onChange={(e) => setOther(e.target.value as typeof other)}
              aria-label="See this total in"
              className="h-10 rounded-lg border border-hair bg-fieldbg px-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              {FX_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => {
            const done = (v: 'yes' | 'no') => {
              setCopied(v);
              setTimeout(() => setCopied(null), 2000);
            };
            // Some browsers refuse clipboard access; say so instead of failing quietly.
            (navigator.clipboard?.writeText(`≈ ${amount}`) ?? Promise.reject(new Error('no clipboard'))).then(() => done('yes'), () => done('no'));
          }}
          className="inline-flex h-10 items-center rounded-full border border-hair px-4 font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          {copied === 'yes' ? 'Copied' : copied === 'no' ? 'Couldn’t copy' : 'Copy'}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">{FX_NOTE} Shown here only — it isn’t on the PDF.</p>
    </section>
  );
}
