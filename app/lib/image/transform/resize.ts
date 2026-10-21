/**
 * Resize transforms — pure dimension math + bitmap resize.
 * Framework-free math is testable in Node; bitmap resize runs in worker/main thread.
 */
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, type ResizeOptions } from '../types';

export const MIN_SCALE_PERCENT = 1;
export const MAX_SCALE_PERCENT = 400;
export const MIN_DIMENSION_PX = 1;

export type ResolvedDimensions =
  | { ok: true; width: number; height: number; changed: boolean }
  | { ok: false; message: string };

function roundPx(value: number): number {
  return Math.max(MIN_DIMENSION_PX, Math.round(value));
}

function exceedsLimits(width: number, height: number): string | null {
  if (width < MIN_DIMENSION_PX || height < MIN_DIMENSION_PX) {
    return 'Width and height must be at least 1 pixel.';
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return `Dimensions can't exceed ${MAX_IMAGE_DIMENSION.toLocaleString()} px.`;
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    return 'That output size is too large. Try a smaller scale or dimensions.';
  }
  return null;
}

/** Compute target output dimensions from source size and resize options. */
export function resolveOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  resize: ResizeOptions,
): ResolvedDimensions {
  if (sourceWidth < 1 || sourceHeight < 1) {
    return { ok: false, message: "Couldn't read the image dimensions." };
  }

  if (resize.mode === 'original') {
    const limit = exceedsLimits(sourceWidth, sourceHeight);
    if (limit) return { ok: false, message: limit };
    return { ok: true, width: sourceWidth, height: sourceHeight, changed: false };
  }

  if (resize.mode === 'scale') {
    const percent = resize.scalePercent;
    if (!Number.isFinite(percent) || percent < MIN_SCALE_PERCENT || percent > MAX_SCALE_PERCENT) {
      return {
        ok: false,
        message: `Scale must be between ${MIN_SCALE_PERCENT}% and ${MAX_SCALE_PERCENT}%.`,
      };
    }
    const width = roundPx((sourceWidth * percent) / 100);
    const height = roundPx((sourceHeight * percent) / 100);
    const limit = exceedsLimits(width, height);
    if (limit) return { ok: false, message: limit };
    return {
      ok: true,
      width,
      height,
      changed: width !== sourceWidth || height !== sourceHeight,
    };
  }

  // mode === 'dimensions'
  let width = resize.width;
  let height = resize.height;

  if (width !== null && (!Number.isFinite(width) || width < MIN_DIMENSION_PX)) {
    return { ok: false, message: 'Enter a valid width in pixels.' };
  }
  if (height !== null && (!Number.isFinite(height) || height < MIN_DIMENSION_PX)) {
    return { ok: false, message: 'Enter a valid height in pixels.' };
  }

  if (width === null && height === null) {
    const limit = exceedsLimits(sourceWidth, sourceHeight);
    if (limit) return { ok: false, message: limit };
    return { ok: true, width: sourceWidth, height: sourceHeight, changed: false };
  }

  const aspect = sourceWidth / sourceHeight;

  if (resize.keepAspectRatio) {
    if (width !== null && height === null) {
      height = roundPx(width / aspect);
    } else if (height !== null && width === null) {
      width = roundPx(height * aspect);
    } else if (width !== null && height !== null) {
      height = roundPx(width / aspect);
    }
  } else {
    if (width === null && height !== null) width = sourceWidth;
    if (height === null && width !== null) height = sourceHeight;
  }

  if (width === null || height === null) {
    return { ok: false, message: 'Enter width, height, or both.' };
  }

  width = roundPx(width);
  height = roundPx(height);

  const limit = exceedsLimits(width, height);
  if (limit) return { ok: false, message: limit };

  return {
    ok: true,
    width,
    height,
    changed: width !== sourceWidth || height !== sourceHeight,
  };
}

/** Resize a decoded bitmap to target dimensions (high-quality smoothing). */
export async function resizeBitmap(
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
): Promise<ImageBitmap> {
  if (bitmap.width === targetWidth && bitmap.height === targetHeight) {
    return bitmap;
  }

  type CanvasLike = OffscreenCanvas | HTMLCanvasElement;
  let canvas: CanvasLike;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(targetWidth, targetHeight);
  } else if (typeof document !== 'undefined') {
    const el = document.createElement('canvas');
    el.width = targetWidth;
    el.height = targetHeight;
    canvas = el;
  } else {
    throw Object.assign(new Error('Canvas unavailable'), { code: 'browser-limit' });
  }

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw Object.assign(new Error('Canvas unavailable'), { code: 'browser-limit' });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  if (canvas instanceof OffscreenCanvas) {
    return createImageBitmap(canvas);
  }

  return createImageBitmap(canvas as HTMLCanvasElement);
}
