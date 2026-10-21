'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRIMARY, SECONDARY } from './account-shell';
import { countPdfPages, pdfFilename, renderInvoicePdf } from '../invoice/generate-pdf';
import { downloadBlob } from '@/app/lib/image/export';
import { displayDate, isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import { computeTotals } from '@/app/lib/invoice/totals';
import type { CurrencyCode, Invoice } from '@/app/lib/invoice/types';
import { refreshMe, useEntitlements, useMe } from '@/app/lib/me-client';

type Summary = { id: string; number: string; clientName: string; currency: CurrencyCode; total: number; issueDate: string | null };

const ROW_BTN =
  'inline-flex h-10 items-center justify-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

export function InvoiceList() {
  const me = useMe();
  const { can, limit } = useEntitlements();
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

  async function act(id: string, kind: 'duplicate' | 'delete' | 'download', number: string) {
    setNotice(null);
    if (kind === 'delete' && !window.confirm(`Delete ${number}? This can’t be undone.`)) return;
    setBusy(`${kind}:${id}`);
    try {
      if (kind === 'download') {
        const [inv, prof] = await Promise.all([
          fetch(`/api/invoices/${id}`, { credentials: 'same-origin' }).then((r) => r.json() as Promise<{ invoice?: Invoice }>),
          fetch('/api/business-profile', { credentials: 'same-origin' }).then((r) => r.json() as Promise<{ profile?: { logo: string | null } }>),
        ]);
        if (!inv.invoice) throw new Error('missing');
        const doc: Invoice = { ...inv.invoice, logo: prof.profile?.logo ?? null };
        const blob = await renderInvoicePdf(doc, computeTotals(doc), { watermark: !can('invoice_watermark_remove') });
        downloadBlob(blob, pdfFilename(doc));
        setNotice((await countPdfPages(blob)) > 1 ? 'Downloading — it runs onto a second page.' : 'Done — your PDF is downloading.');
        return;
      }
      const res = await fetch(kind === 'delete' ? `/api/invoices/${id}` : `/api/invoices/${id}/duplicate`, {
        method: kind === 'delete' ? 'DELETE' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: kind === 'duplicate' ? JSON.stringify({ issueDate: isoDate(new Date()) }) : undefined,
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!res.ok) {
        setNotice(body.message ?? 'That didn’t work. Try again.');
        return;
      }
      setNotice(kind === 'delete' ? `Deleted ${number}.` : `Copied ${number}. The copy is at the top.`);
      await Promise.all([load(), refreshMe()]);
    } catch {
      setNotice('That didn’t work. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  const saveLimit = limit('invoice_save');
  const count = me.status === 'signed-in' ? me.usage.invoiceSave : (list?.length ?? 0);

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

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{saveLimit === null ? `${count} saved` : `${count} of ${saveLimit} saved`}</span>
        {notice && (
          <span className="font-semibold text-ink" role="status">
            {notice}
          </span>
        )}
      </div>
      <ul aria-label="Saved invoices" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
        {list.map((inv) => (
          <li key={inv.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center md:gap-4">
            <a href={`/invoice-generator?id=${inv.id}`} className="group min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-semibold text-ink group-hover:underline">{inv.number || 'Untitled invoice'}</span>
                <span className="truncate text-strong">{inv.clientName || 'No client yet'}</span>
              </span>
              <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                <span className="tabular-nums font-semibold text-ink">{formatMoney(inv.total, inv.currency)}</span>
                {inv.issueDate && <span>{displayDate(inv.issueDate)}</span>}
              </span>
            </a>
            <div className="-ml-3 flex flex-wrap gap-1 md:ml-0">
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
                className={`${ROW_BTN} hover:text-[#B42318] dark:hover:text-coral-400`}
                disabled={busy !== null}
                onClick={() => act(inv.id, 'delete', inv.number)}
                aria-label={`Delete ${inv.number}`}
              >
                {busy === `delete:${inv.id}` ? 'Deleting…' : 'Delete'}
              </button>
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
