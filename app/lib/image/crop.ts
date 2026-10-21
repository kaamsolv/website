/**
 * Crop maths for exact-size output. A crop is stored as a centre point plus a
 * zoom level (both in source pixels), so changing the output shape or zoom
 * never pushes the box outside the image. Framework-free.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** Where the crop sits: centre in source px, zoom 1 = largest box that fits. */
export type CropState = { cx: number; cy: number; zoom: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export function initialCrop(srcW: number, srcH: number): CropState {
  return { cx: srcW / 2, cy: srcH / 2, zoom: 1 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The crop rectangle (source px) for an output `aspect` = width / height. */
export function cropRect(srcW: number, srcH: number, aspect: number, state: CropState): Rect {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  // Largest box with this aspect that fits the image, then shrink by zoom.
  let w = srcW;
  let h = w / aspect;
  if (h > srcH) {
    h = srcH;
    w = h * aspect;
  }
  w /= zoom;
  h /= zoom;
  const x = clamp(state.cx - w / 2, 0, srcW - w);
  const y = clamp(state.cy - h / 2, 0, srcH - h);
  return { x, y, w, h };
}

/** Move the crop by (dx, dy) source px, keeping it inside the image. */
export function moveCrop(srcW: number, srcH: number, aspect: number, state: CropState, dx: number, dy: number): CropState {
  const r = cropRect(srcW, srcH, aspect, state);
  const x = clamp(r.x + dx, 0, srcW - r.w);
  const y = clamp(r.y + dy, 0, srcH - r.h);
  return { ...state, cx: x + r.w / 2, cy: y + r.h / 2 };
}

/** Change zoom around the current centre; the centre is re-clamped. */
export function zoomCrop(srcW: number, srcH: number, aspect: number, state: CropState, zoom: number): CropState {
  const next = { ...state, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) };
  const r = cropRect(srcW, srcH, aspect, next);
  return { ...next, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

/** "Fit with white border": where the whole image sits inside an out-W × out-H frame. */
export function containRect(srcW: number, srcH: number, outW: number, outH: number): Rect {
  const scale = Math.min(outW / srcW, outH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (outW - w) / 2, y: (outH - h) / 2, w, h };
}
