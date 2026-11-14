'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Notice } from '@/app/_components/notice';
import { Skeleton } from '@/app/_components/skeleton';
import { useInfo } from '@/app/_components/calc/info-tip';
import { SALES_NOTE, ORDERS_NOTE } from '@/app/lib/affiliate/orders';
import type { MerchantOrderRow } from '@/db/affiliate-orders';
import { OrderAmount, StatusChip, orderDay } from './order-bits';

/**
 * The latest orders credited to your affiliates (/app/affiliate/orders). A table from tablet width up and a stacked list
 * on a phone, so nothing scrolls sideways. Figures are recorded orders and recorded sales: not commission.
 */
export function OrdersList() {
  const [rows, setRows] = useState<MerchantOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const info = useInfo(`${ORDERS_NOTE.replace('your coupon code', 'an affiliate’s coupon code')} ${SALES_NOTE}`);

  useEffect(() => {
    fetch('/api/affiliate/orders', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) return setRows([]);
        if (!r.ok) throw new Error('load');
        setRows(((await r.json()) as { orders: MerchantOrderRow[] }).orders);
      })
      .catch(() => setError('Couldn’t load the orders. Refresh to try again.'));
  }, []);

  if (error) return <Notice role="alert">{error}</Notice>;
  if (rows === null) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>Recorded orders and sales, newest first. Sales are net of refunds and before tax and shipping.</span>
        {info.button}
      </div>
      {info.note}

      {rows.length === 0 ? (
        <div className="rounded-xl2 border border-hair bg-surface p-4 text-sm text-strong" data-testid="orders-empty">
          <p className="font-semibold text-ink">No orders recorded yet.</p>
          <p className="mt-1">
            Connect your store in{' '}
            <Link href="/app/affiliate/portal" className="font-bold underline">
              Portal settings
            </Link>
            , then give each approved affiliate a coupon code on the{' '}
            <Link href="/app/affiliate/applications?status=approved" className="font-bold underline">
              Applications
            </Link>{' '}
            page. Orders that use a code show up here.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-hair rounded-xl2 border border-hair bg-surface sm:hidden" data-testid="orders-stack">
            {rows.map((o) => (
              <li key={`${o.applicationId}-${o.number}-${o.placedAt}`} className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-ink">Order {o.number}</p>
                  <p className="break-words text-xs text-muted">
                    {orderDay(o.placedAt)} · {o.displayName || 'An affiliate'} · {o.couponCode}
                  </p>
                  <div className="mt-1">
                    <StatusChip status={o.status} />
                  </div>
                </div>
                <OrderAmount order={o} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-xl2 border border-hair bg-surface sm:block">
            <table className="w-full text-left text-sm" data-testid="orders-table">
              <caption className="sr-only">Recorded orders credited to your affiliates</caption>
              <thead className="border-b border-hair bg-wash text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Order</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Affiliate</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Coupon</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {rows.map((o) => (
                  <tr key={`${o.applicationId}-${o.number}-${o.placedAt}`} data-testid="orders-table-row">
                    <td className="whitespace-nowrap px-3 py-2 text-strong">{orderDay(o.placedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">{o.number}</td>
                    <td className="break-words px-3 py-2 text-strong">{o.displayName || 'An affiliate'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-strong">{o.couponCode}</td>
                    <td className="px-3 py-2">
                      <StatusChip status={o.status} />
                    </td>
                    <td className="px-3 py-2">
                      <OrderAmount order={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
