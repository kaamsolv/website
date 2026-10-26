/**
 * The invoice list's request vocabulary — search, type, sort, paging and the Stage D filters — parsed and
 * validated in one place for `GET /api/invoices` and for the list page's own URL. Framework-free.
 *
 * Which answer a request gets (docs/products/invoice-generator.md → "Invoice list"):
 *   - none of these params .......... every invoice and quotation, summaries only (the original response, unchanged);
 *   - Stage D filters, no `page` .... invoices only, up to 200, with totals over every match (unchanged);
 *   - any of q / kind / sort / page / pageSize / ids ... the **paged** answer: one page, `matched`, `pages`,
 *     and totals over every match.
 * Search and sort never change what a filter counts — the filter SQL is the same everywhere (db/invoice-filters.ts).
 */

import { parsePaging, type Paging } from '../paging';
import { hasFilter, parseInvoiceFilter, type InvoiceFilter } from './filters';

export const LIST_KINDS = ['all', 'invoice', 'quote'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LIST_SORTS = ['updated', 'issued', 'due', 'total', 'number'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export const SORT_LABELS: Record<ListSort, string> = {
  updated: 'Recently changed',
  issued: 'Newest issued',
  due: 'Due soonest',
  total: 'Largest amount',
  number: 'Number (A–Z)',
};

export const LIST_KEYS = ['q', 'kind', 'sort', 'page', 'pageSize', 'ids'] as const;
export const MAX_SEARCH_LENGTH = 80;
export const MAX_IDS = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPagedRequest = (q: URLSearchParams): boolean => LIST_KEYS.some((k) => q.has(k));

export type ListQuery = Paging & {
  filter: InvoiceFilter;
  today: string | null;
  /** Search text, whitespace-collapsed; '' = none. */
  q: string;
  /** What to list. Defaults to invoices only when a payment/ageing/customer/date filter is given, otherwise everything. */
  kind: ListKind;
  sort: ListSort;
  ids?: string[];
};

export function parseListQuery(q: URLSearchParams, serverNow: Date = new Date()): { ok: true; value: ListQuery } | { ok: false; message: string } {
  const f = parseInvoiceFilter(q, serverNow);
  if (!f.ok) return f;
  const paging = parsePaging(q);
  if (!paging.ok) return paging;

  const rawQ = q.get('q');
  const text = (rawQ ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > MAX_SEARCH_LENGTH) return { ok: false, message: `Search up to ${MAX_SEARCH_LENGTH} characters.` };

  const rawKind = q.get('kind');
  if (rawKind !== null && !(LIST_KINDS as readonly string[]).includes(rawKind)) return { ok: false, message: 'That type isn’t valid.' };
  const rawSort = q.get('sort');
  if (rawSort !== null && !(LIST_SORTS as readonly string[]).includes(rawSort)) return { ok: false, message: 'That sort order isn’t valid.' };

  const kind: ListKind = (rawKind as ListKind | null) ?? (hasFilter(f.filter) ? 'invoice' : 'all');
  if (kind === 'quote' && (f.filter.state || f.filter.bucket || f.filter.paidFrom || f.filter.paidTo)) {
    return { ok: false, message: 'Quotations don’t have a payment status or payments.' };
  }

  let ids: string[] | undefined;
  const rawIds = q.get('ids');
  if (rawIds !== null) {
    ids = rawIds.split(',').filter(Boolean);
    if (!ids.length || ids.length > MAX_IDS || ids.some((i) => !UUID_RE.test(i))) return { ok: false, message: 'Those invoices aren’t valid.' };
    ids = [...new Set(ids.map((i) => i.toLowerCase()))];
  }

  return {
    ok: true,
    value: { filter: f.filter, today: f.today, q: text, kind, sort: (rawSort as ListSort | null) ?? 'updated', page: paging.page, pageSize: paging.pageSize, ...(ids ? { ids } : {}) },
  };
}
