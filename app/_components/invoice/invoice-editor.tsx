'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import { PAPER_MUTED, PAPER_TEXT, PaperCaption, PaperInput, PaperTextarea } from './paper-fields';
import { countPdfPages, pdfFilename, renderInvoicePdf } from './generate-pdf';
import { useEntitlements } from '@/app/lib/entitlements';
import { downloadBlob } from '@/app/lib/image/export';
import { addDays, DEFAULT_DUE_DAYS, hasContent, newInvoice, newLineItem } from '@/app/lib/invoice/defaults';
import { LOGO_MAX_BYTES, LOGO_MAX_PX, LOGO_TYPES, MAX_FREE_ITEMS, MAX_LEN } from '@/app/lib/invoice/limits';
import { CURRENCY_LABELS, currencySymbol, formatMoney } from '@/app/lib/invoice/money';
import { computeTotals } from '@/app/lib/invoice/totals';
import { CURRENCIES, type CurrencyCode, type Invoice, type LineItem } from '@/app/lib/invoice/types';

const BTN =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60';
const PRIMARY = `${BTN} bg-coral-500 text-navy-900 hover:bg-coral-400`;
const SECONDARY = `${BTN} border border-hair bg-surface text-strong hover:bg-wash`;

/** Downscale a logo in the browser; PNG keeps transparency. Never uploaded. */
async function readLogo(file: File): Promise<string> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) throw new Error('Use a PNG, JPG or WebP logo.');
  if (file.size > LOGO_MAX_BYTES) throw new Error('That logo is over 2 MB — try a smaller file.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
}

export function InvoiceEditor() {
  const { can } = useEntitlements();
  // Built after mount so the invoice number and dates use the visitor's clock.
  const [inv, setInv] = useState<Invoice | null>(null);
  useEffect(() => setInv(newInvoice()), []);

  const [busy, setBusy] = useState<'download' | 'preview' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => (inv ? computeTotals(inv) : null), [inv]);
  const itemLimit = can('invoice_unlimited_items') ? Infinity : MAX_FREE_ITEMS;

  // Debounced screen-reader announcement of the grand total (§29).
  const [announce, setAnnounce] = useState('');
  const lastAnnounced = useRef('');
  useEffect(() => {
    if (!inv || !totals) return;
    const text = `Total ${formatMoney(totals.total, inv.currency)}`;
    const t = setTimeout(() => {
      if (text !== lastAnnounced.current) {
        lastAnnounced.current = text;
        setAnnounce(text);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [inv, totals]);

  // Nothing is saved: warn before leaving only if there's something to lose.
  const dirty = inv ? hasContent(inv) : false;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (!inv || !totals) {
    return <div className="mx-auto min-h-[60vh] max-w-[794px] animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;
  }

  const set = (patch: Partial<Invoice>) => setInv((cur) => (cur ? { ...cur, ...patch } : cur));
  const setSeller = (patch: Partial<Invoice['seller']>) => setInv((cur) => (cur ? { ...cur, seller: { ...cur.seller, ...patch } } : cur));
  const setClient = (patch: Partial<Invoice['client']>) => setInv((cur) => (cur ? { ...cur, client: { ...cur.client, ...patch } } : cur));
  const setItem = (id: string, patch: Partial<LineItem>) =>
    setInv((cur) => (cur ? { ...cur, items: cur.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : cur));
  const money = (n: number) => formatMoney(n, inv.currency);

  function addItem() {
    if (inv!.items.length >= itemLimit) return;
    set({ items: [...inv!.items, newLineItem()] });
    // Move focus to the new row's description.
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLInputElement>('[data-item-desc]');
      rows[rows.length - 1]?.focus();
    });
  }

  async function makePdf(kind: 'download' | 'preview') {
    setMessage(null);
    setBusy(kind);
    // Open the preview tab now (inside the click) so pop-up blockers allow it.
    const tab = kind === 'preview' ? window.open('', '_blank') : null;
    try {
      const blob = await renderInvoicePdf(inv!, totals!, { watermark: !can('invoice_watermark_remove') });
      const pages = await countPdfPages(blob);
      const overflow = pages > 1 ? ' It runs onto a second page — shorten the notes or item descriptions to fit one.' : '';
      if (kind === 'download') {
        downloadBlob(blob, pdfFilename(inv!));
        setMessage(`Done — your PDF is downloading.${overflow}`);
      } else {
        const url = URL.createObjectURL(blob);
        if (overflow) setMessage(overflow.trim());
        if (tab) tab.location.href = url;
        else downloadBlob(blob, pdfFilename(inv!)); // pop-up blocked: download instead
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      tab?.close();
      setMessage('Couldn’t create the PDF. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function startNew() {
    if (dirty && !window.confirm('Start a new invoice? This one will be cleared — it isn’t saved.')) return;
    setInv(newInvoice());
    setMessage(null);
    setLogoError(null);
  }

  const currencySelect = (id: string) => (
    <label className="flex items-center gap-2 text-sm font-semibold text-ink">
      <span className="sr-only sm:not-sr-only">Currency</span>
      <select
        id={id}
        value={inv.currency}
        onChange={(e) => set({ currency: e.target.value as CurrencyCode })}
        className="h-11 rounded-lg border border-hair bg-fieldbg px-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        aria-label="Currency"
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {CURRENCY_LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );

  const items = inv.items;

  return (
    <div className="mx-auto max-w-[860px] pb-24 md:pb-0">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl2 border border-hair bg-surface p-3 md:sticky md:top-20 md:z-20">
        {currencySelect('currency-top')}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={startNew} className={SECONDARY}>
            Start new
          </button>
          <button type="button" onClick={() => makePdf('preview')} disabled={busy !== null} className={SECONDARY}>
            {busy === 'preview' ? 'Preparing…' : 'Preview PDF'}
          </button>
          <button type="button" onClick={() => makePdf('download')} disabled={busy !== null} className={`${PRIMARY} max-md:hidden`}>
            <Icon name="download" className="h-4 w-4" />
            {busy === 'download' ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <p className="mb-4 flex items-start gap-2 text-sm text-muted">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
        Type straight onto the invoice. It stays in this browser — nothing is uploaded, and it isn’t saved, so refreshing
        clears it.
      </p>

      {message && (
        <p className="mb-4 text-sm font-semibold text-ink" role="status">
          {message}
        </p>
      )}

      {/* The paper */}
      <article
        aria-label="Invoice"
        className={`mx-auto max-w-[794px] rounded-xl2 border border-[#E3E7EF] bg-white p-5 shadow-lift sm:p-8 md:min-h-[1123px] md:p-12 ${PAPER_TEXT}`}
      >
        <div className="grid gap-8 md:grid-cols-[1fr_auto]">
          {/* Seller */}
          <section aria-labelledby="from-h" className="min-w-0 space-y-1.5">
            <h2 id="from-h" className="sr-only">
              Your business
            </h2>
            <div className="mb-3 flex items-center gap-3">
              {inv.logo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                  <img src={inv.logo} alt="Your logo" className="max-h-14 max-w-[140px] object-contain" />
                  <button type="button" onClick={() => set({ logo: null })} className={`text-xs font-semibold underline ${PAPER_MUTED} hover:text-[#0C2248]`}>
                    Remove logo
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-[#AEB6C6] px-3 text-sm font-semibold text-[#0C2248] hover:border-[#5B6478] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6336]/40 md:min-h-9"
                >
                  <Icon name="upload" className="h-4 w-4" /> Add logo
                </button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept={LOGO_TYPES.join(',')}
                className="sr-only"
                aria-label="Choose a logo image"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setLogoError(null);
                    set({ logo: await readLogo(f) });
                  } catch (err) {
                    setLogoError(err instanceof Error ? err.message : 'Couldn’t read that logo.');
                  }
                }}
              />
            </div>
            {logoError && <p className="text-sm font-medium text-[#B42318]">{logoError}</p>}
            <PaperInput label="Your business name" placeholder="Your business name" value={inv.seller.name} maxLength={MAX_LEN.name} onChange={(e) => setSeller({ name: e.target.value })} className="text-lg font-bold" />
            <PaperTextarea label="Your address" placeholder="Address" value={inv.seller.address} maxLength={MAX_LEN.address} onChange={(e) => setSeller({ address: e.target.value })} rows={2} />
            <PaperInput label="Your email" type="email" inputMode="email" placeholder="Email" value={inv.seller.email} maxLength={MAX_LEN.email} onChange={(e) => setSeller({ email: e.target.value })} />
            <PaperInput label="Your phone" type="tel" inputMode="tel" placeholder="Phone" value={inv.seller.phone} maxLength={MAX_LEN.phone} onChange={(e) => setSeller({ phone: e.target.value })} />
          </section>

          {/* Invoice meta */}
          <section aria-labelledby="meta-h" className="space-y-2 md:w-60">
            <h2 id="meta-h" className="text-2xl font-bold tracking-wide md:text-right">
              INVOICE
            </h2>
            <div>
              <PaperCaption htmlFor="inv-number">Invoice no.</PaperCaption>
              <PaperInput id="inv-number" label="Invoice number" value={inv.number} maxLength={MAX_LEN.number} onChange={(e) => set({ number: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
              <div>
                <PaperCaption htmlFor="inv-date">Date</PaperCaption>
                <PaperInput
                  id="inv-date"
                  label="Invoice date"
                  type="date"
                  value={inv.issueDate}
                  onChange={(e) => set({ issueDate: e.target.value, dueDate: e.target.value ? addDays(e.target.value, DEFAULT_DUE_DAYS) : inv.dueDate })}
                />
              </div>
              <div>
                <PaperCaption htmlFor="inv-due">Due date</PaperCaption>
                <PaperInput id="inv-due" label="Due date" type="date" value={inv.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              </div>
            </div>
          </section>
        </div>

        <div className="my-7 h-0.5 w-10 bg-[#FE6336]" aria-hidden="true" />

        {/* Client */}
        <section aria-labelledby="to-h" className="max-w-sm space-y-1.5">
          <h2 id="to-h" className={`text-[11px] font-semibold uppercase tracking-wide ${PAPER_MUTED}`}>
            Bill to
          </h2>
          <PaperInput label="Client name" placeholder="Client name" value={inv.client.name} maxLength={MAX_LEN.name} onChange={(e) => setClient({ name: e.target.value })} className="font-semibold" />
          <PaperTextarea label="Client address" placeholder="Client address" value={inv.client.address} maxLength={MAX_LEN.address} onChange={(e) => setClient({ address: e.target.value })} rows={2} />
          <PaperInput label="Client email" type="email" inputMode="email" placeholder="Client email" value={inv.client.email} maxLength={MAX_LEN.email} onChange={(e) => setClient({ email: e.target.value })} />
        </section>

        {/* Items */}
        <section aria-labelledby="items-h" className="mt-8">
          <h2 id="items-h" className="sr-only">
            Items
          </h2>
          <div className={`hidden grid-cols-[1fr_4.5rem_7rem_7.5rem_2.5rem] gap-2 rounded-md bg-[#F3F5FA] px-2 py-2 text-[11px] font-semibold uppercase tracking-wide md:grid ${PAPER_MUTED}`} aria-hidden="true">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ol className="divide-y divide-[#E3E7EF]">
            {items.map((it, i) => {
              const line = totals.lines[i];
              return (
                <li key={it.id} className="grid grid-cols-[1fr_1fr_2.75rem] gap-x-2 gap-y-1 py-3 md:grid-cols-[1fr_4.5rem_7rem_7.5rem_2.5rem] md:items-center md:px-2 md:py-1.5">
                  <div className="col-span-3 md:col-span-1">
                    <span className={`text-xs font-semibold md:hidden ${PAPER_MUTED}`}>Item {i + 1}</span>
                    <PaperInput data-item-desc label={`Item ${i + 1} description`} placeholder="What you did or sold" value={it.description} maxLength={MAX_LEN.description} onChange={(e) => setItem(it.id, { description: e.target.value })} />
                  </div>
                  <div>
                    <span className={`text-xs md:hidden ${PAPER_MUTED}`}>Qty</span>
                    <PaperInput label={`Item ${i + 1} quantity`} inputMode="decimal" value={it.qty} aria-invalid={!line.valid || undefined} onChange={(e) => setItem(it.id, { qty: e.target.value })} className="md:text-right" />
                  </div>
                  <div className="col-span-1">
                    <span className={`text-xs md:hidden ${PAPER_MUTED}`}>Rate ({currencySymbol(inv.currency)})</span>
                    <PaperInput label={`Item ${i + 1} rate`} inputMode="decimal" placeholder="0" value={it.rate} aria-invalid={!line.valid || undefined} onChange={(e) => setItem(it.id, { rate: e.target.value })} className="md:text-right" />
                  </div>
                  <div className="col-span-2 flex items-center justify-between md:col-span-1 md:block md:text-right">
                    <span className={`text-xs md:hidden ${PAPER_MUTED}`}>Amount</span>
                    <span className="font-semibold tabular-nums">{money(line.amount)}</span>
                  </div>
                  <div className="row-start-3 col-start-3 flex justify-end md:row-auto md:col-auto">
                    <button
                      type="button"
                      onClick={() => set({ items: items.length > 1 ? items.filter((x) => x.id !== it.id) : [newLineItem()] })}
                      aria-label={`Remove item ${i + 1}`}
                      className={`grid h-11 w-11 place-items-center rounded-full ${PAPER_MUTED} hover:bg-[#F3F5FA] hover:text-[#B42318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6336]/40 md:h-9 md:w-9`}
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addItem}
              disabled={items.length >= itemLimit}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#AEB6C6] px-4 text-sm font-semibold text-[#0C2248] hover:bg-[#F3F5FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6336]/40 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9"
            >
              + Add item
            </button>
            {items.length >= itemLimit && (
              <p className={`text-sm ${PAPER_MUTED}`} role="status">
                That’s the limit — up to {MAX_FREE_ITEMS} items fit on a one-page invoice.
              </p>
            )}
          </div>
        </section>

        {/* Totals (right) and notes (left) — same arrangement as the PDF */}
        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_22rem]">
        <section aria-labelledby="totals-h" className="md:col-start-2 md:row-start-1">
          <h2 id="totals-h" className="sr-only">
            Totals
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className={PAPER_MUTED}>Subtotal</dt>
              <dd className="shrink-0 whitespace-nowrap tabular-nums">{money(totals.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className={`flex items-center gap-2 ${PAPER_MUTED}`}>
                Discount
                <select
                  aria-label="Discount type"
                  value={inv.discountType}
                  onChange={(e) => set({ discountType: e.target.value as Invoice['discountType'] })}
                  className="h-9 rounded-md border border-[#AEB6C6] bg-white px-1.5 text-sm text-[#0C2248] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6336]/40"
                >
                  <option value="percent">%</option>
                  <option value="flat">{currencySymbol(inv.currency)} flat</option>
                </select>
                <PaperInput label="Discount" inputMode="decimal" placeholder="0" value={inv.discountValue} onChange={(e) => set({ discountValue: e.target.value })} className="w-16 text-right" />
              </dt>
              <dd className="shrink-0 whitespace-nowrap tabular-nums">{totals.discount > 0 ? `−${money(totals.discount)}` : money(0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className={`flex items-center gap-2 ${PAPER_MUTED}`}>
                <PaperInput label="Tax name" value={inv.taxLabel} maxLength={MAX_LEN.taxLabel} onChange={(e) => set({ taxLabel: e.target.value })} className="w-16" />
                <PaperInput label="Tax rate in percent" inputMode="decimal" placeholder="0" value={inv.taxRate} onChange={(e) => set({ taxRate: e.target.value })} className="w-16 text-right" />
                <span aria-hidden="true">%</span>
              </dt>
              <dd className="shrink-0 whitespace-nowrap tabular-nums">{money(totals.tax)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t-2 border-[#0C2248] pt-3 text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="invoice-total">
                {money(totals.total)}
              </dd>
            </div>
          </dl>
          {totals.problems.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm font-medium text-[#B42318]">
              {totals.problems.map((p) => (
                <li key={p}>⚠ {p}</li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="notes-h" className="md:col-start-1 md:row-start-1">
          <h2 id="notes-h" className={`text-[11px] font-semibold uppercase tracking-wide ${PAPER_MUTED}`}>
            Notes
          </h2>
          <PaperTextarea label="Notes or payment details" placeholder="Payment details (bank, UPI), thank-you note or terms" value={inv.notes} maxLength={MAX_LEN.notes} onChange={(e) => set({ notes: e.target.value })} rows={4} />
        </section>
        </div>

        {!can('invoice_watermark_remove') && (
          <p className="mt-10 text-center text-xs text-[#5B6478]">Made with KaamSolv · kaamsolv.com</p>
        )}
      </article>

      {/* Screen-reader total, announced 800 ms after typing stops */}
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      {/* Phone: download always within reach */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hair bg-surface/95 p-3 backdrop-blur md:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Total</p>
            <p className="truncate font-display text-lg font-bold text-ink">{money(totals.total)}</p>
          </div>
          <button type="button" onClick={() => makePdf('download')} disabled={busy !== null} className={PRIMARY}>
            <Icon name="download" className="h-4 w-4" />
            {busy === 'download' ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
