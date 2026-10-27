/**
 * A plain invoice PDF made on the server, for the shared invoice page and the sales-invoice email link
 * (billing M2). The invoice generator's own browser PDF (@react-pdf/renderer) is untouched and is still what
 * users download inside the app; this is the small one that can run in the Cloudflare Worker.
 *
 * Deliberately simple: A4, built-in Helvetica, ASCII only (app/lib/pdf/mini-pdf.ts), so amounts print as
 * "Rs. 1,490.00" and any character the font can't draw prints as "?". Pure; takes the stored invoice document.
 */

import { MiniPdf, ascii, textWidth, type Rgb } from '../pdf/mini-pdf';
import { displayDate } from './defaults';
import { isBillOfSupply, isTaxInvoice, placeOfSupplyLabel } from './gst-tax';
import { formatMoney } from './money';
import { computeTotals } from './totals';
import type { Invoice } from './types';

const W = 595.28;
const H = 841.89;
const M = 48;
const INK: Rgb = [0.047, 0.133, 0.282];
const MUTED: Rgb = [0.36, 0.4, 0.47];
const GREEN: Rgb = [0.15, 0.55, 0.5];

export type PdfMeta = { status: 'paid' | 'unpaid' | 'partly-paid'; amountPaid: number };

/** "Rs. 1,490.00": the built-in font can't draw the rupee sign. */
const money = (n: number, inv: Invoice) => ascii(formatMoney(n, inv.currency));

export function invoicePdf(inv: Invoice, meta: PdfMeta): Uint8Array {
  const pdf = new MiniPdf(`Invoice ${inv.number}`);
  let y = H - M;

  const text = (s: string, x: number, size = 10, bold = false, fill: Rgb = INK) => pdf.text(x, y, s, size, bold, fill);
  const right = (s: string, xRight: number, size = 10, bold = false, fill: Rgb = INK) => {
    const t = ascii(s);
    pdf.text(xRight - textWidth(t, size, bold), y, t, size, bold, fill);
  };
  const wrap = (s: string, width: number, size: number, bold = false): string[] => {
    const lines: string[] = [];
    for (const para of ascii(s).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (textWidth(next, size, bold) <= width) line = next;
        else {
          if (line) lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const rule = () => pdf.line(M, y, W - M, y);
  const room = (needed: number) => {
    if (y - needed < M) {
      pdf.addPage();
      y = H - M;
    }
  };

  const totals = computeTotals(inv);
  const taxInvoice = isTaxInvoice(inv);
  const title = isBillOfSupply(inv) ? 'BILL OF SUPPLY' : taxInvoice ? 'TAX INVOICE' : 'INVOICE';

  text(title, M, 20, true);
  right(`No. ${inv.number}`, W - M, 11, true);
  y -= 16;
  right(`Date: ${displayDate(inv.issueDate)}`, W - M, 9, false, MUTED);
  y -= 24;

  // Seller and buyer side by side.
  const colW = (W - 2 * M - 24) / 2;
  const party = (label: string, p: Invoice['client'], x: number): number => {
    let yy = y;
    pdf.text(x, yy, label, 8, true, MUTED);
    yy -= 13;
    pdf.text(x, yy, p.name, 11, true, INK);
    yy -= 14;
    for (const l of [...wrap(p.address, colW, 9), p.gstin ? `GSTIN: ${p.gstin}` : '', p.email, p.phone ?? ''].filter(Boolean)) {
      pdf.text(x, yy, l, 9, false, INK);
      yy -= 12;
    }
    return yy;
  };
  const a = party('FROM', inv.seller, M);
  const b = party('BILL TO', inv.client, M + colW + 24);
  y = Math.min(a, b) - 10;
  if (taxInvoice && totals.gst) {
    text(`Place of supply: ${placeOfSupplyLabel(totals.gst.placeOfSupply)}`, M, 9, false, MUTED);
    y -= 16;
  }
  rule();
  y -= 18;

  // Items.
  const xAmount = W - M;
  const xRate = W - M - 125;
  const xQty = W - M - 205;
  text('DESCRIPTION', M, 8, true, MUTED);
  right('QTY', xQty + 30, 8, true, MUTED);
  right('RATE', xRate + 30, 8, true, MUTED);
  right('AMOUNT', xAmount, 8, true, MUTED);
  y -= 8;
  rule();
  y -= 14;
  inv.items.forEach((it, i) => {
    const desc = wrap(`${it.description}${it.hsn ? `  (HSN/SAC ${it.hsn})` : ''}`, xQty - M - 40, 10);
    room(desc.length * 13 + 8);
    const top = y;
    desc.forEach((l, k) => pdf.text(M, top - k * 13, l, 10, false, INK));
    const rate = Number(it.rate.replace(/,/g, '')) || 0;
    const cell = (s: string, xr: number) => pdf.text(xr - textWidth(ascii(s), 10), top, s, 10, false, INK);
    cell(it.qty, xQty + 30);
    cell(money(rate, inv), xRate + 30);
    cell(money(totals.lines[i]?.amount ?? 0, inv), xAmount);
    y -= desc.length * 13 + 6;
  });
  rule();
  y -= 16;

  // Totals.
  const row = (label: string, value: string, strong = false) => {
    room(18);
    text(label, W - M - 230, strong ? 11 : 10, strong, strong ? INK : MUTED);
    right(value, xAmount, strong ? 11 : 10, strong);
    y -= strong ? 18 : 15;
  };
  row('Subtotal', money(totals.subtotal, inv));
  if (totals.discount > 0) row('Discount', `- ${money(totals.discount, inv)}`);
  if (totals.gst) {
    for (const r of totals.gst.rows) {
      if (r.cgst || r.sgst) {
        row(`CGST ${r.rate / 2}%`, money(r.cgst, inv));
        row(`${totals.gst.split === 'ut' ? 'UTGST' : 'SGST'} ${r.rate / 2}%`, money(r.sgst, inv));
      }
      if (r.igst) row(`IGST ${r.rate}%`, money(r.igst, inv));
    }
  } else if (totals.tax > 0) {
    row(`${inv.taxLabel || 'Tax'} ${inv.taxRate}%`, money(totals.tax, inv));
  }
  row('Total', money(totals.total, inv), true);
  if (meta.amountPaid > 0) {
    row('Received', money(meta.amountPaid, inv));
    if (meta.status !== 'paid') row('Balance due', money(Math.max(0, totals.total - meta.amountPaid), inv), true);
  }
  y -= 4;
  if (meta.status === 'paid') {
    text('PAID', M, 14, true, GREEN);
    y -= 18;
  }

  if (inv.notes.trim()) {
    room(40);
    text('NOTES', M, 8, true, MUTED);
    y -= 12;
    for (const l of wrap(inv.notes, W - 2 * M, 9)) {
      room(14);
      text(l, M, 9);
      y -= 12;
    }
  }
  return pdf.save();
}
