/**
 * Invoice list filters — the vocabulary the Payments & Collections page links with and the
 * All invoices list understands (`/app/invoices?state=overdue&currency=INR`). Framework-free.
 *
 * One definition serves both: `db/invoice-filters.ts` turns a parsed filter into SQL, and the
 * dashboard's numbers use the same state / bucket rules, so every drill-down list adds up to the
 * card or chart it came from. These only narrow a user's *own* invoices, so every account may use
 * them; the analytics around them are what's Pro.
 *
 * Any filter at all means "invoices only" (quotations have no balance, payments or due status).
 */

import { AGEING_BUCKETS, isAgeingBucket, type AgeingBucket } from './collections';
import { clientTodayOk, isIsoDate } from './recurring';
import { CURRENCIES, type CurrencyCode } from './types';

export const FILTER_STATES = ['unpaid', 'partial', 'paid', 'marked_paid', 'outstanding', 'overdue'] as const;
export type FilterState = (typeof FILTER_STATES)[number];

export const STATE_FILTER_LABELS: Record<FilterState, string> = {
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  paid: 'Paid',
  marked_paid: 'Marked paid',
  outstanding: 'Outstanding (unpaid + partially paid)',
  overdue: 'Overdue',
};

export type InvoiceFilter = {
  state?: FilterState;
  currency?: CurrencyCode;
  bucket?: AgeingBucket;
  /** Invoices issued between these dates (inclusive). */
  issuedFrom?: string;
  issuedTo?: string;
  /** Invoices that took a (non-voided) payment dated between these dates (inclusive). */
  paidFrom?: string;
  paidTo?: string;
  /** A saved customer's id. */
  customer?: string;
};

export const FILTER_KEYS = ['state', 'currency', 'bucket', 'issuedFrom', 'issuedTo', 'paidFrom', 'paidTo', 'customer'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hasFilter = (f: InvoiceFilter): boolean => FILTER_KEYS.some((k) => f[k] !== undefined);
export const hasFilterParams = (q: URLSearchParams): boolean => FILTER_KEYS.some((k) => q.has(k));

/** `today` matters only for overdue and ageing buckets. */
export const filterNeedsToday = (f: InvoiceFilter): boolean => f.state === 'overdue' || f.bucket !== undefined;

export type ParsedFilter = { ok: true; filter: InvoiceFilter; today: string | null } | { ok: false; message: string };

/** Validates the filter params of `GET /api/invoices` (and of the list page's own URL). */
export function parseInvoiceFilter(q: URLSearchParams, serverNow: Date = new Date()): ParsedFilter {
  const filter: InvoiceFilter = {};
  const state = q.get('state');
  if (state !== null) {
    if (!(FILTER_STATES as readonly string[]).includes(state)) return { ok: false, message: 'That status filter isn’t valid.' };
    filter.state = state as FilterState;
  }
  const currency = q.get('currency');
  if (currency !== null) {
    if (!(CURRENCIES as readonly string[]).includes(currency)) return { ok: false, message: 'That currency isn’t supported.' };
    filter.currency = currency as CurrencyCode;
  }
  const bucket = q.get('bucket');
  if (bucket !== null) {
    if (!isAgeingBucket(bucket)) return { ok: false, message: 'That ageing filter isn’t valid.' };
    filter.bucket = bucket;
  }
  for (const key of ['issuedFrom', 'issuedTo', 'paidFrom', 'paidTo'] as const) {
    const v = q.get(key);
    if (v === null) continue;
    if (!isIsoDate(v)) return { ok: false, message: 'Use dates like 2026-04-01.' };
    filter[key] = v;
  }
  if ((filter.issuedFrom && filter.issuedTo && filter.issuedFrom > filter.issuedTo) || (filter.paidFrom && filter.paidTo && filter.paidFrom > filter.paidTo)) {
    return { ok: false, message: 'The start date has to be on or before the end date.' };
  }
  const customer = q.get('customer');
  if (customer !== null) {
    if (!UUID_RE.test(customer)) return { ok: false, message: 'That customer filter isn’t valid.' };
    filter.customer = customer.toLowerCase();
  }
  let today: string | null = null;
  if (filterNeedsToday(filter)) {
    const t = q.get('today');
    if (!clientTodayOk(t, serverNow)) return { ok: false, message: 'Your device’s date looks off. Check your clock and try again.' };
    today = t;
  }
  return { ok: true, filter, today };
}

export function filterToParams(f: InvoiceFilter): URLSearchParams {
  const p = new URLSearchParams();
  for (const key of FILTER_KEYS) if (f[key] !== undefined) p.set(key, String(f[key]));
  return p;
}

/** Where a dashboard card or chart element sends you. */
export const invoicesHref = (f: InvoiceFilter): string => {
  const q = filterToParams(f).toString();
  return q ? `/app/invoices?${q}` : '/app/invoices';
};

export const bucketLabel = (b: AgeingBucket): string => AGEING_BUCKETS.find((x) => x.key === b)?.label ?? b;
