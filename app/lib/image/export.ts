import { trackFileDownload } from '../analytics';

/**
 * Client-side download helper for converted images.
 * Intentionally separate from QR export — no cross-product coupling.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  trackFileDownload(filename);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
