/**
 * pdf.js, loaded on first use: page counts, thumbnails, PDF → JPG.
 *
 * The legacy build is used for older phones (Android Chrome, iOS Safari 15+).
 * Its decoder files — WASM for JBIG2 / JPEG 2000 scans and colour profiles,
 * plus the 14 standard fonts — are served from /vendor/pdfjs/ (copied from
 * node_modules by scripts/sync-pdfjs-assets.mts; a test checks they match).
 * No scripting: we only ever draw pages (pdf.js 6 has no eval-based font path).
 */

import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { toPdfToolError } from './errors';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

const ASSETS = '/vendor/pdfjs/';
let lib: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./worker/pdfjs.worker.ts', import.meta.url));
    return pdfjs;
  });
  return lib;
}

export type { PDFDocumentProxy };

/** Opens a PDF for drawing. pdf.js takes ownership of what it's given, so it gets a copy. */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  try {
    return await pdfjs.getDocument({
      data: bytes.slice(),
      enableXfa: false,
      wasmUrl: `${ASSETS}wasm/`,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      iccUrl: `${ASSETS}iccs/`,
    }).promise;
  } catch (err) {
    throw toPdfToolError(err);
  }
}

/** iOS Safari refuses canvases over ~16.7 megapixels; stay under. */
const MAX_CANVAS_PIXELS = 16_000_000;

export type RenderedPage = { blob: Blob; width: number; height: number };

/**
 * Draws one page (1-based) on white and returns a JPEG. `scale` 1 = 72 DPI;
 * it's reduced automatically for pages that would exceed the canvas limit.
 */
export async function renderPageJpeg(doc: PDFDocumentProxy, pageNumber: number, scale: number, quality = 0.85): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  try {
    let viewport = page.getViewport({ scale });
    const pixels = viewport.width * viewport.height;
    if (pixels > MAX_CANVAS_PIXELS) viewport = page.getViewport({ scale: scale * Math.sqrt(MAX_CANVAS_PIXELS / pixels) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    const out = { blob: blob!, width: canvas.width, height: canvas.height };
    canvas.width = canvas.height = 0; // free the pixels now, not at GC
    if (!blob) throw new Error('Canvas could not make a JPEG');
    return out;
  } catch (err) {
    throw toPdfToolError(err);
  } finally {
    page.cleanup();
  }
}

/** A small preview: `cssWidth` wide on screen, sharp on high-density displays. */
export async function renderThumbnail(doc: PDFDocumentProxy, pageNumber: number, cssWidth = 160): Promise<Blob> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 }).width || 612;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  return (await renderPageJpeg(doc, pageNumber, (cssWidth * dpr) / base, 0.8)).blob;
}

/** DPI → pdf.js scale. */
export function scaleForDpi(dpi: number): number {
  return dpi / 72;
}
