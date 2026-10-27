'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { InvoiceFilterBar, type FilterTotal } from './invoice-filter-bar';
import { Pager } from './pager';
import { PaymentProgress } from './payment-progress';
import { StatusBadge } from './status-badge';
import { RecurCard } from './recur-card';
import { Segmented } from '../choice';
import { zipInvoices } from '../invoice/pdf-zip';
import { countPdfPages, pdfFilename, renderInvoicePdf } from '../invoice/generate-pdf';
import { downloadBlob } from '@/app/lib/image/export';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import { FILTER_KEYS, hasFilterParams } from '@/app/lib/invoice/filters';
import { LIST_SORTS, SORT_LABELS, type ListKind, type ListSort } from '@/app/lib/invoice/list-query';
import { paymentSummary } from '@/app/lib/invoice/payments';
import { RECUR_SHORT, isRecurEvery } from '@/app/lib/invoice/recurring';
import { computeTotals } from '@/app/lib/invoice/totals';
import type { CurrencyCode, Invoice } from '@/app/lib/invoice/types';
import { refreshMe, useEntitlements, useMe } from '@/app/lib/me-client';

type Summary = {
  id: string;
  number: string;
  clientName: string;
  currency: CurrencyCode;
  total: number;
  issueDate: string | null;
  dueDate: string | null;
  status: 'unpaid' | 'paid';
  amountPaid: number;
  /** What is still owed, and money received in the payment-date period asked for (when it was). */
  balance?: number;
  receivedInPeriod?: number;
  /** The saved customer this was billed to, when it was picked from the saved list. */
  customerId?: string | null;
  kind: 'invoice' | 'quote';
  recurEvery: string | null;
  recurNext: string | null;
};

type Page = { invoices: Summary[]; matched: number; page: number; pages: number; pageSize: number; totals: FilterTotal[] };

const ROW_BTN =
  'inline-flex h-10 items-center justify-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

/** The params the page keeps in its own URL (everything else, like the one-off `select`, is left behind when you move around). */
const URL_KEYS = [...FILTER_KEYS, 'q', 'kind', 'sort', 'page', 'pageSize'] as const;

/**
 * All invoices. The address bar is the state: search, type, sort, page and every Stage D filter live in the URL
 * (`/app/invoices?state=overdue&q=acme&page=2`), so a link, a reload or Back lands in the same place. The
 * server does the searching, filtering, sorting and paging — and the sums — so a page of 25 never has to
 * hold the whole history, and what you see always adds up to the card you clicked.
 */
export function InvoiceList() {
  const me = useMe();
  const { can, limit } = useEntitlements();
  // Every account records payments and sees each invoice's balance; the collections dashboard is Pro.
  const tracking = can('invoice_payments');
  // Pro (Stage 2C-1). Hidden from free accounts.
  const quotes = can('invoice_quote_mode');
  const designOk = can('invoice_templates') || can('invoice_brand_color');
  // Pro (Stage 2C-2): repeat reminders, CSV export, ZIP of PDFs. Hidden from free accounts.
  const recurring = can('invoice_recurring');
  const csvOk = can('invoice_csv_export');
  const batchOk = can('invoice_batch_csv');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);
  const zipAbort = useRef<AbortController | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const today = isoDate(new Date());
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** The page's own query string; changing it (from a link, a form, Back) loads that page. Null until mounted. */
  const [search, setSearch] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [customerName, setCustomerName] = useState<string | null>(null);
  const focusTop = useRef(false);
  const listTop = useRef<HTMLHeadingElement>(null);

  const params = new URLSearchParams(search ?? '');
  const drilled = hasFilterParams(params); // a payment / ageing / customer / date filter from a dashboard link
  const narrowed = drilled || params.has('q') || params.has('kind');
  const kind = (params.get('kind') as ListKind | null) ?? 'all';
  const sort = (params.get('sort') as ListSort | null) ?? 'updated';

  /** Move to another URL (same page, new query) without a reload; remembers it for Back. */
  const go = useCallback((href: string, replace = false) => {
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
    const url = `/app/invoices${qs ? `?${qs}` : ''}`;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setSearch(qs);
  }, []);

  /** A plain click on a list link changes the URL in place; modified clicks (new tab, etc.) keep their normal behaviour. */
  const intercept = useCallback(
    (href: string, e: React.MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      focusTop.current = true;
      go(href);
    },
    [go],
  );

  /** This page's URL with some params changed; changing anything but the page goes back to page 1. */
  const hrefWith = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const k of URL_KEYS) if (params.has(k)) next.set(k, params.get(k)!);
    if (!('page' in patch)) next.delete('page');
    for (const [k, v] of Object.entries(patch)) (v === null || v === '' ? next.delete(k) : next.set(k, v));
    const s = next.toString();
    return s ? `/app/invoices?${s}` : '/app/invoices';
  };

  const load = useCallback(async () => {
    const here = new URLSearchParams(window.location.search);
    const q = new URLSearchParams({ page: here.get('page') ?? '1' });
    for (const k of [...FILTER_KEYS, 'q', 'kind', 'sort', 'pageSize'] as const) {
      const v = here.get(k);
      if (v !== null) q.set(k, v);
    }
    // Coming back from a batch (…?select=id,id): show exactly those invoices, ticked, ready for the ZIP.
    const picked = (here.get('select') ?? '').split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50);
    if (picked.length) {
      q.set('ids', picked.join(','));
      q.set('pageSize', '50');
    }
    q.set('today', isoDate(new Date()));
    setLoading(true);
    const res = await fetch(`/api/invoices?${q}`, { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError(res?.status === 400 ? 'Those filters aren’t valid.' : 'Couldn’t load your invoices. Refresh to try again.');
      return;
    }
    const body = (await res.json()) as Page;
    setData(body);
    setError(null);
    // A page past the end (e.g. after deleting the last row of the last page) is shown as the last page.
    if (body.page !== Number(q.get('page'))) {
      const fix = new URLSearchParams(window.location.search);
      if (body.page === 1) fix.delete('page');
      else fix.set('page', String(body.page));
      window.history.replaceState(null, '', `/app/invoices${fix.toString() ? `?${fix}` : ''}`);
    }
    if (focusTop.current) {
      focusTop.current = false;
      requestAnimationFrame(() => listTop.current?.focus());
    }
  }, []);

  useEffect(() => {
    setSearch(window.location.search.replace(/^\?/, ''));
    const onPop = () => setSearch(window.location.search.replace(/^\?/, ''));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (search === null) return;
    setSearchText(new URLSearchParams(search).get('q') ?? '');
    void load();
  }, [search, load]);

  // The saved customer a drill-down is limited to, by name.
  const customerId = params.get('customer');
  useEffect(() => {
    if (!customerId) return setCustomerName(null);
    fetch(`/api/customers/${encodeURIComponent(customerId)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { row?: { name: string } } | null) => setCustomerName(b?.row?.name ?? null))
      .catch(() => undefined);
  }, [customerId]);

  // Coming back from a batch: those invoices start ticked.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('select');
    if (!raw) return;
    setSelected(new Set(raw.split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50)));
  }, []);

  async function downloadZip() {
    // Ticks survive moving between pages, so these are the ticked invoices from any page.
    const ids = [...selected];
    if (!ids.length) return;
    setNotice(null);
    const ctl = new AbortController();
    zipAbort.current = ctl;
    setZip({ done: 0, total: ids.length });
    try {
      const r = await zipInvoices(
        ids,
        { watermark: !can('invoice_watermark_remove'), design: designOk },
        (done, total) => setZip({ done, total }),
        ctl.signal,
      );
      downloadBlob(r.blob, `kaamsolv-invoices-${today}.zip`);
      setNotice(r.skipped.length ? `Done — ${r.made} PDFs in the ZIP. ${r.skipped.length} couldn’t be made; try those one by one.` : `Done — ${r.made} PDFs in your ZIP.`);
    } catch (e) {
      setNotice(e instanceof DOMException && e.name === 'AbortError' ? 'Cancelled.' : 'Couldn’t make the ZIP. Try fewer at a time.');
    } finally {
      setZip(null);
      zipAbort.current = null;
    }
  }

  async function exportCsv(mode: 'invoices' | 'lines') {
    setNotice(null);
    setBusy(`export:${mode}`);
    const q = new URLSearchParams({ mode, ...(from ? { from } : {}), ...(to ? { to } : {}) });
    const res = await fetch(`/api/invoices/export?${q}`, { credentials: 'same-origin' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
      setNotice(body?.message ?? 'Couldn’t make the CSV. Try again.');
      return;
    }
    downloadBlob(await res.blob(), `kaamsolv-${mode === 'lines' ? 'invoice-lines' : 'invoices'}${from ? `-from-${from}` : ''}${to ? `-to-${to}` : ''}.csv`);
    setNotice('Done — your CSV is downloading.');
  }

  async function act(id: string, kindOfAction: 'duplicate' | 'delete' | 'download' | 'convert', number: string) {
    setNotice(null);
    if (kindOfAction === 'delete') {
      const row = data?.invoices.find((x) => x.id === id);
      const received = row?.amountPaid ?? 0;
      const withPayments = received > 0 && row ? ` It also removes the ${formatMoney(received, row.currency)} of payments recorded against it.` : '';
      if (!window.confirm(`Delete ${number}?${withPayments} This can’t be undone.`)) return;
    }
    setBusy(`${kindOfAction}:${id}`);
    try {
      if (kindOfAction === 'download') {
        const [inv, prof] = await Promise.all([
          fetch(`/api/invoices/${id}`, { credentials: 'same-origin' }).then((r) => r.json() as Promise<{ invoice?: Invoice }>),
          fetch('/api/business-profile', { credentials: 'same-origin' }).then((r) => r.json() as Promise<{ profile?: { logo: string | null; signature?: string | null } }>),
        ]);
        if (!inv.invoice) throw new Error('missing');
        const doc: Invoice = { ...inv.invoice, logo: prof.profile?.logo ?? null, signature: prof.profile?.signature ?? null };
        const blob = await renderInvoicePdf(doc, computeTotals(doc), {
          watermark: !can('invoice_watermark_remove'),
          design: designOk ? (doc.design ?? null) : null,
        });
        downloadBlob(blob, pdfFilename(doc));
        // Pro documents flow onto more pages by design; free ones are meant to fit one.
        const overflow = !can('invoice_unlimited_items') && (await countPdfPages(blob)) > 1;
        setNotice(overflow ? 'Downloading — it runs onto a second page.' : 'Done — your PDF is downloading.');
        return;
      }
      const res = await fetch(kindOfAction === 'delete' ? `/api/invoices/${id}` : `/api/invoices/${id}/${kindOfAction}`, {
        method: kindOfAction === 'delete' ? 'DELETE' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: kindOfAction === 'delete' ? undefined : JSON.stringify({ issueDate: isoDate(new Date()) }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!res.ok) {
        setNotice(body.message ?? 'That didn’t work. Try again.');
        return;
      }
      setSelected((cur) => {
        if (kindOfAction !== 'delete' || !cur.has(id)) return cur;
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
      setNotice(
        kindOfAction === 'delete'
          ? `Deleted ${number}.`
          : kindOfAction === 'convert'
            ? `Made an invoice from ${number}. It’s at the top — the quotation stays as it was.`
            : `Copied ${number}. The copy is at the top.`,
      );
      await Promise.all([load(), refreshMe()]);
    } catch {
      setNotice('That didn’t work. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  const saveLimit = limit('invoice_save');
  const count = me.status === 'signed-in' ? me.usage.invoiceSave : (data?.matched ?? 0);

  if (error && !data) {
    return (
      <p className="text-strong" role="alert">
        {error}{' '}
        {URL_KEYS.some((k) => new URLSearchParams(window.location.search).has(k)) && (
          <a href="/app/invoices" className="font-semibold underline underline-offset-2">
            Clear the filters
          </a>
        )}
      </p>
    );
  }
  if (!data) return <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  if (data.matched === 0 && !narrowed) {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">No saved invoices yet</p>
        <p className="mt-2 text-muted">Make one, press Save, and it’ll be here next time.</p>
        <a href="/invoice-generator" className={`${PRIMARY} mt-5`}>
          Make an invoice
        </a>
      </div>
    );
  }

  const list = data.invoices;
  const shownIds = list.map((x) => x.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const baseHref = (page: number) => hrefWith({ page: page > 1 ? String(page) : null });

  return (
    <div aria-busy={loading}>
      {narrowed ? (
        <InvoiceFilterBar params={params} totals={data.totals} matched={data.matched} customerName={customerName} onNavigate={intercept} />
      ) : (
        <RecurCard onChanged={load} />
      )}
      {!drilled && (csvOk || batchOk) && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {csvOk && (
              <button type="button" onClick={() => setExportOpen((o) => !o)} aria-expanded={exportOpen} aria-controls="export-panel" className={SECONDARY}>
                Export CSV
              </button>
            )}
            {batchOk && (
              <a href="/app/invoices/batch" className={SECONDARY}>
                Make from a CSV
              </a>
            )}
            {batchOk && (
              <>
                <label className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-strong">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#FE6336]"
                    checked={allShownSelected}
                    onChange={(e) => setSelected((cur) => {
                      const next = new Set(cur);
                      for (const id of shownIds) (e.target.checked ? next.add(id) : next.delete(id));
                      return next;
                    })}
                  />
                  Select all
                </label>
                {selected.size > 0 &&
                  (zip ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink" role="status">
                      Making PDFs… {zip.done} of {zip.total}
                      <button type="button" onClick={() => zipAbort.current?.abort()} className={ROW_BTN}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => void downloadZip()} className={SECONDARY}>
                      Download {selected.size} as ZIP
                    </button>
                  ))}
              </>
            )}
          </div>
          {csvOk && exportOpen && (
            <section id="export-panel" aria-label="Export to CSV" className="rounded-xl2 border border-hair bg-surface p-4">
              <p className="text-sm text-muted">Opens in Excel or Google Sheets. Leave the dates blank for everything.</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm font-semibold text-ink">
                  From
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-11 rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink" />
                </label>
                <label className="text-sm font-semibold text-ink">
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-11 rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink" />
                </label>
                <button type="button" disabled={busy !== null} onClick={() => void exportCsv('invoices')} className={PRIMARY}>
                  {busy === 'export:invoices' ? 'Preparing…' : 'Invoices (one row each)'}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void exportCsv('lines')} className={SECONDARY}>
                  {busy === 'export:lines' ? 'Preparing…' : 'Line items (HSN / SAC)'}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      {quotes && !drilled && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented<ListKind>
            legend="Show"
            hideLegend
            options={[
              { value: 'all', label: 'All' },
              { value: 'invoice', label: 'Invoices' },
              { value: 'quote', label: 'Quotations' },
            ]}
            value={kind}
            onChange={(k) => {
              focusTop.current = false;
              go(hrefWith({ kind: k === 'all' ? null : k }));
            }}
          />
          <a href="/invoice-generator?type=quote" className={SECONDARY}>
            + New quotation
          </a>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form
          role="search"
          className="flex min-w-0 flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go(hrefWith({ q: searchText.trim() || null }));
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="invoice-search" className="block text-sm font-semibold text-ink">
              Search
            </label>
            <input
              id="invoice-search"
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              maxLength={80}
              placeholder="Invoice number or client"
              autoComplete="off"
              className={`${INPUT} mt-1`}
            />
          </div>
          <button type="submit" className={`${SECONDARY} shrink-0`}>
            Search
          </button>
        </form>
        <div>
          <label htmlFor="invoice-sort" className="block text-sm font-semibold text-ink">
            Sort by
          </label>
          <select
            id="invoice-sort"
            value={sort}
            onChange={(e) => go(hrefWith({ sort: e.target.value === 'updated' ? null : e.target.value }))}
            className={`${INPUT} mt-1 w-auto min-w-[11rem] text-sm`}
          >
            {LIST_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h2 ref={listTop} tabIndex={-1} className="sr-only">
        Your invoices, page {data.page} of {data.pages}
      </h2>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{narrowed ? '' : saveLimit === null ? `${count} saved` : `${count} of ${saveLimit} saved`}</span>
        {notice && (
          <span className="font-semibold text-ink" role="status">
            {notice}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-3 font-semibold text-danger-600">
          {error}
        </p>
      )}
      {list.length === 0 && !narrowed && (
        <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted">No invoices yet.</p>
      )}
      <ul aria-label="Saved invoices" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface empty:hidden">
        {list.map((inv) => (
          <li key={inv.id} className="flex items-start gap-3 p-4">
            {batchOk && (
              <input
                type="checkbox"
                aria-label={`Select ${inv.number}`}
                className="mt-1 h-5 w-5 shrink-0 accent-[#FE6336]"
                checked={selected.has(inv.id)}
                onChange={(e) => setSelected((cur) => {
                  const next = new Set(cur);
                  if (e.target.checked) next.add(inv.id);
                  else next.delete(inv.id);
                  return next;
                })}
              />
            )}
            <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[1fr_auto] md:items-center md:gap-4">
            <a href={`/invoice-generator?id=${inv.id}`} className="group min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-semibold text-ink group-hover:underline">
                  {inv.number || (inv.kind === 'quote' ? 'Untitled quotation' : 'Untitled invoice')}
                </span>
                {inv.kind === 'quote' && (
                  <span className="rounded-full border border-hair bg-wash px-2 py-0.5 text-xs font-semibold text-strong">Quote</span>
                )}
                <span className="truncate text-strong">{inv.clientName || 'No client yet'}</span>
              </span>
              <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                <span className="tabular-nums font-semibold text-ink">{formatMoney(inv.total, inv.currency)}</span>
                {tracking && inv.kind !== 'quote' && <StatusBadge status={inv.status} amountPaid={inv.amountPaid} total={inv.total} dueDate={inv.dueDate} today={today} />}
                {inv.issueDate && <span>{displayDate(inv.issueDate)}</span>}
                {inv.kind === 'quote' && inv.dueDate && <span>Valid until {displayDate(inv.dueDate)}</span>}
                {recurring && inv.recurNext && isRecurEvery(inv.recurEvery) && (
                  <span className="rounded-full border border-hair bg-wash px-2 py-0.5 text-xs font-semibold text-strong">
                    {RECUR_SHORT[inv.recurEvery]} · next {displayDate(inv.recurNext)}
                  </span>
                )}
              </span>
              {tracking && inv.kind !== 'quote' && (() => {
                const sum = paymentSummary({ total: inv.total, amountPaid: inv.amountPaid, status: inv.status, dueDate: inv.dueDate }, today);
                return sum.state === 'partial' ? (
                  <span className="mt-2 block">
                    <PaymentProgress summary={sum} total={inv.total} currency={inv.currency} compact />
                    <span className="mt-0.5 block text-xs font-semibold text-ink">{formatMoney(sum.outstanding, inv.currency)} outstanding</span>
                  </span>
                ) : null;
              })()}
              {narrowed && inv.kind !== 'quote' && (
                <span className="mt-1 block text-sm text-muted">
                  {inv.balance !== undefined && inv.balance > 0 && inv.amountPaid === 0 && (
                    <span className="mr-3 font-semibold text-ink">{formatMoney(inv.balance, inv.currency)} outstanding</span>
                  )}
                  {inv.receivedInPeriod !== undefined && <span>{formatMoney(inv.receivedInPeriod, inv.currency)} received in this period</span>}
                </span>
              )}
            </a>
            <div className="-ml-3 flex flex-wrap gap-1 md:ml-0">
              {quotes && inv.kind === 'quote' && (
                <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => act(inv.id, 'convert', inv.number)} aria-label={`Convert ${inv.number} to an invoice`}>
                  {busy === `convert:${inv.id}` ? 'Converting…' : 'Convert to invoice'}
                </button>
              )}
              {tracking && inv.kind !== 'quote' && (
                <a
                  href={`/app/invoices/${inv.id}${inv.status === 'paid' && inv.amountPaid > 0 ? '' : '?record=1'}`}
                  className={ROW_BTN}
                  aria-label={`${inv.status === 'paid' && inv.amountPaid > 0 ? 'Payments for' : 'Record a payment for'} ${inv.number}`}
                >
                  {inv.status === 'paid' && inv.amountPaid > 0 ? 'Payments' : 'Record payment'}
                </a>
              )}
              {inv.customerId && (
                <a href={`/app/business/customers/${inv.customerId}`} className={ROW_BTN} aria-label={`Open the saved customer for ${inv.number} (${inv.clientName})`}>
                  Customer
                </a>
              )}
              <a href={`/invoice-generator?id=${inv.id}`} className={ROW_BTN} aria-label={`Open ${inv.number}`}>
                Open
              </a>
              <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => act(inv.id, 'download', inv.number)} aria-label={`Download ${inv.number} as PDF`}>
                {busy === `download:${inv.id}` ? 'Preparing…' : 'PDF'}
              </button>
              <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => act(inv.id, 'duplicate', inv.number)} aria-label={`Make a copy of ${inv.number}`}>
                {busy === `duplicate:${inv.id}` ? 'Copying…' : 'Copy'}
              </button>
              <button
                type="button"
                className={`${ROW_BTN} hover:text-[#B42318] dark:hover:text-danger-600`}
                disabled={busy !== null}
                onClick={() => act(inv.id, 'delete', inv.number)}
                aria-label={`Delete ${inv.number}`}
              >
                {busy === `delete:${inv.id}` ? 'Deleting…' : 'Delete'}
              </button>
            </div>
            </div>
          </li>
        ))}
      </ul>
      {data.matched > 0 && <Pager page={data.page} pages={data.pages} pageSize={data.pageSize} matched={data.matched} hrefFor={baseHref} onGo={intercept} label="Invoice pages" />}
      <p className="mt-6">
        <a href="/invoice-generator" className={SECONDARY}>
          + New invoice
        </a>
      </p>
    </div>
  );
}
