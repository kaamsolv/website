/**
 * CSV for the Invoice Generator (Pro, Stage 2C-2): a small RFC-4180 reader and
 * writer (no dependency), and the two exports — one row per invoice, or one row
 * per line item (the accountant's HSN view). Framework-free.
 *
 * Totals always come from `computeTotals`, so a CSV matches the PDF.
 */

import { computeTotals } from './totals.ts';
import type { Invoice } from './types.ts';

// ─── Reading ────────────────────────────────────────────────────────────────

/** Parse CSV text into rows of cells. Handles quotes, "" escapes, commas and newlines inside quotes, CRLF and a leading BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Blank lines (a lone empty cell) are not rows.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// ─── Writing ────────────────────────────────────────────────────────────────

/**
 * One CSV cell. A cell that starts with = + - @ (or a tab/CR) would be run as
 * a formula by Excel and Sheets, so it gets a leading apostrophe. Real numbers
 * (`number` type) are written as-is, so a negative amount stays a number.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text, UTF-8 BOM first so Excel reads ₹ and names correctly. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ─── The two exports ────────────────────────────────────────────────────────

type Row = { invoice: Invoice; status: 'unpaid' | 'paid'; paidAt: Date | null };

const money = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

export const INVOICE_COLUMNS = [
  'Number', 'Type', 'Issue date', 'Due / valid until', 'Status', 'Paid on', 'Client', 'Client GSTIN', 'Place of supply',
  'Currency', 'Subtotal', 'Discount', 'Taxable value', 'CGST', 'SGST / UTGST', 'IGST', 'Total',
];

/** One row per invoice or quotation. GST columns are filled only for GST tax invoices (and quote estimates). */
export function invoicesCsv(rows: Row[]): string {
  return toCsv([
    INVOICE_COLUMNS,
    ...rows.map(({ invoice: inv, status, paidAt }) => {
      const t = computeTotals(inv);
      const quote = inv.kind === 'quote';
      return [
        inv.number,
        quote ? 'Quotation' : 'Invoice',
        inv.issueDate,
        inv.dueDate,
        quote ? '' : status === 'paid' ? 'Paid' : 'Unpaid',
        quote ? '' : day(paidAt),
        inv.client.name,
        inv.client.gstin ?? '',
        t.gst?.placeOfSupply ?? '',
        inv.currency,
        money(t.subtotal),
        money(t.discount),
        money(t.taxable),
        t.gst ? money(t.gst.cgst) : '',
        t.gst ? money(t.gst.sgst) : '',
        t.gst ? money(t.gst.igst) : '',
        money(t.total),
      ];
    }),
  ]);
}

export const LINE_COLUMNS = [
  'Number', 'Type', 'Issue date', 'Client', 'Client GSTIN', 'HSN / SAC', 'Description', 'Unit', 'Qty', 'Rate',
  'GST %', 'Taxable value', 'Tax', 'Currency',
];

/**
 * One row per line item. Each line's value is its amount after the invoice
 * discount (the same spread the GST maths uses); tax is that line's share.
 */
export function linesCsv(rows: Row[]): string {
  const out: (string | number | null)[][] = [LINE_COLUMNS];
  for (const { invoice: inv } of rows) {
    const t = computeTotals(inv);
    const quote = inv.kind === 'quote';
    const subtotal = t.subtotal;
    inv.items.forEach((it, i) => {
      const line = t.lines[i];
      if (!line || (!it.description.trim() && !line.amount)) return;
      // The line's share of the discount, so lines add up to the invoice's taxable value.
      const taxable = subtotal > 0 ? money(line.amount - (t.discount * line.amount) / subtotal) : money(line.amount);
      const rate = (it.gstRate?.trim() ? it.gstRate : inv.taxRate).trim();
      const pct = parseFloat(rate);
      out.push([
        inv.number,
        quote ? 'Quotation' : 'Invoice',
        inv.issueDate,
        inv.client.name,
        inv.client.gstin ?? '',
        it.hsn ?? '',
        it.description,
        it.unit ?? '',
        it.qty,
        it.rate,
        t.gst && Number.isFinite(pct) ? pct : '',
        taxable,
        t.gst && Number.isFinite(pct) ? money((taxable * pct) / 100) : '',
        inv.currency,
      ]);
    });
  }
  return toCsv(out);
}
