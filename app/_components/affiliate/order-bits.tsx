import { ORDER_STATUS_LABEL, formatPaise } from '@/app/lib/affiliate/orders';
import type { OrderRow, SaleTotal } from '@/db/affiliate-orders';

/** Shared small pieces of the order screens: how a date, an amount and an order's state are written. */

export const orderDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "3 minutes ago", "2 hours ago", "5 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** The state as words (never colour alone), with a small outline chip. */
export function StatusChip({ status }: { status: OrderRow['status'] }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-hair px-2.5 py-0.5 text-xs font-bold text-strong" data-testid="order-status">
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * What this order adds to sales, with the refund said out loud beside it so a partial refund is never hidden:
 * "₹1,300" then "₹200 refunded".
 */
export function OrderAmount({ order }: { order: Pick<OrderRow, 'currency' | 'netPaise' | 'refundedPaise' | 'salePaise' | 'status'> }) {
  return (
    <span className="block text-right">
      <span className="block font-bold tabular-nums text-ink" data-testid="order-net">
        {formatPaise(order.netPaise, order.currency)}
      </span>
      {order.refundedPaise > 0 && (
        <span className="block text-xs text-muted" data-testid="order-refunded">
          {formatPaise(order.refundedPaise, order.currency)} refunded
        </span>
      )}
    </span>
  );
}

/** "₹18,400 in the last 30 days · ₹52,000 in all", one line per currency. */
export function SalesLines({ sales }: { sales: SaleTotal[] }) {
  if (sales.length === 0) return <p className="text-sm text-muted">No sales recorded yet.</p>;
  return (
    <ul className="space-y-0.5 text-sm text-strong" data-testid="sales-lines">
      {sales.map((s) => (
        <li key={s.currency}>
          <span className="font-bold tabular-nums text-ink">{formatPaise(s.days30, s.currency)}</span> in the last 30 days ·{' '}
          <span className="font-bold tabular-nums text-ink">{formatPaise(s.all, s.currency)}</span> in all
        </li>
      ))}
    </ul>
  );
}
