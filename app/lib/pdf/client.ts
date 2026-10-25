/**
 * Browser entry points for the PDF tools. Every library loads here, lazily, on
 * first use — never with the page — and the server build gets stubs instead
 * (`turbopack.resolveAlias` in next.config.mjs), so none of it reaches the
 * Cloudflare Worker.
 *
 * - Compress runs in its own Web Worker (falls back to the main thread).
 * - Merge / split / images → PDF are quick copies: main thread, lazy pdf-lib.
 * - Thumbnails and PDF → JPG use pdf.js (its own worker; see ./pdfjs.ts).
 */

import type { CompressResult } from './compress';
import { PdfToolError, toPdfToolError, type PdfErrorCode } from './errors';
import type { CompressResponse } from './worker/compress.worker';
import type { MarginMode, PageSizeMode } from './image-layout';
import type { PreparedImage } from './pages';

let worker: Worker | null = null;
let jobCounter = 0;

function getWorker(): Worker | null {
  // OffscreenCanvas is what the worker draws with; without it, stay on the main thread.
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker/compress.worker.ts', import.meta.url));
    return worker;
  } catch {
    return null;
  }
}

export function terminatePdfWorker(): void {
  worker?.terminate();
  worker = null;
}

async function compressOnMainThread(bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<CompressResult> {
  const [{ compressPdfBytes, STANDARD_COMPRESSION }, { canvasReencoder }] = await Promise.all([
    import('./compress'),
    import('./canvas-reencoder'),
  ]);
  try {
    return await compressPdfBytes(bytes, canvasReencoder, STANDARD_COMPRESSION, onProgress);
  } catch (err) {
    throw toPdfToolError(err);
  }
}

/** Standard compression. `bytes` is copied for the worker, so the caller keeps its copy. */
export function compressPdf(bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<CompressResult> {
  const w = getWorker();
  if (!w) return compressOnMainThread(bytes, onProgress);

  const id = `pdf-${++jobCounter}`;
  const copy = bytes.slice();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (event: MessageEvent<CompressResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.done, msg.total);
        return;
      }
      cleanup();
      if (msg.type === 'done') resolve({ bytes: msg.bytes, stats: msg.stats });
      else reject(new PdfToolError(msg.code as PdfErrorCode, msg.message));
    };
    // The worker itself failed (e.g. it couldn't load): do the job here instead.
    const onError = () => {
      cleanup();
      terminatePdfWorker();
      compressOnMainThread(bytes, onProgress).then(resolve, reject);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, bytes: copy }, [copy.buffer]);
  });
}

async function withPdfLib<T>(run: (pages: typeof import('./pages')) => Promise<T>): Promise<T> {
  try {
    return await run(await import('./pages'));
  } catch (err) {
    throw toPdfToolError(err);
  }
}

export function mergePdfs(inputs: Uint8Array[], onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  return withPdfLib((p) => p.mergePdfs(inputs, onProgress));
}

export function extractPages(input: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
  return withPdfLib((p) => p.extractPages(input, pageIndices));
}

export function imagesToPdf(images: PreparedImage[], size: PageSizeMode, margin: MarginMode): Promise<Uint8Array> {
  return withPdfLib((p) => p.imagesToPdf(images, size, margin));
}

/** A finished PDF as a Blob for download. */
export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
