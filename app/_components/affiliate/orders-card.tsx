'use client';

import { useInfo } from '@/app/_components/calc/info-tip';
import { CopyButton } from '@/app/_components/copy-button';
import { WHATSAPP_BUTTON_COMPACT } from '@/app/_components/whatsapp-style';
import { ORDERS_NOTE, SALES_NOTE } from '@/app/lib/affiliate/orders';
import type { MyOrders } from '@/db/affiliate-orders';
import { OrderAmount, SalesLines, StatusChip, orderDay } from './order-bits';

const n = (v: number) => v.toLocaleString('en-IN');

/**
 * An approved affiliate's coupon code and the orders recorded against it (inside a programme card on Joined). Figures are
 * labelled as recorded orders and recorded sales: not visitors, not commission.
 */
export function OrdersCard({ orders, businessName }: { orders: MyOrders; businessName: string }) {
  const ordersInfo = useInfo(ORDERS_NOTE);
  const salesInfo = useInfo(SALES_NOTE);
  const share = `https://wa.me/?text=${encodeURIComponent(`${businessName}: use my code ${orders.coupon} at checkout.`)}`;
  const counts: { key: string; label: string; value: number }[] = [
    { key: '7', label: 'Last 7 days', value: orders.stats.orders.days7 },
    { key: '30', label: 'Last 30 days', value: orders.stats.orders.days30 },
    { key: 'all', label: 'All time', value: orders.stats.orders.all },
  ];

  return (
    <div className="mt-3 rounded-xl border border-hair bg-wash p-3 sm:p-4" data-testid="orders-card">
      <p className="text-sm font-bold text-ink">Your coupon code</p>
      {orders.coupon ? (
        <>
          <p className="mt-1 break-all font-display text-xl font-extrabold tracking-wide text-ink" data-testid="orders-coupon">
            {orders.coupon}
          </p>
          <p className="mt-1 text-sm text-strong">Customers type it at checkout and the order is credited to you.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CopyButton value={orders.coupon} label="Copy code" copiedLabel="Copied" />
            <a href={share} target="_blank" rel="noopener noreferrer" className={WHATSAPP_BUTTON_COMPACT} data-testid="orders-whatsapp">
              Share on WhatsApp
            </a>
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-strong" data-testid="orders-no-coupon">
          {businessName} hasn’t given you a coupon code yet. Orders can only be credited to you once they do, so ask them for one.
        </p>
      )}

      <div className="mt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span>Recorded orders</span>
          {ordersInfo.button}
        </div>
        {ordersInfo.note}
        <dl className="mt-2 grid grid-cols-3 gap-2" data-testid="orders-counts">
          {counts.map((c) => (
            <div key={c.key} className="min-w-0 rounded-lg border border-hair bg-surface px-2 py-2 text-center">
              <dd className="text-lg font-bold tabular-nums text-ink" data-testid={`orders-count-${c.key}`}>
                {n(c.value)}
              </dd>
              <dt className="text-xs leading-tight text-muted">{c.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span>Recorded sales</span>
          {salesInfo.button}
        </div>
        {salesInfo.note}
        <div className="mt-1">
          <SalesLines sales={orders.stats.sales} />
        </div>
      </div>

      {orders.recent.length === 0 ? (
        orders.coupon && <p className="mt-3 text-sm text-muted">No orders recorded yet. When a customer uses your code, it shows up here.</p>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Latest orders</p>
          <ul className="mt-2 divide-y divide-hair rounded-lg border border-hair bg-surface" data-testid="orders-list">
            {orders.recent.map((o) => (
              <li key={`${o.number}-${o.placedAt}`} className="flex items-start justify-between gap-3 px-3 py-2" data-testid="order-row">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-ink">Order {o.number}</p>
                  <p className="text-xs text-muted">{orderDay(o.placedAt)}</p>
                  <div className="mt-1">
                    <StatusChip status={o.status} />
                  </div>
                </div>
                <OrderAmount order={o} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
