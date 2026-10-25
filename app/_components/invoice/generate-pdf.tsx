import type { Invoice } from '@/app/lib/invoice/types';
import type { Totals } from '@/app/lib/invoice/totals';
import type { Design } from '@/app/lib/invoice/design';

/**
 * Builds the invoice PDF in the browser. @react-pdf/renderer (~440 KB gzip)
 * and the template load only here — on the first Download / Preview — so the
 * page itself stays light. Nothing is uploaded.
 */
export async function renderInvoicePdf(
  invoice: Invoice,
  totals: Totals,
  opts: { watermark: boolean; design?: Design | null },
): Promise<Blob> {
  const [{ pdf }, { InvoiceDocument }, upiQr] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./invoice-pdf'),
    upiQrDataUrl(invoice, totals.total),
  ]);
  return pdf(<InvoiceDocument invoice={invoice} totals={totals} watermark={opts.watermark} upiQr={upiQr} design={opts.design} />).toBlob();
}

/**
 * "Scan to pay" QR: a standard upi://pay link (the QR tool's own builder) with
 * the payee, the total and the invoice number. INR only — UPI is rupees.
 * Never on a quotation: there's nothing to pay yet.
 * Null when not asked for or not valid, so a bad UPI ID never breaks the PDF.
 */
export async function upiQrDataUrl(invoice: Invoice, total: number): Promise<string | null> {
  const p = invoice.payment;
  if (invoice.kind === 'quote') return null;
  if (!p?.showUpiQr || !p.upiId.trim() || invoice.currency !== 'INR' || !(total > 0)) return null;
  const [{ encodeUpiPayload }, QRCode] = await Promise.all([import('@/app/lib/qr/payloads/upi'), import('qrcode')]);
  const payload = encodeUpiPayload(p.upiId, invoice.seller.name || p.accountName, total.toFixed(2), `Invoice ${invoice.number}`.slice(0, 50));
  if (!payload.ok) return null;
  return QRCode.toDataURL(payload.text, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
}

export function pdfFilename(invoice: Invoice): string {
  const safe = invoice.number.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'invoice'}.pdf`;
}

/** Page count of a generated PDF (react-pdf writes one `/Type /Page` per page). */
export async function countPdfPages(blob: Blob): Promise<number> {
  const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}
