/**
 * Decoder dispatch — lazy-loads specialist codecs only when needed.
 */
import type { FormatId } from '../registry/format-registry';
import { getFormat } from '../registry/capabilities';
import { userMessageForCode, type ImageErrorCode } from '../errors';
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from '../types';

async function decodeHeicBlob(blob: Blob): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
  const out = Array.isArray(result) ? result[0] : result;
  if (!(out instanceof Blob)) {
    throw Object.assign(new Error('HEIC decode failed'), { code: 'heic-decode-failed' });
  }
  return out;
}

function assertDimensions(bitmap: ImageBitmap): void {
  const pixels = bitmap.width * bitmap.height;
  if (
    bitmap.width > MAX_IMAGE_DIMENSION ||
    bitmap.height > MAX_IMAGE_DIMENSION ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    bitmap.close();
    throw Object.assign(new Error('dimensions too large'), { code: 'dimensions-too-large' });
  }
}

async function decodeWithBrowser(blob: Blob, format: FormatId): Promise<ImageBitmap> {
  try {
    const bitmap = await createImageBitmap(blob);
    assertDimensions(bitmap);
    return bitmap;
  } catch (err) {
    if (err instanceof Error && 'code' in err) throw err;
    const code: ImageErrorCode =
      format === 'avif' ? 'avif-decode-failed' : format === 'svg' ? 'corrupted' : 'corrupted';
    throw Object.assign(new Error(userMessageForCode(code)), { code });
  }
}

/**
 * Decode any supported format to a single-frame ImageBitmap.
 * Animated formats (GIF, APNG) decode the first frame only in Phase 1.
 */
export async function decodeFormat(buffer: ArrayBuffer, format: FormatId): Promise<ImageBitmap> {
  const cap = getFormat(format);
  if (!cap.canDecode) {
    throw Object.assign(new Error('unsupported format'), { code: 'unsupported-format' });
  }

  let blob = new Blob([buffer], { type: cap.mimeTypes[0] });

  switch (cap.decoder) {
    case 'wasm-heic':
      blob = await decodeHeicBlob(blob);
      return decodeWithBrowser(blob, format);
    case 'rasterize-svg':
      return decodeWithBrowser(blob, 'svg');
    case 'browser':
      return decodeWithBrowser(blob, format);
    default:
      throw Object.assign(new Error('unsupported format'), { code: 'unsupported-format' });
  }
}
