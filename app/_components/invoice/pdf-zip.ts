import { computeTotals } from '@/app/lib/invoice/totals';
import type { Invoice } from '@/app/lib/invoice/types';
import { pdfFilename, renderInvoicePdf } from './generate-pdf';

export type ZipResult = { blob: Blob; made: number; skipped: string[] };

/**
 * Pro: several saved invoices → one ZIP of PDFs, made in the browser (nothing
 * is uploaded). Each invoice is fetched by id, so this works from the batch
 * page and from "Download selected as ZIP" in All invoices alike — which is
 * also the way back if the tab closed before the first ZIP. One at a time, so
 * memory stays small; `signal` cancels between invoices.
 */
export async function zipInvoices(
  ids: string[],
  opts: { watermark: boolean; design: boolean },
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ZipResult> {
  const { zipSync } = await import('fflate');
  const prof = await fetch('/api/business-profile', { credentials: 'same-origin' })
    .then((r) => r.json() as Promise<{ profile?: { logo: string | null; signature?: string | null } }>)
    .catch(() => ({ profile: undefined }));

  const files: Record<string, Uint8Array> = {};
  const skipped: string[] = [];
  const taken = new Set<string>();
  onProgress(0, ids.length);
  for (let i = 0; i < ids.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(ids[i])}`, { credentials: 'same-origin' });
      const body = (await res.json()) as { invoice?: Invoice };
      if (!res.ok || !body.invoice) throw new Error('missing');
      const doc: Invoice = { ...body.invoice, logo: prof.profile?.logo ?? null, signature: prof.profile?.signature ?? null };
      const blob = await renderInvoicePdf(doc, computeTotals(doc), { watermark: opts.watermark, design: opts.design ? (doc.design ?? null) : null });
      let name = pdfFilename(doc);
      for (let n = 2; taken.has(name); n++) name = pdfFilename(doc).replace(/\.pdf$/, `-${n}.pdf`);
      taken.add(name);
      files[name] = new Uint8Array(await blob.arrayBuffer());
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      skipped.push(ids[i]);
    }
    onProgress(i + 1, ids.length);
  }
  const made = Object.keys(files).length;
  const zipped = zipSync(files, { level: 0 }); // PDFs are already compressed
  return { blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), made, skipped };
}
