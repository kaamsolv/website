'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PRIMARY, SECONDARY } from './account-shell';
import { StatusBadge } from './status-badge';
import { RecurCard } from './recur-card';
import { Segmented } from '../choice';
import { zipInvoices } from '../invoice/pdf-zip';
import { countPdfPages, pdfFilename, renderInvoicePdf } from '../invoice/generate-pdf';
import { downloadBlob } from '@/app/lib/image/export';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
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
  kind: 'invoice' | 'quote';
  recurEvery: string | null;
  recurNext: string | null;
};

type Filter = 'all' | 'invoice' | 'quote';

const ROW_BTN =
  'inline-flex h-10 items-center justify-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

export function InvoiceList() {
  const me = useMe();
  const { can, limit } = useEntitlements();
  const tracking = can('invoice_dashboard');
  // Pro (Stage 2C-1). Hidden from free accounts.
  const quotes = can('invoice_quote_mode');
  const designOk = can('invoice_templates') || can('invoice_brand_color');
  const [filter, setFilter] = useState<Filter>('all');
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
  const [list, setList] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/invoices', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
    if (!res?.ok) {
      setError('Couldn’t load your invoices. Refresh to try again.');
      return;
    }
    setList(((await res.json()) as { invoices: Summary[] }).invoices);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back from a batch (…?select=id,id): those invoices start ticked, ready for the ZIP.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('select');
    if (!raw) return;
    setSelected(new Set(raw.split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50)));
  }, []);

  async function downloadZip() {
    const ids = (list ?? []).filter((x) => selected.has(x.id)).map((x) => x.id);
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

  async function setStatus(inv: Summary) {
    const next = inv.status === 'paid' ? 'unpaid' : 'paid';
    setBusy(`status:${inv.id}`);
    const res = await fetch(`/api/invoices/${inv.id}/status`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setNotice('That didn’t work. Try again.');
    setList((l) => (l ? l.map((x) => (x.id === inv.id ? { ...x, status: next } : x)) : l));
    setNotice(`${inv.number} marked ${next}.`);
  }

  async function act(id: string, kind: 'duplicate' | 'delete' | 'download' | 'convert', number: string) {
    setNotice(null);
    if (kind === 'delete' && !window.confirm(`Delete ${number}? This can’t be undone.`)) return;
    setBusy(`${kind}:${id}`);
    try {
      if (kind === 'download') {
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
      const res = await fetch(kind === 'delete' ? `/api/invoices/${id}` : `/api/invoices/${id}/${kind}`, {
        method: kind === 'delete' ? 'DELETE' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: kind === 'delete' ? undefined : JSON.stringify({ issueDate: isoDate(new Date()) }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!res.ok) {
        setNotice(body.message ?? 'That didn’t work. Try again.');
        return;
      }
      setNotice(
        kind === 'delete'
          ? `Deleted ${number}.`
          : kind === 'convert'
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
  const count = me.status === 'signed-in' ? me.usage.invoiceSave : (list?.length ?? 0);
  const shown = list && quotes && filter !== 'all' ? list.filter((x) => x.kind === filter) : list;

  if (error) return <p className="text-strong" role="alert">{error}</p>;
  if (!list) return <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  if (list.length === 0) {
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

  const shownIds = (shown ?? []).map((x) => x.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  return (
    <div>
      <RecurCard onChanged={load} />
      {(csvOk || batchOk) && (
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
      {quotes && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented<Filter>
            legend="Show"
            hideLegend
            options={[
              { value: 'all', label: 'All' },
              { value: 'invoice', label: 'Invoices' },
              { value: 'quote', label: 'Quotations' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <a href="/invoice-generator?type=quote" className={SECONDARY}>
            + New quotation
          </a>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{saveLimit === null ? `${count} saved` : `${count} of ${saveLimit} saved`}</span>
        {notice && (
          <span className="font-semibold text-ink" role="status">
            {notice}
          </span>
        )}
      </div>
      {shown && shown.length === 0 && (
        <p className="rounded-xl2 border border-dashed border-hair bg-surface p-6 text-center text-muted">
          {filter === 'quote' ? 'No quotations yet.' : 'No invoices yet.'}
        </p>
      )}
      <ul aria-label="Saved invoices" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface empty:hidden">
        {(shown ?? []).map((inv) => (
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
                {tracking && inv.kind !== 'quote' && <StatusBadge status={inv.status} dueDate={inv.dueDate} today={today} />}
                {inv.issueDate && <span>{displayDate(inv.issueDate)}</span>}
                {inv.kind === 'quote' && inv.dueDate && <span>Valid until {displayDate(inv.dueDate)}</span>}
                {recurring && inv.recurNext && isRecurEvery(inv.recurEvery) && (
                  <span className="rounded-full border border-hair bg-wash px-2 py-0.5 text-xs font-semibold text-strong">
                    {RECUR_SHORT[inv.recurEvery]} · next {displayDate(inv.recurNext)}
                  </span>
                )}
              </span>
            </a>
            <div className="-ml-3 flex flex-wrap gap-1 md:ml-0">
              {quotes && inv.kind === 'quote' && (
                <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => act(inv.id, 'convert', inv.number)} aria-label={`Convert ${inv.number} to an invoice`}>
                  {busy === `convert:${inv.id}` ? 'Converting…' : 'Convert to invoice'}
                </button>
              )}
              {tracking && inv.kind !== 'quote' && (
                <button type="button" className={ROW_BTN} disabled={busy !== null} onClick={() => void setStatus(inv)} aria-label={`Mark ${inv.number} as ${inv.status === 'paid' ? 'unpaid' : 'paid'}`}>
                  {inv.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                </button>
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
      <p className="mt-6">
        <a href="/invoice-generator" className={SECONDARY}>
          + New invoice
        </a>
      </p>
    </div>
  );
}
