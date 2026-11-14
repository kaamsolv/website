'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { useEntitlements, useMe } from '@/app/lib/me-client';
import { Skeleton } from '@/app/_components/skeleton';
import { PRODUCTS, productPageHref } from '@/app/lib/products';
import { CARD, CARD_QUIET, PRIMARY, SECONDARY } from '@/app/lib/ui-classes';
import { AffiliateHubCard } from '../affiliate/hub-card';
import { ProductChip } from './product-chip';

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

  if (me.status !== 'signed-in') return <Skeleton className="h-40" />;

  const saved = me.usage.invoiceSave;
  const saveLimit = limit('invoice_save');
  const qrLimit = limit('qr_dynamic');
  const unpaidText = unpaid?.filter((t) => t.unpaid > 0).map((t) => `${formatMoney(t.unpaid, t.currency)} unpaid`).join(' · ');
  const detail = pro ? [`${saved} saved`, unpaidText || (unpaid ? 'nothing unpaid' : '')].filter(Boolean).join(' · ') : `${saved} of ${saveLimit ?? '∞'} saved`;

  const qrPro = can('qr_campaigns');
  const qrDetail = qrLimit === null ? `${me.usage.qrCodes} tracked` : `${me.usage.qrCodes} of ${qrLimit} tracked`;
  const byslug = (slug: string) => PRODUCTS.find((x) => x.slug === slug)!;
  const cards = [
    { p: byslug('invoices'), isPro: pro, detail, open: pro ? '/app/invoices/overview' : '/app/invoices', openLabel: 'Open invoices', make: '/app/invoices/editor', makeLabel: 'New invoice' },
    { p: byslug('qr'), isPro: qrPro, detail: qrDetail, open: '/app/qr', openLabel: 'Open QR codes', make: '/app/qr/new', makeLabel: 'New QR code' },
  ];

  return (
    <div className="space-y-6">
      <ul aria-label="Your tools" className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ p, isPro, detail: line, open, openLabel, make, makeLabel }) => (
          <li key={p.slug} className={`${CARD} flex flex-col`}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-ink">{p.name}</h2>
              <ProductChip state={isPro ? 'pro' : 'free'} />
            </div>
            <p className="mt-2 text-sm text-muted">{line}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a href={open} className={SECONDARY}>
                {openLabel} <Icon name="arrow-right" className="h-4 w-4" />
              </a>
              <a href={make} className={PRIMARY}>
                {makeLabel}
              </a>
            </div>
            {!isPro && (
              <p className="mt-5 border-t border-hair pt-3 text-sm text-muted">
                <a href={productPageHref(p)} className="font-semibold text-coralx-600 underline underline-offset-2">
                  See what {p.planName} adds
                </a>
              </p>
            )}
          </li>
        ))}
      </ul>

      <AffiliateHubCard />

      <section aria-labelledby="shared-h" className={CARD_QUIET}>
        <h2 id="shared-h" className="font-display text-lg font-bold text-ink">
          Shared across your business tools
        </h2>
        <p className="mt-1 text-sm text-muted">Fill these in once — invoices (and later quotations, receipts and UPI QR codes) use them.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/app/business" className={SECONDARY}>
            Business profile
          </a>
          <a href="/app/business/customers" className={SECONDARY}>
            Customers ({me.usage.customers})
          </a>
          <a href="/app/business/items" className={SECONDARY}>
            Items
          </a>
        </div>
      </section>
    </div>
  );
}
