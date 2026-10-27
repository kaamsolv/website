import { formatMoney } from '@/app/lib/invoice/money';
import type { PaymentSummary } from '@/app/lib/invoice/payments';
import type { CurrencyCode } from '@/app/lib/invoice/types';

/**
 * How much of an invoice has been received. The bar is a real progressbar with its own text ("25% received"), and the
 * amounts are printed beside it, so colour is never the only signal. Not shown for a legacy "marked paid" invoice,
 * where there is nothing on record to measure.
 */
export function PaymentProgress({
  summary,
  total,
  currency,
  compact = false,
}: {
  summary: PaymentSummary;
  total: number;
  currency: CurrencyCode;
  compact?: boolean;
}) {
  if (summary.percent === null) return null;
  const label = `${summary.percent}% received`;
  return (
    <div className={compact ? 'w-full max-w-xs' : 'w-full'}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
        aria-valuetext={`${formatMoney(summary.received, currency)} of ${formatMoney(total, currency)} received`}
        className={`overflow-hidden rounded-full bg-wash ring-1 ring-inset ring-hair ${compact ? 'h-1.5' : 'h-3'}`}
      >
        <div className="h-full rounded-full bg-teal-500" style={{ width: `${summary.percent}%` }} />
      </div>
      <p className={`mt-1 tabular-nums text-muted ${compact ? 'text-xs' : 'text-sm'}`}>
        <span className="font-semibold text-ink">{formatMoney(summary.received, currency)}</span> of {formatMoney(total, currency)} received
        {' · '}
        {summary.percent}%
      </p>
    </div>
  );
}
