import { SECONDARY } from './account-shell';
import { displayDate } from '@/app/lib/invoice/defaults';
import { STATE_FILTER_LABELS, bucketLabel, type FilterState } from '@/app/lib/invoice/filters';
import { isAgeingBucket } from '@/app/lib/invoice/collections';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';

export type FilterTotal = { currency: CurrencyCode; count: number; total: number; balance: number; receivedInPeriod?: number };

type Chip = { label: string; remove: string[] };

/** Every param the list understands, other than the page number. A chip's link keeps the rest and drops its own. */
const KEEP = ['state', 'currency', 'bucket', 'issuedFrom', 'issuedTo', 'paidFrom', 'paidTo', 'customer', 'q', 'kind', 'sort', 'pageSize'] as const;

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
  const text = p.get('q');
  if (text) chips.push({ label: `Search: “${text}”`, remove: ['q'] });
  const kind = p.get('kind');
  if (kind === 'invoice' || kind === 'quote') chips.push({ label: kind === 'quote' ? 'Quotations only' : 'Invoices only', remove: ['kind'] });
  return chips;
}

export function hrefWithout(p: URLSearchParams, remove: string[]): string {
  const q = new URLSearchParams();
  for (const k of KEEP) if (p.has(k) && !remove.includes(k)) q.set(k, p.get(k)!);
  const s = q.toString();
  return s ? `/app/invoices?${s}` : '/app/invoices';
}

/**
 * Shown on All invoices when the list is narrowed — by a link from Payments & collections, by a search, or by
 * type: what is being shown, each filter removable, and totals over **every** match, which is the number that
 * reconciles with the card or chart clicked however many pages the list has.
 */
export function InvoiceFilterBar({
  params,
  totals,
  matched,
  customerName,
  onNavigate,
}: {
  params: URLSearchParams;
  totals: FilterTotal[];
  matched: number;
  customerName: string | null;
  /** Lets the list change the URL without a reload; plain clicks only. */
  onNavigate?: (href: string, e: React.MouseEvent) => void;
}) {
  const chips = chipsOf(params, customerName);
  const invoiceCount = totals.reduce((n, t) => n + t.count, 0);
  const quotes = matched - invoiceCount;
  const receivedPeriod = params.get('paidFrom') || params.get('paidTo');
  return (
    <section aria-label="Filters on this list" className="mb-4 rounded-xl2 border border-hair bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted">Showing</span>
        <ul className="contents">
          {chips.map((c) => {
            const href = hrefWithout(params, c.remove);
            return (
              <li key={c.label}>
                <a
                  href={href}
                  onClick={(e) => onNavigate?.(href, e)}
                  aria-label={`Remove filter: ${c.label}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hair bg-wash px-3 text-sm font-semibold text-ink hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                >
                  {c.label}
                  <span aria-hidden="true">×</span>
                </a>
              </li>
            );
          })}
        </ul>
        <a href="/app/invoices" onClick={(e) => onNavigate?.('/app/invoices', e)} className={`${SECONDARY} ml-auto h-9 px-4`}>
          Clear filters
        </a>
      </div>
      <p className="mt-3 text-sm text-strong" role="status" data-testid="filter-totals">
        {matched === 0 ? (
          'No invoices match these filters.'
        ) : (
          <>
            {totals.map((t) => (
              <span key={t.currency} className="mr-4 inline-block">
                <span className="font-semibold text-ink">
                  {t.count} invoice{t.count === 1 ? '' : 's'}
                </span>{' '}
                · {formatMoney(t.total, t.currency)} invoiced · <span className="font-semibold text-ink">{formatMoney(t.balance, t.currency)} outstanding</span>
                {receivedPeriod && t.receivedInPeriod !== undefined ? <> · {formatMoney(t.receivedInPeriod, t.currency)} received in this period</> : null}
                {totals.length > 1 ? ` (${t.currency})` : ''}
              </span>
            ))}
            {quotes > 0 && (
              <span className="inline-block">
                {invoiceCount > 0 ? '+ ' : ''}
                <span className="font-semibold text-ink">
                  {quotes} quotation{quotes === 1 ? '' : 's'}
                </span>
              </span>
            )}
          </>
        )}
      </p>
    </section>
  );
}
