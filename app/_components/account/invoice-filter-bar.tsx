import { SECONDARY } from './account-shell';
import { displayDate } from '@/app/lib/invoice/defaults';
import { FILTER_KEYS, STATE_FILTER_LABELS, bucketLabel, type FilterState } from '@/app/lib/invoice/filters';
import { isAgeingBucket } from '@/app/lib/invoice/collections';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';

export type FilterTotal = { currency: CurrencyCode; count: number; total: number; balance: number; receivedInPeriod?: number };

type Chip = { label: string; remove: string[] };

/** The filters in the URL, as removable chips. A date range is one chip (both ends go together). */
function chipsOf(p: URLSearchParams, customerName: string | null): Chip[] {
  const chips: Chip[] = [];
  const state = p.get('state');
  if (state && state in STATE_FILTER_LABELS) chips.push({ label: STATE_FILTER_LABELS[state as FilterState], remove: ['state'] });
  const bucket = p.get('bucket');
  if (bucket && isAgeingBucket(bucket)) chips.push({ label: `Age: ${bucketLabel(bucket)}`, remove: ['bucket'] });
  const currency = p.get('currency');
  if (currency) chips.push({ label: currency, remove: ['currency'] });
  const range = (from: string | null, to: string | null) => `${from ? displayDate(from) : 'the beginning'} – ${to ? displayDate(to) : 'now'}`;
  if (p.get('issuedFrom') || p.get('issuedTo')) chips.push({ label: `Issued ${range(p.get('issuedFrom'), p.get('issuedTo'))}`, remove: ['issuedFrom', 'issuedTo'] });
  if (p.get('paidFrom') || p.get('paidTo')) chips.push({ label: `Paid ${range(p.get('paidFrom'), p.get('paidTo'))}`, remove: ['paidFrom', 'paidTo'] });
  if (p.get('customer')) chips.push({ label: `Customer: ${customerName ?? 'saved customer'}`, remove: ['customer'] });
  return chips;
}

function hrefWithout(p: URLSearchParams, remove: string[]): string {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) if (p.has(k) && !remove.includes(k)) q.set(k, p.get(k)!);
  const s = q.toString();
  return s ? `/app/invoices?${s}` : '/app/invoices';
}

/**
 * Shown on All invoices when it was opened from Payments & collections (or any filtered link): what is being
 * shown, each filter removable, and totals over **every** match — which is the number that reconciles with the
 * card or chart clicked, even when the list itself is cut at 200 rows.
 */
export function InvoiceFilterBar({
  params,
  totals,
  capped,
  shown,
  customerName,
}: {
  params: URLSearchParams;
  totals: FilterTotal[];
  capped: boolean;
  shown: number;
  customerName: string | null;
}) {
  const chips = chipsOf(params, customerName);
  const all = totals.reduce((n, t) => n + t.count, 0);
  const receivedPeriod = params.get('paidFrom') || params.get('paidTo');
  return (
    <section aria-label="Filters on this list" className="mb-4 rounded-xl2 border border-hair bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted">Showing</span>
        <ul className="contents">
          {chips.map((c) => (
            <li key={c.label}>
              <a
                href={hrefWithout(params, c.remove)}
                aria-label={`Remove filter: ${c.label}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hair bg-wash px-3 text-sm font-semibold text-ink hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
              >
                {c.label}
                <span aria-hidden="true">×</span>
              </a>
            </li>
          ))}
        </ul>
        <a href="/app/invoices" className={`${SECONDARY} ml-auto h-9 px-4`}>
          Clear filters
        </a>
      </div>
      <p className="mt-3 text-sm text-strong" role="status" data-testid="filter-totals">
        {all === 0 ? (
          'No invoices match these filters.'
        ) : (
          totals.map((t) => (
            <span key={t.currency} className="mr-4 inline-block">
              <span className="font-semibold text-ink">
                {t.count} invoice{t.count === 1 ? '' : 's'}
              </span>{' '}
              · {formatMoney(t.total, t.currency)} invoiced · <span className="font-semibold text-ink">{formatMoney(t.balance, t.currency)} outstanding</span>
              {receivedPeriod && t.receivedInPeriod !== undefined ? <> · {formatMoney(t.receivedInPeriod, t.currency)} received in this period</> : null}
              {totals.length > 1 ? ` (${t.currency})` : ''}
            </span>
          ))
        )}
        {capped && ` Showing the first ${shown} of ${all}. Narrow the filters to see the rest.`}
      </p>
    </section>
  );
}
