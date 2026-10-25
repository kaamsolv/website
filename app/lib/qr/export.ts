import { trackFileDownload, trackToolSuccess } from '../analytics';
import type { QrDesign, QrExportOptions } from './design';
import { createMatrixForDesign } from './matrix';
import { renderArtboardCanvas, renderArtboardSvg } from './compositor';

export const DOWNLOAD_PNG = 'kaamsolv-qr-code.png';
export const DOWNLOAD_SVG = 'kaamsolv-qr-code.svg';
export const DOWNLOAD_JPG = 'kaamsolv-qr-code.jpg';

export function downloadBlob(filename: string, blob: Blob): void {
  trackFileDownload(filename);
  trackToolSuccess('generator', true);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create PNG'));
    }, 'image/png');
  });
}

export async function canvasToJpgBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create JPG'));
      },
      'image/jpeg',
      quality,
    );
  });
}

/** Flatten transparency to white for JPG export. */
export async function flattenCanvasForJpg(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export async function renderArtboardPngCanvas(
  encodedText: string,
  design: QrDesign,
  exportOptions: QrExportOptions,
): Promise<HTMLCanvasElement> {
  const matrix = createMatrixForDesign(encodedText, design);
  const canvas = document.createElement('canvas');
  await renderArtboardCanvas(canvas, matrix, design, exportOptions.pixelSize);
  return canvas;
}

export async function exportPngBlob(
  encodedText: string,
  design: QrDesign,
  exportOptions: QrExportOptions,
): Promise<Blob> {
  const canvas = await renderArtboardPngCanvas(encodedText, design, exportOptions);
  return canvasToPngBlob(canvas);
}

export async function exportJpgBlob(
  encodedText: string,
  design: QrDesign,
  exportOptions: QrExportOptions,
): Promise<Blob> {
  const canvas = await renderArtboardPngCanvas(encodedText, design, exportOptions);
  const flat = await flattenCanvasForJpg(canvas);
  return canvasToJpgBlob(flat);
}

export function exportSvgString(
  encodedText: string,
  design: QrDesign,
  exportOptions: QrExportOptions,
): string {
  const matrix = createMatrixForDesign(encodedText, design);
  return renderArtboardSvg(matrix, design, exportOptions.pixelSize);
}

export function openPrintView(svgMarkup: string, title = 'Print QR code'): void {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; text-align: center; }
    .wrap { display: inline-block; max-width: 100%; }
    @media print {
      body { padding: 0; }
      .hint { display: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">${svgMarkup}</div>
  <p class="hint" style="margin-top:16px;color:#666;font-size:14px;">Use your browser&apos;s print dialog. For best results, disable headers and footers.</p>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
  w.document.close();
}
