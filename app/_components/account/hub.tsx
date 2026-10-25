'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { useEntitlements, useMe } from '@/app/lib/me-client';

/**
 * "Your KaamSolv": a card per tool that has account features, each with its
 * own plan. Only real tools — no placeholder cards (CLAUDE.md §13); new tools
 * join here when they get accounts. "Plans and billing" arrives with payments.
 */
export function Hub() {
  const me = useMe();
  const { can, limit } = useEntitlements();
  const pro = can('invoice_dashboard');
  const [unpaid, setUnpaid] = useState<{ currency: CurrencyCode; unpaid: number }[] | null>(null);

  useEffect(() => {
    if (!pro) return;
    fetch(`/api/dashboard?today=${isoDate(new Date())}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { totals?: { currency: CurrencyCode; unpaid: number }[] } | null) => setUnpaid(b?.totals ?? []))
      .catch(() => setUnpaid([]));
  }, [pro]);

  if (me.status !== 'signed-in') return <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const saved = me.usage.invoiceSave;
  const saveLimit = limit('invoice_save');
  const qrLimit = limit('qr_dynamic');
  const unpaidText = unpaid?.filter((t) => t.unpaid > 0).map((t) => `${formatMoney(t.unpaid, t.currency)} unpaid`).join(' · ');
  const detail = pro ? [`${saved} saved`, unpaidText || (unpaid ? 'nothing unpaid' : '')].filter(Boolean).join(' · ') : `${saved} of ${saveLimit ?? '∞'} saved`;

  return (
    <div className="space-y-8">
      <ul aria-label="Your tools" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li className="rounded-xl2 border border-hair bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">Invoices</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pro ? 'bg-purplex-100 text-purplex-600' : 'bg-wash text-strong'}`}>
              {pro ? 'Pro' : 'Free'}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">{detail}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
            <a href={pro ? '/app/invoices/overview' : '/app/invoices'} className="inline-flex items-center gap-1 text-ink underline underline-offset-2 hover:text-coral-600">
              Open invoices <Icon name="arrow-right" className="h-4 w-4" />
            </a>
            <a href="/invoice-generator" className="text-strong underline underline-offset-2 hover:text-coral-600">
              New invoice
            </a>
          </div>
        </li>
        <li className="rounded-xl2 border border-hair bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">QR codes</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${qrLimit === null ? 'bg-purplex-100 text-purplex-600' : 'bg-wash text-strong'}`}>
              {qrLimit === null ? 'Pro' : 'Free'}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">{qrLimit === null ? `${me.usage.qrCodes} tracked` : `${me.usage.qrCodes} of ${qrLimit} tracked`}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
            <a href="/app/qr" className="inline-flex items-center gap-1 text-ink underline underline-offset-2 hover:text-coral-600">
              Open QR codes <Icon name="arrow-right" className="h-4 w-4" />
            </a>
            <a href="/qr-code-generator" className="text-strong underline underline-offset-2 hover:text-coral-600">
              New QR code
            </a>
          </div>
        </li>
      </ul>

      <section aria-labelledby="shared-h" className="rounded-xl2 border border-hair bg-surface p-5">
        <h2 id="shared-h" className="font-display text-lg font-bold text-ink">
          Shared across your business tools
        </h2>
        <p className="mt-1 text-sm text-muted">Fill these in once — invoices (and later quotations, receipts and UPI QR codes) use them.</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <a href="/app/business" className="text-ink underline underline-offset-2 hover:text-coral-600">
            Business profile
          </a>
          <a href="/app/business/customers" className="text-ink underline underline-offset-2 hover:text-coral-600">
            Customers ({me.usage.customers})
          </a>
          <a href="/app/business/items" className="text-ink underline underline-offset-2 hover:text-coral-600">
            Items
          </a>
        </div>
      </section>

      <p className="text-sm text-muted">
        Looking for something else?{' '}
        <a href="/tools" className="font-semibold text-ink underline underline-offset-2">
          See all tools
        </a>
      </p>
    </div>
  );
}
