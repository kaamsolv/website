import type { ReceiptSet } from '@/app/lib/rent-receipt/build';

/**
 * Builds the rent-receipt PDF in the browser. @react-pdf/renderer (~440 KB gzip) and the template load
 * only here, on the first Download, so the page stays light. Nothing is uploaded.
 */
export async function renderRentReceiptsPdf(set: ReceiptSet): Promise<Blob> {
  const [rp, template] = await Promise.all([import('@react-pdf/renderer'), import('./rent-receipt-pdf')]);
  template.registerFonts(rp, `${window.location.origin}/fonts/`);
  return rp.pdf(template.rentReceiptDocument(rp, set)).toBlob();
}
