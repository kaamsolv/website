/**
 * Invoices from a CSV (Pro, Stage 2C-2): turn parsed CSV rows into invoices,
 * ready to preview and save. Framework-free; runs in the browser, and the
 * server re-checks every invoice with `cleanInvoice` before saving.
 *
 * Seller details, tax type, currency, payment details and design come from
 * Settings; the CSV carries only what changes from one invoice to the next.
 */

import { isListedGstRate } from './gst.ts';
import { gstinProblem, hsnProblem, isStateCode, normalizeGstin } from './india.ts';
import { isIsoDate } from './recurring.ts';
import type { Settings } from './settings.ts';
import { computeTotals, parseNumber } from './totals.ts';
import { hasPaymentDetails, type Invoice, type LineItem, type PaymentDetails } from './types.ts';
import { addDays } from './defaults.ts';
import { cleanInvoice, MAX_ITEMS_ANY_PLAN } from './validate.ts';
import { csvCell } from './csv.ts';

export const BATCH_MAX = 50;

export const TEMPLATE_COLUMNS = [
  'group', 'client_name', 'client_email', 'client_gstin', 'client_address', 'state_code',
  'description', 'qty', 'rate', 'gst_rate', 'hsn', 'unit', 'issue_date', 'due_date', 'notes',
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];

/** The sample file people download: a header and two invoices (the first with two lines). */
export function templateCsv(): string {
  const rows: string[][] = [
    [...TEMPLATE_COLUMNS],
    ['A1', 'Acme Traders Pvt Ltd', 'accounts@acme.example', '29AAGCB7383J1Z4', '4th Floor, Brigade Road, Bengaluru 560025', '29', 'Website redesign', '1', '40000', '18', '998314', 'pcs', '', '', 'Thank you!'],
    ['A1', '', '', '', '', '', 'Hosting (1 year)', '1', '6000', '18', '998315', 'yr', '', '', ''],
    ['B2', 'Pat Sharma', 'pat@example.com', '', 'Pune', '27', 'Logo design', '1', '15000', '18', '998391', '', '', '', ''],
  ];
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export type BatchProfile = Pick<
  Settings,
  | 'name' | 'address' | 'email' | 'phone' | 'stateCode' | 'gstin' | 'bankAccountName' | 'bankAccountNumber' | 'bankIfsc' | 'bankName'
  | 'upiId' | 'showUpiQr' | 'defaultCurrency' | 'defaultTaxLabel' | 'defaultTaxRate' | 'defaultDueDays' | 'defaultNotes' | 'composition'
  | 'defaultTemplate' | 'defaultBrandColor'
>;

export type BatchPreview = {
  /** The group name from the file, or "row 7" for a row on its own. */
  label: string;
  /** The CSV line (1 = header) the invoice starts on. */
  line: number;
  invoice: Invoice;
  total: number;
  /** Anything here stops this invoice (and only this one) from being created. */
  errors: string[];
  /** Worth a look, but doesn't stop it. */
  warnings: string[];
};

export type BatchParse = { previews: BatchPreview[]; fileError: string | null };

/** DD/MM/YYYY, DD-MM-YYYY (Indian Excel) or YYYY-MM-DD → YYYY-MM-DD, or null. */
export function readDate(v: string): string | null {
  const t = v.trim();
  if (isIsoDate(t)) return t;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

const key = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

export function buildBatch(rows: string[][], profile: BatchProfile, today: string): BatchParse {
  if (rows.length === 0) return { previews: [], fileError: 'That file is empty.' };
  const header = rows[0].map(key);
  const col = {} as Record<Column, number>;
  for (const c of TEMPLATE_COLUMNS) col[c] = header.indexOf(c);
  const missing = (['client_name', 'description', 'rate'] as const).filter((c) => col[c] < 0);
  if (missing.length) {
    return { previews: [], fileError: `The file needs these columns: ${missing.join(', ')}. Download the template to see them all.` };
  }
  const data = rows.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (data.length === 0) return { previews: [], fileError: 'There are no invoices in that file yet — only the header row.' };

  const get = (cells: string[], c: Column) => (col[c] >= 0 ? (cells[col[c]] ?? '').trim() : '');

  // Group rows: the same non-blank group = one invoice; a blank group = its own.
  const groups: { label: string; rows: typeof data }[] = [];
  const byName = new Map<string, (typeof groups)[number]>();
  for (const r of data) {
    const g = get(r.cells, 'group');
    if (g && byName.has(g.toLowerCase())) byName.get(g.toLowerCase())!.rows.push(r);
    else {
      const entry = { label: g || `row ${r.line}`, rows: [r] };
      groups.push(entry);
      if (g) byName.set(g.toLowerCase(), entry);
    }
  }

  const payment: PaymentDetails = {
    accountName: profile.bankAccountName,
    accountNumber: profile.bankAccountNumber,
    ifsc: profile.bankIfsc,
    bankName: profile.bankName,
    upiId: profile.upiId,
    showUpiQr: profile.showUpiQr,
  };

  const previews = groups.map((g): BatchPreview => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const first = g.rows[0];
    const at = (line: number, msg: string) => `Line ${line}: ${msg}`;

    const clientName = get(first.cells, 'client_name');
    if (!clientName) errors.push(at(first.line, 'client_name is empty.'));
    for (const r of g.rows.slice(1)) {
      const other = get(r.cells, 'client_name');
      if (other && other.toLowerCase() !== clientName.toLowerCase()) {
        errors.push(at(r.line, `rows in group "${g.label}" must be the same client (${clientName} vs ${other}).`));
      }
    }

    const gstin = normalizeGstin(get(first.cells, 'client_gstin'));
    if (gstin) {
      const problem = gstinProblem(gstin);
      if (problem) errors.push(at(first.line, `client_gstin: ${problem}`));
    }
    const state = get(first.cells, 'state_code');
    if (state && !isStateCode(state)) errors.push(at(first.line, `state_code "${state}" isn't a GST state code (like 27).`));

    const issueRaw = get(first.cells, 'issue_date');
    const issueDate = issueRaw ? readDate(issueRaw) : today;
    if (!issueDate) errors.push(at(first.line, `issue_date "${issueRaw}" — use 2026-11-01 or 01/11/2026.`));
    const dueRaw = get(first.cells, 'due_date');
    const dueDate = dueRaw ? readDate(dueRaw) : addDays(issueDate ?? today, profile.defaultDueDays);
    if (!dueDate) errors.push(at(first.line, `due_date "${dueRaw}" — use 2026-11-15 or 15/11/2026.`));

    const items: LineItem[] = [];
    g.rows.forEach((r, i) => {
      const description = get(r.cells, 'description');
      const rate = get(r.cells, 'rate');
      const qty = get(r.cells, 'qty') || '1';
      if (!description && !rate) return;
      if (!description) errors.push(at(r.line, 'description is empty.'));
      const rateN = parseNumber(rate);
      if (!rate || !Number.isFinite(rateN) || rateN < 0) errors.push(at(r.line, `rate "${rate}" isn't a number.`));
      const qtyN = parseNumber(qty);
      if (!Number.isFinite(qtyN) || qtyN <= 0) errors.push(at(r.line, `qty "${qty}" must be more than 0.`));
      const gstRate = get(r.cells, 'gst_rate').replace(/%$/, '');
      if (gstRate && !isListedGstRate(gstRate)) errors.push(at(r.line, `gst_rate "${gstRate}" should be 0, 0.25, 3, 5, 18 or 40.`));
      const hsn = get(r.cells, 'hsn');
      if (hsn && hsnProblem(hsn)) errors.push(at(r.line, `hsn "${hsn}" — HSN/SAC codes are 4, 6 or 8 digits.`));
      const unit = get(r.cells, 'unit');
      items.push({
        id: `item-${i + 1}`,
        description,
        qty,
        rate,
        ...(hsn ? { hsn } : {}),
        ...(unit ? { unit } : {}),
        ...(gstRate ? { gstRate } : {}),
      });
    });
    if (items.length === 0) errors.push(at(first.line, 'no line items.'));
    if (items.length > MAX_ITEMS_ANY_PLAN) errors.push(`More than ${MAX_ITEMS_ANY_PLAN} lines in one invoice.`);

    const notes = get(first.cells, 'notes') || profile.defaultNotes;
    const invoice: Invoice = {
      number: '',
      issueDate: issueDate ?? today,
      dueDate: dueDate ?? today,
      currency: profile.defaultCurrency,
      seller: {
        name: profile.name,
        address: profile.address,
        email: profile.email,
        phone: profile.phone,
        ...(profile.stateCode ? { state: profile.stateCode } : {}),
        ...(profile.gstin ? { gstin: profile.gstin } : {}),
      },
      client: {
        name: clientName,
        address: get(first.cells, 'client_address'),
        email: get(first.cells, 'client_email'),
        ...(state && isStateCode(state) ? { state } : {}),
        ...(gstin && !gstinProblem(gstin) ? { gstin } : {}),
      },
      items,
      discountType: 'percent',
      discountValue: '',
      taxLabel: profile.composition ? '' : profile.defaultTaxLabel,
      taxRate: profile.composition ? '' : profile.defaultTaxRate,
      notes,
      logo: null,
      ...(profile.composition ? { docType: 'bill_of_supply' as const } : {}),
      ...(hasPaymentDetails(payment) ? { payment } : {}),
      design: { template: profile.defaultTemplate, color: profile.defaultBrandColor },
    };

    if (!profile.name.trim()) warnings.push('Your business name is empty — fill in your Business profile first.');
    if (profile.defaultTaxLabel === 'GST' && !profile.composition && !profile.defaultTaxRate && !items.every((it) => it.gstRate)) {
      warnings.push('Some lines have no gst_rate and your Settings have no default rate, so they’ll have no tax.');
    }
    if (errors.length === 0) {
      const checked = cleanInvoice({ ...invoice, number: 'X' }, { maxItems: MAX_ITEMS_ANY_PLAN, allowDesign: true });
      if (!checked.ok) errors.push(checked.message);
    }

    const totals = computeTotals(invoice);
    return { label: g.label, line: first.line, invoice, total: Number.isFinite(totals.total) ? totals.total : 0, errors, warnings };
  });

  if (previews.length > BATCH_MAX) {
    return { previews, fileError: `That’s ${previews.length} invoices — up to ${BATCH_MAX} at a time. Split the file and run it again.` };
  }
  return { previews, fileError: null };
}
