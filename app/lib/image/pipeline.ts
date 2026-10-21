/**
 * Image Kit conversion pipeline — runs in Web Worker or main-thread fallback.
 */
import { decodeFormat } from './codecs/decode';
import { encodeFormat } from './codecs/encode';
import { canConvert } from './registry/capabilities';
import { extensionForFormatId } from './registry/capabilities';
import type { FormatId } from './registry/format-registry';
import { mapThrownError, userMessageForCode, type ImageErrorCode } from './errors';
import { applyTransforms } from './transform';
import type { ConvertOptions, ConvertProgress } from './types';

export type PipelineProgress = (progress: ConvertProgress) => void;

export type PipelineResult =
  | {
      ok: true;
      blob: Blob;
      outputMime: string;
      outputExtension: string;
      width: number;
      height: number;
    }
  | { ok: false; code: ImageErrorCode; message: string };

export async function decodeToBitmap(
  buffer: ArrayBuffer,
  format: FormatId,
  onProgress?: PipelineProgress,
): Promise<ImageBitmap> {
  onProgress?.({ stage: 'decoding' });
  return decodeFormat(buffer, format);
}

export async function runConversionPipeline(
  buffer: ArrayBuffer,
  from: FormatId,
  to: FormatId,
  options: ConvertOptions,
  onProgress?: PipelineProgress,
): Promise<PipelineResult> {
  if (!canConvert(from, to)) {
    return {
      ok: false,
      code: 'unsupported-format',
      message: userMessageForCode('unsupported-format'),
    };
  }

  onProgress?.({ stage: 'preparing' });
  onProgress?.({ stage: 'reading', percent: 100 });

  let decoded: ImageBitmap | null = null;
  let transformed: ImageBitmap | null = null;

  try {
    decoded = await decodeToBitmap(buffer, from, onProgress);

    const transformResult = await applyTransforms(decoded, options, onProgress);
    if (!transformResult.ok) {
      return {
        ok: false,
        code: transformResult.code,
        message: transformResult.message,
      };
    }

    const toEncode = transformResult.bitmap;
    if (toEncode !== decoded) {
      transformed = toEncode;
    }

    onProgress?.({ stage: 'encoding', percent: 10 });
    const blob = await encodeFormat(toEncode, to, options);
    onProgress?.({ stage: 'encoding', percent: 100 });
    onProgress?.({ stage: 'finalizing', percent: 100 });

    return {
      ok: true,
      blob,
      outputMime: blob.type,
      outputExtension: extensionForFormatId(to),
      width: transformResult.width,
      height: transformResult.height,
    };
  } catch (err) {
    if (err instanceof Error && 'code' in err && typeof err.code === 'string') {
      return {
        ok: false,
        code: err.code as ImageErrorCode,
        message: userMessageForCode(err.code as ImageErrorCode),
      };
    }
    const mapped = mapThrownError(err);
    return { ok: false, code: mapped.code, message: mapped.message };
  } finally {
    transformed?.close();
    decoded?.close();
  }
}

export function supportsWebpEncodeInContext(): boolean {
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return false;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return true;
}
