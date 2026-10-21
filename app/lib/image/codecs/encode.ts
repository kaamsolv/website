/**
 * Encoder dispatch — raster output via Canvas / OffscreenCanvas.
 */
import type { FormatId } from '../registry/format-registry';
import { getFormat } from '../registry/capabilities';
import { mimeForFormatId } from '../registry/capabilities';
import { resolveEncodeParams } from '../transform/optimize';
import type { ConvertOptions } from '../types';

export async function encodeFormat(
  bitmap: ImageBitmap,
  format: FormatId,
  options: ConvertOptions,
): Promise<Blob> {
  const cap = getFormat(format);
  if (!cap.canEncode) {
    throw Object.assign(new Error('encode not supported'), { code: 'encode-failed' });
  }

  type CanvasLike = OffscreenCanvas | HTMLCanvasElement;
  let canvas: CanvasLike;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  } else if (typeof document !== 'undefined') {
    const el = document.createElement('canvas');
    el.width = bitmap.width;
    el.height = bitmap.height;
    canvas = el;
  } else {
    throw Object.assign(new Error('Canvas unavailable'), { code: 'browser-limit' });
  }

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw Object.assign(new Error('Canvas unavailable'), { code: 'browser-limit' });

  if (format === 'jpeg') {
    ctx.fillStyle = options.jpegBackground;
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  }

  ctx.drawImage(bitmap, 0, 0);

  const mime = mimeForFormatId(format);
  const { quality } = resolveEncodeParams(format, options);

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mime, quality });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Object.assign(new Error('encode failed'), { code: 'encode-failed' }))),
      mime,
      quality,
    );
  });
}
