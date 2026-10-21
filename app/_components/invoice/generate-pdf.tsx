import type { Invoice } from '@/app/lib/invoice/types';
import type { Totals } from '@/app/lib/invoice/totals';

/**
 * Builds the invoice PDF in the browser. @react-pdf/renderer (~440 KB gzip)
 * and the template load only here — on the first Download / Preview — so the
 * page itself stays light. Nothing is uploaded.
 */
export async function renderInvoicePdf(invoice: Invoice, totals: Totals, opts: { watermark: boolean }): Promise<Blob> {
  const [{ pdf }, { InvoiceDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./invoice-pdf')]);
  return pdf(<InvoiceDocument invoice={invoice} totals={totals} watermark={opts.watermark} />).toBlob();
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
