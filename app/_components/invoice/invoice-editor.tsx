'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import { PAPER_MUTED, PAPER_TEXT, PaperCaption, PaperInput, PaperTextarea } from './paper-fields';
import { countPdfPages, pdfFilename, renderInvoicePdf } from './generate-pdf';
import { SavedDatalists, useSavedLists } from './saved-lists';
import { DesignPicker } from './design-panel';
import { Segmented } from '../choice';
import { refreshMe, useEntitlements, useMe } from '@/app/lib/me-client';
import { downloadBlob } from '@/app/lib/image/export';
import { trackToolError, trackToolSuccess } from '@/app/lib/analytics';
import { addDays, DEFAULT_DUE_DAYS, QUOTE_VALID_DAYS, hasContent, newInvoice, newLineItem, withFreshItemIds } from '@/app/lib/invoice/defaults';
import { clearInvoiceDraft, loadInvoiceDraft, saveInvoiceDraft } from '@/app/lib/invoice/draft';
import { readLogo } from '@/app/lib/invoice/logo';
import { GST_RATES, GST_RATES_NOTE, isListedGstRate, TAX_LABELS } from '@/app/lib/invoice/gst';
import { EXPORT_CODE, isGstEstimate, isTaxInvoice, placeOfSupplyLabel, placeOfSupplyOf, taxInvoiceNumberProblem } from '@/app/lib/invoice/gst-tax';
import { DEFAULT_DESIGN } from '@/app/lib/invoice/design';
import { GST_STATES, hsnProblem } from '@/app/lib/invoice/india';
import { rupeesInWords } from '@/app/lib/invoice/words';
import { LOGO_MAX_BYTES, LOGO_MAX_PX, LOGO_TYPES, MAX_FREE_ITEMS, MAX_LEN } from '@/app/lib/invoice/limits';
import { CURRENCY_LABELS, currencySymbol, formatMoney } from '@/app/lib/invoice/money';
import { computeTotals } from '@/app/lib/invoice/totals';
import { CURRENCIES, EMPTY_PAYMENT, hasPaymentDetails, type CurrencyCode, type Invoice, type LineItem, type PaymentDetails } from '@/app/lib/invoice/types';
import { gstinProblem, ifscProblem, normalizeGstin, upiProblem } from '@/app/lib/invoice/india';
import type { Settings } from '@/app/lib/invoice/settings';

const BTN =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60';
const PRIMARY = `${BTN} bg-coral-500 text-navy-900 hover:bg-coral-600 hover:text-white`;
const SECONDARY = `${BTN} border border-hair bg-surface text-strong hover:bg-wash`;
/** Selects on the white paper (fixed colours in both themes). */
const PAPER_SELECT =
  'h-9 rounded-md border border-[#AEB6C6] bg-white px-1.5 text-sm text-[#0C2248] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6336]/40';

/** GET /api/business-profile — Settings + logo + next number. */
type Profile = Settings & { logo: string | null; signature?: string | null; nextNumber: string; nextQuoteNumber?: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** What gets saved for the invoice itself (the logo lives on the profile). */
const docKey = (inv: Invoice) => JSON.stringify({ ...inv, logo: null, signature: null, items: inv.items.map(({ id: _id, ...rest }) => rest) });
/** What gets saved as the business profile (fixed field order — stored JSON can reorder keys). */
const sellerKey = (s: Invoice['seller'], logo: string | null) => JSON.stringify([s.name, s.address, s.email, s.phone, logo]);
const profileKey = (inv: Invoice) => sellerKey(inv.seller, inv.logo);

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

/**
 * A new invoice that starts from Settings: details, numbering, defaults, payment
 * details. Pro: the default design, and a quotation when asked for.
 */
function fromProfile(p: Profile, opts: { design: boolean; quote: boolean }): Invoice {
  const base = newInvoice();
  const dueDays = Number.isInteger(p.defaultDueDays) ? p.defaultDueDays : DEFAULT_DUE_DAYS;
  const payment: PaymentDetails = {
    accountName: p.bankAccountName ?? '',
    accountNumber: p.bankAccountNumber ?? '',
    ifsc: p.bankIfsc ?? '',
    bankName: p.bankName ?? '',
    upiId: p.upiId ?? '',
    showUpiQr: !!p.showUpiQr,
  };
  const inv: Invoice = {
    ...base,
    number: p.nextNumber,
    dueDate: addDays(base.issueDate, dueDays),
    currency: p.defaultCurrency ?? base.currency,
    taxLabel: p.defaultTaxLabel ?? base.taxLabel,
    taxRate: p.defaultTaxRate ?? base.taxRate,
    notes: p.defaultNotes ?? '',
    seller: {
      name: p.name,
      address: p.address,
      email: p.email,
      phone: p.phone,
      ...(p.stateCode ? { state: p.stateCode } : {}),
      ...(p.gstin ? { gstin: p.gstin } : {}),
    },
    logo: p.logo,
    signature: p.signature ?? null,
    ...(p.composition ? { docType: 'bill_of_supply' as const, taxLabel: '', taxRate: '' } : {}),
    ...(hasPaymentDetails(payment) ? { payment } : {}),
    ...(opts.design ? { design: { template: p.defaultTemplate ?? DEFAULT_DESIGN.template, color: p.defaultBrandColor ?? DEFAULT_DESIGN.color } } : {}),
  };
  return opts.quote ? switchKind(inv, true, p) : inv;
}

/**
 * Invoice ⇄ quotation: the untouched next number swaps to the other sequence
 * (INV-0008 ⇄ QT-0003) and the due / valid-until date resets from the issue date.
 */
function switchKind(cur: Invoice, toQuote: boolean, p: Profile | null): Invoice {
  const fromNo = toQuote ? p?.nextNumber : p?.nextQuoteNumber;
  const toNo = toQuote ? p?.nextQuoteNumber : p?.nextNumber;
  const days = toQuote ? QUOTE_VALID_DAYS : Number.isInteger(p?.defaultDueDays) ? p!.defaultDueDays : DEFAULT_DUE_DAYS;
  return {
    ...cur,
    kind: toQuote ? 'quote' : undefined,
    number: toNo && cur.number === fromNo ? toNo : cur.number,
    dueDate: cur.issueDate ? addDays(cur.issueDate, days) : cur.dueDate,
  };
}

export function InvoiceEditor() {
  const me = useMe();
  const { can, limit } = useEntitlements();
  const signedIn = me.status === 'signed-in';

  // Built after mount (and once we know who's here) so numbers and dates use
  // the visitor's clock, and a draft or saved invoice can be restored.
  const [inv, setInv] = useState<Invoice | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const profile = useRef<Profile | null>(null);
  const lastSaved = useRef('');
  const lastProfile = useRef('');
  const started = useRef(false);

  useEffect(() => {
    if (me.status === 'loading' || started.current) return;
    started.current = true;
    void (async () => {
      const draft = loadInvoiceDraft();
      if (me.status !== 'signed-in') {
        setInv(draft ? withFreshItemIds(draft) : newInvoice());
        return;
      }
      const p = await api<{ profile?: Profile }>('/api/business-profile');
      profile.current = p.body.profile ?? null;
      if (profile.current) lastProfile.current = sellerKey(profile.current, profile.current.logo);
      const id = new URLSearchParams(window.location.search).get('id');
      if (id) {
        const r = await api<{ invoice?: Invoice; status?: 'unpaid' | 'paid' }>(`/api/invoices/${encodeURIComponent(id)}`);
        if (r.ok && r.body.invoice) {
          const loaded = withFreshItemIds({ ...r.body.invoice, logo: profile.current?.logo ?? null, signature: profile.current?.signature ?? null });
          lastSaved.current = docKey(loaded);
          setPaid(r.body.status ?? 'unpaid');
          setSavedId(id);
          setSaveState('saved');
          setInv(loaded);
          return;
        }
        setSaveMsg('That invoice isn’t in your account any more — here’s a new one instead.');
        window.history.replaceState(null, '', '/invoice-generator');
      }
      // "New quotation" (Pro) from All invoices.
      const wantQuote = new URLSearchParams(window.location.search).get('type') === 'quote' && can('invoice_quote_mode');
      if (window.location.search.includes('type=')) window.history.replaceState(null, '', '/invoice-generator');
      const designOk = can('invoice_templates') || can('invoice_brand_color');
      // Carried over from before signing in? Keep it; otherwise start from the profile.
      if (draft && hasContent(draft)) {
        const kept = withFreshItemIds(draft);
        if (wantQuote && kept.kind !== 'quote') {
          setInv(switchKind(kept, true, profile.current));
          setSaveMsg('Your unsaved draft is open as a quotation — switch back to Invoice above to keep it as an invoice.');
        } else setInv(kept);
      } else setInv(profile.current ? fromProfile(profile.current, { design: designOk, quote: wantQuote }) : newInvoice());
    })();
  }, [me.status]);

  const save = useCallback(async () => {
    if (!inv || saveState === 'saving') return;
    const key = docKey(inv);
    setSaveState('saving');
    setSaveMsg(null);
    const payload = JSON.stringify({ invoice: { ...inv, logo: null, signature: null } });
    const r = await api<{ id?: string; message?: string }>(savedId ? `/api/invoices/${savedId}` : '/api/invoices', {
      method: savedId ? 'PUT' : 'POST',
      body: payload,
    }).catch(() => ({ ok: false, status: 0, body: {} as { id?: string; message?: string } }));
    if (!r.ok) {
      setSaveState('error');
      setSaveMsg(r.body.message ?? 'Couldn’t save — check your connection and try again.');
      return;
    }
    const newId = r.body.id;
    if (!savedId && newId) {
      setSavedId(newId);
      window.history.replaceState(null, '', `/invoice-generator?id=${newId}`);
      clearInvoiceDraft();
      void refreshMe();
    }
    lastSaved.current = key;
    // Remember the business details and logo for the next invoice.
    const pk = profileKey(inv);
    if (pk !== lastProfile.current) {
      const pr = await api('/api/business-profile', { method: 'PUT', body: JSON.stringify({ ...inv.seller, logo: inv.logo }) });
      if (pr.ok) lastProfile.current = pk;
    }
    setSaveState('saved');
  }, [inv, saveState, savedId]);

  // Not signed in, or not saved yet: keep a draft in this browser.
  useEffect(() => {
    if (!inv || savedId) return;
    const t = setTimeout(() => (hasContent(inv) ? saveInvoiceDraft(inv) : clearInvoiceDraft()), 400);
    const flush = () => hasContent(inv) && saveInvoiceDraft(inv);
    window.addEventListener('pagehide', flush);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pagehide', flush);
    };
  }, [inv, savedId]);

  // Saved invoices autosave 1.5 s after typing stops.
  const pending = Boolean(inv && savedId && docKey(inv) !== lastSaved.current) || Boolean(inv && savedId && profileKey(inv) !== lastProfile.current);
  useEffect(() => {
    if (!pending || saveState === 'saving' || saveState === 'error') return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
  }, [pending, inv, saveState, save]);

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

  // Drafts survive a refresh, so only warn when saved changes haven't reached the server yet.
  const dirty = inv ? hasContent(inv) : false;
  const unsynced = pending || saveState === 'saving';
  useEffect(() => {
    if (!unsynced) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsynced]);

  // Tax row: GST shows the rate dropdown (Other… opens a number box); VAT/Tax a number box.
  const [gstOther, setGstOther] = useState(false);
  const taxType = !inv
    ? 'GST'
    : inv.docType === 'bill_of_supply'
      ? 'composition'
      : inv.taxLabel.trim() === '' && inv.taxRate.trim() === ''
        ? 'none'
        : (TAX_LABELS as readonly string[]).includes(inv.taxLabel.trim())
          ? inv.taxLabel.trim()
          : 'Tax';
  // Stage 2B: a GST tax invoice (seller GSTIN + INR + GST), or a Bill of Supply (composition).
  const taxInv = !!inv && isTaxInvoice(inv);
  const billOfSupply = !!inv && inv.docType === 'bill_of_supply';
  const gstEstimate = !!inv && isGstEstimate(inv);
  const gstWithoutGstin = !!inv && taxType === 'GST' && inv.currency === 'INR' && !taxInv && !gstEstimate && parseFloat(inv.taxRate) > 0;
  const showOtherRate = gstOther || (!!inv && inv.taxRate.trim() !== '' && !isListedGstRate(inv.taxRate));

  const saveLimit = limit('invoice_save');
  const savedCount = me.status === 'signed-in' ? me.usage.invoiceSave : 0;
  const atLimit = signedIn && !savedId && saveLimit !== null && savedCount >= saveLimit;

  // Saved customers and items (signed in), offered as suggestions.
  const canCustomers = signedIn && can('invoice_client_directory');
  const canItems = signedIn && can('invoice_item_catalogue');
  const saved = useSavedLists({ customers: canCustomers, items: canItems });
  const [customerMsg, setCustomerMsg] = useState<string | null>(null);
  const customerLimit = limit('invoice_client_directory');
  const customersAtLimit =
    canCustomers && customerLimit !== null && me.status === 'signed-in' && me.usage.customers >= customerLimit;

  // Paid / unpaid (Pro), for saved invoices.
  const canTrack = signedIn && can('invoice_dashboard');
  const [paid, setPaid] = useState<'unpaid' | 'paid'>('unpaid');

  // Pro (Stage 2C-1): quotations, templates and brand colour. Hidden from free accounts.
  const canQuote = signedIn && can('invoice_quote_mode');
  const canDesign = signedIn && (can('invoice_templates') || can('invoice_brand_color'));
  const [designOpen, setDesignOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  if (!inv || !totals) {
    return <div className="mx-auto min-h-[60vh] max-w-[794px] animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;
  }

  const quote = inv.kind === 'quote';
  const docWord = quote ? 'quotation' : 'invoice';
  const design = canDesign ? (inv.design ?? DEFAULT_DESIGN) : DEFAULT_DESIGN;
  const set = (patch: Partial<Invoice>) => setInv((cur) => (cur ? { ...cur, ...patch } : cur));
  const setSeller = (patch: Partial<Invoice['seller']>) => setInv((cur) => (cur ? { ...cur, seller: { ...cur.seller, ...patch } } : cur));
  const setClient = (patch: Partial<Invoice['client']>) => setInv((cur) => (cur ? { ...cur, client: { ...cur.client, ...patch } } : cur));
  const setItem = (id: string, patch: Partial<LineItem>) =>
    setInv((cur) => (cur ? { ...cur, items: cur.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : cur));
  const money = (n: number) => formatMoney(n, inv.currency);
  const setPayment = (patch: Partial<PaymentDetails>) =>
    setInv((cur) => (cur ? { ...cur, payment: { ...(cur.payment ?? EMPTY_PAYMENT), ...patch } } : cur));

  /** Typing a saved customer's name (from the suggestions) fills "Bill to". */
  function onClientName(name: string) {
    const match = saved.customers.find((c) => c.name === name);
    if (!match) {
      // A different name than the linked customer: it's no longer that customer.
      setInv((cur) => (cur ? { ...cur, client: { ...cur.client, name }, customerId: cur.customerId && cur.client.name !== name ? null : cur.customerId } : cur));
      return;
    }
    const address = [match.contactName && `Attn: ${match.contactName}`, match.address].filter(Boolean).join('\n');
    set({
      client: {
        name: match.name,
        address,
        email: match.email,
        ...(match.stateCode ? { state: match.stateCode } : {}),
        ...(match.gstin ? { gstin: match.gstin } : {}),
      },
      customerId: match.id,
    });
    setCustomerMsg(null);
  }

  async function saveAsCustomer() {
    setCustomerMsg(null);
    const c = inv!.client;
    const r = await api<{ id?: string; message?: string; errors?: Record<string, string> }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: c.name, address: c.address, email: c.email, stateCode: c.state ?? '', gstin: c.gstin ?? '' }),
    }).catch(() => null);
    if (!r?.ok || !r.body.id) {
      setCustomerMsg(r?.body.errors ? Object.values(r.body.errors)[0] : (r?.body.message ?? 'Couldn’t save the customer. Try again.'));
      return;
    }
    set({ customerId: r.body.id });
    setCustomerMsg(`Saved ${c.name} to your customers.`);
    void saved.reload();
    void refreshMe();
  }

  /** Picking a saved item from the suggestions fills its rate, HSN/SAC and unit. */
  function onItemDescription(id: string, description: string) {
    const match = saved.items.find((it) => it.name === description);
    setItem(
      id,
      match
        ? {
            description,
            rate: match.rate || '',
            ...(match.hsnSac ? { hsn: match.hsnSac } : {}),
            ...(match.unit ? { unit: match.unit } : {}),
            ...(match.gstRate ? { gstRate: match.gstRate } : {}),
          }
        : { description },
    );
  }

  async function togglePaid() {
    const next = paid === 'paid' ? 'unpaid' : 'paid';
    const r = await api(`/api/invoices/${savedId}/status`, { method: 'PUT', body: JSON.stringify({ status: next }) }).catch(() => null);
    if (r?.ok) setPaid(next);
    else setSaveMsg('Couldn’t change the paid status. Try again.');
  }

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
      const blob = await renderInvoicePdf(inv!, totals!, { watermark: !can('invoice_watermark_remove'), design: canDesign ? design : null });
      // Pro invoices flow onto more pages by design; free ones are meant to fit one.
      const pages = can('invoice_unlimited_items') ? 1 : await countPdfPages(blob);
      const overflow = pages > 1 ? ' It runs onto a second page — shorten the notes or item descriptions to fit one.' : '';
      trackToolSuccess('generator', true);
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
      trackToolError('pdf_failed', 'generator');
      setMessage('Couldn’t create the PDF. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  /** A saved quotation → a new invoice (same client and lines); the editor opens on it. */
  async function convertToInvoice() {
    setConverting(true);
    setSaveMsg(null);
    const r = await api<{ id?: string; message?: string }>(`/api/invoices/${savedId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ issueDate: newInvoice().issueDate }),
    }).catch(() => null);
    if (!r?.ok || !r.body.id) {
      setConverting(false);
      setSaveMsg(r?.body.message ?? 'Couldn’t make the invoice. Try again.');
      return;
    }
    void refreshMe();
    window.location.assign(`/invoice-generator?id=${r.body.id}`);
  }

  async function startNew() {
    if (!savedId && dirty && !window.confirm(`Start a new ${docWord}? This one will be cleared — it isn’t saved.`)) return;
    clearInvoiceDraft();
    setSavedId(null);
    setSaveState('idle');
    setSaveMsg(null);
    setMessage(null);
    setLogoError(null);
    lastSaved.current = '';
    if (savedId) window.history.replaceState(null, '', '/invoice-generator');
    if (!signedIn) {
      setInv(newInvoice());
      return;
    }
    // Fresh profile: the business details just saved, and the next number.
    const p = await api<{ profile?: Profile }>('/api/business-profile').catch(() => null);
    if (p?.body.profile) {
      profile.current = p.body.profile;
      lastProfile.current = sellerKey(p.body.profile, p.body.profile.logo);
    }
    setInv(profile.current ? fromProfile(profile.current, { design: canDesign, quote: quote && canQuote }) : newInvoice());
  }

  const saveStatus =
    saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : savedId && !pending ? 'Saved' : savedId ? 'Unsaved changes' : null;

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
        {canQuote && !savedId && (
          <Segmented
            legend="Document type"
            hideLegend
            options={[
              { value: 'invoice', label: 'Invoice' },
              { value: 'quote', label: 'Quotation' },
            ]}
            value={quote ? 'quote' : 'invoice'}
            onChange={(k) => setInv((cur) => (cur ? switchKind(cur, k === 'quote', profile.current) : cur))}
          />
        )}
        {canDesign && (
          <button type="button" onClick={() => setDesignOpen((o) => !o)} aria-expanded={designOpen} aria-controls="design-panel" className={SECONDARY}>
            <span className="h-3.5 w-3.5 rounded-full border border-hair" style={{ backgroundColor: design.color }} aria-hidden="true" />
            Design
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {signedIn && saveStatus && (
            <span className={`text-sm font-medium ${saveState === 'error' ? 'text-danger-600' : 'text-muted'}`} role="status">
              {saveState === 'saved' && !pending && <Icon name="check" className="mr-1 inline h-4 w-4 text-teal-500" />}
              {saveStatus}
            </span>
          )}
          {savedId && quote && canQuote && (
            <button type="button" onClick={() => void convertToInvoice()} disabled={converting || unsynced} className={SECONDARY}>
              {converting ? 'Converting…' : 'Convert to invoice'}
            </button>
          )}
          {savedId && canTrack && !quote && (
            <button type="button" onClick={() => void togglePaid()} className={SECONDARY} aria-pressed={paid === 'paid'}>
              {paid === 'paid' ? (
                <>
                  <Icon name="check" className="h-4 w-4 text-teal-500" /> Paid
                </>
              ) : (
                'Mark as paid'
              )}
            </button>
          )}
          {signedIn && (!savedId || saveState === 'error') && (
            <button type="button" onClick={() => void save()} disabled={atLimit || saveState === 'saving'} className={SECONDARY}>
              {saveState === 'error' ? 'Retry save' : 'Save'}
            </button>
          )}
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

      {canDesign && designOpen && (
        <section id="design-panel" aria-labelledby="design-h" className="mb-4 rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="design-h" className="font-display text-base font-bold text-ink">
                Design
              </h2>
              <p className="text-sm text-muted">Shows on the PDF — press Preview PDF to see it.</p>
            </div>
            <button type="button" onClick={() => setDesignOpen(false)} className={SECONDARY}>
              Done
            </button>
          </div>
          <DesignPicker
            value={design}
            onChange={(d) => set({ design: d })}
            templates={can('invoice_templates')}
            color={can('invoice_brand_color')}
          />
        </section>
      )}

      <p className="mb-4 flex items-start gap-2 text-sm text-muted">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
        {!signedIn ? (
          <span>
            Your draft stays in this browser — nothing is uploaded.{' '}
            <a href="/login?next=%2Finvoice-generator" className="font-semibold text-ink underline underline-offset-2 hover:text-coral-600">
              Sign in to save invoices and reuse your details — free.
            </a>
          </span>
        ) : savedId ? (
          <span>
            Saved in your account — changes save as you type.{' '}
            <a href="/app/invoices" className="font-semibold text-ink underline underline-offset-2 hover:text-coral-600">
              My invoices
            </a>
          </span>
        ) : (
          <span>
            Not saved yet — press Save to keep it in your account
            {saveLimit !== null && ` (${savedCount} of ${saveLimit} saved)`}.
          </span>
        )}
      </p>

      {atLimit && (
        <p className="mb-4 rounded-lg border border-hair bg-wash p-3 text-sm text-ink" role="status">
          You’ve saved {saveLimit} invoices — the free limit. Delete one to save another. You can still download this one as a
          PDF.{' '}
          <a href="/app/invoices" className="font-semibold underline underline-offset-2">
            My invoices
          </a>
        </p>
      )}

      {saveMsg && !atLimit && (
        <p className={`mb-4 text-sm font-semibold ${saveState === 'error' ? 'text-danger-600' : 'text-ink'}`} role="alert">
          {saveMsg}
        </p>
      )}

      {message && (
        <p className="mb-4 text-sm font-semibold text-ink" role="status">
          {message}
        </p>
      )}

      {/* The paper */}
      <article
        aria-label="Invoice"
        className={`mx-auto max-w-[794px] rounded-xl2 border border-[#E3E7EF] bg-white p-5 shadow-lift [color-scheme:light] sm:p-8 md:min-h-[1123px] md:p-12 ${PAPER_TEXT}`}
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
            <GstinField label="Your GSTIN" value={inv.seller.gstin ?? ''} onChange={(gstin) => setSeller({ gstin })} />
          </section>

          {/* Invoice meta */}
          <section aria-labelledby="meta-h" className="space-y-2 md:w-60">
            <h2 id="meta-h" className="text-2xl font-bold tracking-wide md:text-right">
              {quote ? 'QUOTATION' : taxInv ? 'TAX INVOICE' : billOfSupply ? 'BILL OF SUPPLY' : 'INVOICE'}
            </h2>
            {taxInv && <p className={`text-xs md:text-right ${PAPER_MUTED}`}>This is a GST tax invoice.</p>}
            {gstEstimate && <p className={`text-xs md:text-right ${PAPER_MUTED}`}>GST shown is an estimate. A tax invoice follows on supply.</p>}
            {billOfSupply && !quote && <p className={`text-xs md:text-right ${PAPER_MUTED}`}>Composition taxable person, not eligible to collect tax on supplies</p>}
            <div>
              <PaperCaption htmlFor="inv-number">{quote ? 'Quote no.' : 'Invoice no.'}</PaperCaption>
              <PaperInput
                id="inv-number"
                label={quote ? 'Quotation number' : 'Invoice number'}
                value={inv.number}
                maxLength={MAX_LEN.number}
                aria-invalid={(taxInv && !!taxInvoiceNumberProblem(inv.number)) || undefined}
                onChange={(e) => set({ number: e.target.value })}
              />
              {taxInv && taxInvoiceNumberProblem(inv.number) && <p className="text-xs font-medium text-[#B42318]">{taxInvoiceNumberProblem(inv.number)}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
              <div>
                <PaperCaption htmlFor="inv-date">Date</PaperCaption>
                <PaperInput
                  id="inv-date"
                  label={quote ? 'Quotation date' : 'Invoice date'}
                  type="date"
                  value={inv.issueDate}
                  onChange={(e) =>
                    set({ issueDate: e.target.value, dueDate: e.target.value ? addDays(e.target.value, quote ? QUOTE_VALID_DAYS : DEFAULT_DUE_DAYS) : inv.dueDate })
                  }
                />
              </div>
              <div>
                <PaperCaption htmlFor="inv-due">{quote ? 'Valid until' : 'Due date'}</PaperCaption>
                <PaperInput id="inv-due" label={quote ? 'Valid until' : 'Due date'} type="date" value={inv.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              </div>
            </div>
          </section>
        </div>

        <div className="my-7 h-0.5 w-10" style={{ backgroundColor: design.color }} aria-hidden="true" />

        {/* Client */}
        <section aria-labelledby="to-h" className="max-w-sm space-y-1.5">
          <h2 id="to-h" className={`text-[11px] font-semibold uppercase tracking-wide ${PAPER_MUTED}`}>
            Bill to
          </h2>
          <PaperInput
            label="Client name"
            placeholder={canCustomers && saved.customers.length ? 'Client name — or pick a saved customer' : 'Client name'}
            value={inv.client.name}
            maxLength={MAX_LEN.name}
            list={canCustomers ? 'saved-customers' : undefined}
            autoComplete="off"
            onChange={(e) => onClientName(e.target.value)}
            className="font-semibold"
          />
          <PaperTextarea label="Client address" placeholder="Client address" value={inv.client.address} maxLength={MAX_LEN.address} onChange={(e) => setClient({ address: e.target.value })} rows={2} />
          <PaperInput label="Client email" type="email" inputMode="email" placeholder="Client email" value={inv.client.email} maxLength={MAX_LEN.email} onChange={(e) => setClient({ email: e.target.value })} />
          <GstinField label="Client GSTIN" value={inv.client.gstin ?? ''} onChange={(gstin) => setClient({ gstin })} />
          {(taxInv || gstEstimate) && (
            <div className="space-y-2 pt-2">
              <label className={`block text-[11px] font-semibold uppercase tracking-wide ${PAPER_MUTED}`} htmlFor="inv-pos">
                Place of supply
              </label>
              <select id="inv-pos" value={placeOfSupplyOf(inv)} onChange={(e) => set({ placeOfSupply: e.target.value })} className={`${PAPER_SELECT} w-full`}>
                {GST_STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code})
                  </option>
                ))}
                <option value={EXPORT_CODE}>{placeOfSupplyLabel(EXPORT_CODE)}</option>
              </select>
              {taxInv && (
                <label className={`flex min-h-11 items-center gap-2 text-sm md:min-h-9 ${PAPER_MUTED}`}>
                  <input type="checkbox" checked={!!inv.reverseCharge} onChange={(e) => set({ reverseCharge: e.target.checked })} className="h-4 w-4 accent-[#FE6336]" />
                  Tax payable on reverse charge
                </label>
              )}
            </div>
          )}
          {inv.shipTo === undefined ? (
            <button type="button" onClick={() => set({ shipTo: '' })} className="pt-1 text-xs font-semibold text-[#0C2248] underline underline-offset-2 hover:text-[#C2410C]">
              + Deliver to a different address
            </button>
          ) : (
            <div className="pt-2">
              <div className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide ${PAPER_MUTED}`}>
                Ship to
                <button type="button" onClick={() => set({ shipTo: undefined })} className="text-xs font-medium normal-case tracking-normal underline">
                  Remove
                </button>
              </div>
              <PaperTextarea label="Delivery address" placeholder="Delivery address" value={inv.shipTo} maxLength={MAX_LEN.address} onChange={(e) => set({ shipTo: e.target.value })} rows={2} />
            </div>
          )}
          {canCustomers && inv.client.name.trim() && !inv.customerId && (
            <div className="pt-1">
              {customersAtLimit ? (
                <p className={`text-xs ${PAPER_MUTED}`}>
                  You’ve saved {customerLimit} customers — the free limit. Saving more than {customerLimit} customers is part of Pro — coming
                  soon. You can still type any customer straight onto an invoice.
                </p>
              ) : (
                <button type="button" onClick={() => void saveAsCustomer()} className="text-xs font-semibold text-[#0C2248] underline underline-offset-2 hover:text-[#C2410C]">
                  Save as customer
                </button>
              )}
            </div>
          )}
          {customerMsg && (
            <p className={`text-xs ${PAPER_MUTED}`} role="status">
              {customerMsg}
            </p>
          )}
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
                    <PaperInput
                      data-item-desc
                      label={`Item ${i + 1} description`}
                      placeholder="What you did or sold"
                      value={it.description}
                      maxLength={MAX_LEN.description}
                      list={canItems ? 'saved-items' : undefined}
                      autoComplete="off"
                      onChange={(e) => onItemDescription(it.id, e.target.value)}
                    />
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
                  {(taxInv || gstEstimate) && (
                    <div className={`col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:col-span-5 ${PAPER_MUTED}`}>
                      <label className="flex items-center gap-1.5">
                        HSN/SAC
                        <PaperInput
                          label={`Item ${i + 1} HSN or SAC code`}
                          inputMode="numeric"
                          placeholder="9983"
                          value={it.hsn ?? ''}
                          maxLength={MAX_LEN.hsn}
                          aria-invalid={(!!it.hsn && !!hsnProblem(it.hsn)) || undefined}
                          onChange={(e) => setItem(it.id, { hsn: e.target.value.replace(/\D/g, '') })}
                          className="w-20 text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        Unit
                        <PaperInput label={`Item ${i + 1} unit`} placeholder="pcs" value={it.unit ?? ''} maxLength={MAX_LEN.unit} onChange={(e) => setItem(it.id, { unit: e.target.value })} className="w-14 text-xs" />
                      </label>
                      <select
                        aria-label={`Item ${i + 1} GST rate`}
                        value={it.gstRate ?? ''}
                        onChange={(e) => setItem(it.id, { gstRate: e.target.value || undefined })}
                        className={`${PAPER_SELECT} h-8 text-xs`}
                      >
                        <option value="">GST: {quote ? 'quotation' : 'invoice'} rate{inv.taxRate.trim() ? ` (${inv.taxRate.trim()}%)` : ''}</option>
                        {GST_RATES.map((r) => (
                          <option key={r} value={r}>
                            GST {r}%
                          </option>
                        ))}
                        {it.gstRate && !isListedGstRate(it.gstRate) && <option value={it.gstRate}>GST {it.gstRate}%</option>}
                      </select>
                      {it.hsn && hsnProblem(it.hsn) && <span className="font-medium text-[#B42318]">4, 6 or 8 digits (4 if turnover is up to ₹5 crore, 6 above)</span>}
                    </div>
                  )}
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
              <dt className={`flex flex-wrap items-center gap-2 ${PAPER_MUTED}`}>
                <select
                  aria-label="Tax type"
                  value={taxType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGstOther(false);
                    set(
                      v === 'none'
                        ? { taxLabel: '', taxRate: '', docType: undefined }
                        : v === 'composition'
                          ? { taxLabel: '', taxRate: '', docType: 'bill_of_supply' }
                          : { taxLabel: v, taxRate: v === 'GST' && !isListedGstRate(inv.taxRate) ? '' : inv.taxRate, docType: undefined },
                    );
                  }}
                  className={`${PAPER_SELECT} max-w-[8.5rem]`}
                >
                  {TAX_LABELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  <option value="none">No tax</option>
                  <option value="composition">Bill of Supply (composition)</option>
                </select>
                {taxType === 'GST' && !showOtherRate && (
                  <select
                    aria-label="GST rate"
                    value={inv.taxRate.trim()}
                    onChange={(e) => {
                      if (e.target.value === 'other') {
                        setGstOther(true);
                        requestAnimationFrame(() => document.getElementById('tax-rate-other')?.focus());
                      } else set({ taxRate: e.target.value });
                    }}
                    className={PAPER_SELECT}
                  >
                    <option value="">Choose rate</option>
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                    <option value="other">Other…</option>
                  </select>
                )}
                {taxType !== 'none' && taxType !== 'composition' && (taxType !== 'GST' || showOtherRate) && (
                  <>
                    <PaperInput id="tax-rate-other" label="Tax rate in percent" inputMode="decimal" placeholder="0" value={inv.taxRate} onChange={(e) => set({ taxRate: e.target.value })} className="w-16 text-right" />
                    <span aria-hidden="true">%</span>
                    {taxType === 'GST' && (
                      <button type="button" onClick={() => { setGstOther(false); if (!isListedGstRate(inv.taxRate)) set({ taxRate: '' }); }} className="text-xs underline">
                        List
                      </button>
                    )}
                  </>
                )}
              </dt>
              <dd className="shrink-0 whitespace-nowrap tabular-nums">{taxType === 'none' ? '—' : money(totals.tax)}</dd>
            </div>
            {taxType === 'GST' && <p className={`text-xs ${PAPER_MUTED}`}>{GST_RATES_NOTE}</p>}
            {totals.gst && (
              <div className={`space-y-1 border-t border-dashed border-[#E3E7EF] pt-2 text-xs ${PAPER_MUTED}`} data-testid="gst-split">
                {totals.gst.split === 'inter' ? (
                  <div className="flex justify-between">
                    <span>IGST</span>
                    <span className="tabular-nums">{money(totals.gst.igst)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>CGST</span>
                      <span className="tabular-nums">{money(totals.gst.cgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{totals.gst.split === 'ut' ? 'UTGST' : 'SGST'}</span>
                      <span className="tabular-nums">{money(totals.gst.sgst)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            {gstWithoutGstin && (
              <p className="text-xs font-medium text-[#B42318]" role="note">
                Only GST-registered businesses can charge GST — add your GSTIN, or pick No tax.
              </p>
            )}
            <div className="flex justify-between gap-3 border-t-2 border-[#0C2248] pt-3 text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="invoice-total">
                {money(totals.total)}
              </dd>
            </div>
            {inv.currency === 'INR' && totals.total > 0 && (taxInv || billOfSupply || gstEstimate) && (
              <p className={`text-xs ${PAPER_MUTED}`}>{rupeesInWords(totals.total)}</p>
            )}
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
          <PaperTextarea label="Notes or payment details" placeholder="Thank-you note, terms, or anything else" value={inv.notes} maxLength={MAX_LEN.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} />

          <div className="mt-4">
            {!inv.payment ? (
              <button type="button" onClick={() => set({ payment: { ...EMPTY_PAYMENT } })} className="text-sm font-semibold text-[#0C2248] underline underline-offset-2 hover:text-[#C2410C]">
                + Add payment details (bank / UPI)
              </button>
            ) : (
              <fieldset className="space-y-1">
                <legend className={`flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide ${PAPER_MUTED}`}>
                  Payment details
                  <button type="button" onClick={() => set({ payment: undefined })} className="text-xs font-medium normal-case tracking-normal underline">
                    Remove
                  </button>
                </legend>
                <PaperInput label="Bank account name" placeholder="Account name" value={inv.payment.accountName} maxLength={MAX_LEN.bankAccountName} onChange={(e) => setPayment({ accountName: e.target.value })} />
                <PaperInput label="Bank account number" placeholder="Account number" inputMode="numeric" value={inv.payment.accountNumber} maxLength={MAX_LEN.bankAccountNumber} onChange={(e) => setPayment({ accountNumber: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <PaperInput
                    label="IFSC"
                    placeholder="IFSC"
                    value={inv.payment.ifsc}
                    maxLength={MAX_LEN.ifsc}
                    aria-invalid={(inv.payment.ifsc.trim() !== '' && !!ifscProblem(inv.payment.ifsc)) || undefined}
                    onChange={(e) => setPayment({ ifsc: e.target.value.toUpperCase() })}
                  />
                  <PaperInput label="Bank name" placeholder="Bank" value={inv.payment.bankName} maxLength={MAX_LEN.bankName} onChange={(e) => setPayment({ bankName: e.target.value })} />
                </div>
                <PaperInput
                  label="UPI ID"
                  placeholder="UPI ID (name@bank)"
                  value={inv.payment.upiId}
                  maxLength={MAX_LEN.upiId}
                  aria-invalid={(inv.payment.upiId.trim() !== '' && !!upiProblem(inv.payment.upiId)) || undefined}
                  onChange={(e) => setPayment({ upiId: e.target.value })}
                />
                {inv.payment.ifsc.trim() !== '' && ifscProblem(inv.payment.ifsc) && <p className="text-xs font-medium text-[#B42318]">{ifscProblem(inv.payment.ifsc)}</p>}
                {inv.payment.upiId.trim() !== '' && upiProblem(inv.payment.upiId) && <p className="text-xs font-medium text-[#B42318]">{upiProblem(inv.payment.upiId)}</p>}
                <label className={`flex min-h-11 items-center gap-2 text-sm md:min-h-9 ${PAPER_MUTED}`}>
                  <input
                    type="checkbox"
                    checked={inv.payment.showUpiQr}
                    onChange={(e) => setPayment({ showUpiQr: e.target.checked })}
                    className="h-4 w-4 accent-[#FE6336]"
                  />
                  Show a “Scan to pay” UPI QR on the PDF
                </label>
                {inv.payment.showUpiQr && inv.currency !== 'INR' && <p className={`text-xs ${PAPER_MUTED}`}>UPI QR codes are for rupee invoices only.</p>}
              </fieldset>
            )}
          </div>
        </section>
        </div>

        {!can('invoice_watermark_remove') && (
          <p className="mt-10 text-center text-xs text-[#5B6478]">Made with KaamSolv · kaamsolv.com</p>
        )}
      </article>

      {(canCustomers || canItems) && <SavedDatalists customers={saved.customers} items={saved.items} />}

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

/** An optional GSTIN on the paper: upper-cased as you type, checked once it's 15 characters. */
function GstinField({ label, value, onChange }: { label: string; value: string; onChange: (gstin: string) => void }) {
  const problem = value.trim().length >= 15 ? gstinProblem(value) : null;
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <>
      <PaperInput
        label={label}
        placeholder="GSTIN (optional)"
        value={value}
        maxLength={15}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        onChange={(e) => onChange(normalizeGstin(e.target.value))}
      />
      {problem && (
        <p id={`${id}-problem`} className="text-xs font-medium text-[#B42318]">
          {problem}
        </p>
      )}
    </>
  );
}
