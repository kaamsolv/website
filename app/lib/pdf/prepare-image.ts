/**
 * JPG → PDF: turn a dropped image into something pdf-lib can embed.
 *
 * - JPG goes in untouched (no quality loss) — unless the camera stored it
 *   sideways (EXIF orientation), then it's redrawn upright first.
 * - PNG goes in untouched (transparency kept).
 * - WebP and HEIC are redrawn as high-quality JPG (HEIC through the image
 *   kit's decoder, which runs on the main thread).
 */

import { detectImageFile } from '../image/validate';
import { PdfToolError } from './errors';
import { jpegOrientation } from './image-layout';
import type { PreparedImage } from './pages';

export const IMAGE_INPUT_LABELS = ['JPG', 'PNG', 'WebP', 'HEIC'];
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

const REDRAW_QUALITY = 0.92;

async function redrawAsJpeg(blob: Blob): Promise<Uint8Array> {
  // Default orientation handling applies EXIF rotation — what we want here.
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.fillStyle = '#ffffff'; // see-through areas become white, like printed paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', REDRAW_QUALITY));
    canvas.width = canvas.height = 0;
    if (!out) throw new Error('Canvas could not make a JPEG');
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export async function prepareImageForPdf(file: File): Promise<PreparedImage> {
  const detected = await detectImageFile(file);
  if (!detected.ok) throw new PdfToolError(detected.code === 'corrupted' ? 'image-failed' : 'unsupported-image');
  const format = detected.detected.format;

  try {
    if (format === 'jpeg') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return jpegOrientation(bytes) === 1 ? { type: 'jpeg', bytes } : { type: 'jpeg', bytes: await redrawAsJpeg(file) };
    }
    if (format === 'png') return { type: 'png', bytes: new Uint8Array(await file.arrayBuffer()) };
    if (format === 'webp') return { type: 'jpeg', bytes: await redrawAsJpeg(file) };
    if (format === 'heic') {
      const { decodeHeicBlob } = await import('../image/codecs/decode');
      return { type: 'jpeg', bytes: new Uint8Array(await (await decodeHeicBlob(file)).arrayBuffer()) };
    }
  } catch {
    throw new PdfToolError('image-failed');
  }
  throw new PdfToolError('unsupported-image');
}
