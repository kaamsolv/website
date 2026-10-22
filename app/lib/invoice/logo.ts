/**
 * Logos for invoices: read in the browser and downscaled to LOGO_MAX_PX on a
 * canvas (PNG keeps transparency). Shared by the editor and Settings. Browser only.
 */

import { LOGO_MAX_BYTES, LOGO_MAX_PX, LOGO_TYPES } from './limits';

/** Downscale a logo in the browser; PNG keeps transparency. Only sent anywhere if a signed-in user saves it. */
export async function readLogo(file: File): Promise<string> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) throw new Error('Use a PNG, JPG or WebP logo.');
  if (file.size > LOGO_MAX_BYTES) throw new Error('That logo is over 2 MB — try a smaller file.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
}
