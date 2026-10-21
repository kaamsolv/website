/**
 * Composable image transform pipeline.
 *
 * Current steps: resize
 * Planned: crop, rotate, flip, metadata removal, social presets
 *
 * Flow: decode → applyTransforms → encode
 */
import type { ConvertOptions, ConvertProgress } from '../types';
import { resizeBitmap, resolveOutputDimensions } from './resize';

export { resolveOutputDimensions, resizeBitmap } from './resize';
export { resolveEncodeParams } from './optimize';

export type TransformResult =
  | { ok: true; bitmap: ImageBitmap; width: number; height: number }
  | { ok: false; code: 'invalid-dimensions'; message: string };

export async function applyTransforms(
  bitmap: ImageBitmap,
  options: ConvertOptions,
  onProgress?: (p: ConvertProgress) => void,
): Promise<TransformResult> {
  onProgress?.({ stage: 'processing' });

  const resolved = resolveOutputDimensions(bitmap.width, bitmap.height, options.resize);
  if (!resolved.ok) {
    return { ok: false, code: 'invalid-dimensions', message: resolved.message };
  }

  if (!resolved.changed) {
    return { ok: true, bitmap, width: resolved.width, height: resolved.height };
  }

  const resized = await resizeBitmap(bitmap, resolved.width, resolved.height);
  return { ok: true, bitmap: resized, width: resolved.width, height: resolved.height };
}
