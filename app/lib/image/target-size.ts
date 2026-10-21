/**
 * Image Kit — "Resize image to KB": hit a file-size target and/or an exact
 * pixel size, the way exam and government forms ask for it. Framework-free;
 * the search takes an injected encoder so it's unit-testable without canvas.
 */

export type SizeUnit = 'px' | 'cm' | 'mm' | 'in';

const MM_PER_UNIT: Record<Exclude<SizeUnit, 'px'>, number> = { mm: 1, cm: 10, in: 25.4 };

/** Length in `unit` → whole pixels at `dpi` (px passes through). */
export function toPixels(value: number, unit: SizeUnit, dpi: number): number {
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  if (unit === 'px') return Math.round(value);
  if (!Number.isFinite(dpi) || dpi <= 0) return Number.NaN;
  return Math.round((value * MM_PER_UNIT[unit] * dpi) / 25.4);
}

export const DEFAULT_DPI = 300;
export const MAX_OUTPUT_PX = 8000;

/** Quick picks for the size limit, in KB. */
export const KB_PICKS = [10, 20, 50, 100, 200, 500, 1000] as const;
export const MIN_TARGET_KB = 1;
export const MAX_TARGET_KB = 20_000;

/**
 * Bytes allowed for a "N KB" limit. Forms disagree on whether 1 KB is 1,000 or
 * 1,024 bytes, so aim under the smaller: N × 1000 bytes passes both.
 */
export function kbToBytes(kb: number): number {
  return Math.floor(kb * 1000);
}

/** "50", "50kb", "50 KB", "1.5 MB" → KB; null if not a sensible limit. */
export function parseKb(input: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(kb|k|mb|m)?\s*$/i.exec(input);
  if (!m) return null;
  const n = Number(m[1]) * (/^m/i.test(m[2] ?? '') ? 1000 : 1);
  return n >= MIN_TARGET_KB && n <= MAX_TARGET_KB ? n : null;
}

export function kbLabel(kb: number): string {
  return kb >= 1000 && kb % 1000 === 0 ? `${kb / 1000} MB` : `${kb} KB`;
}

// --------------------------------------------------------------------- search

export type Attempt<T> = { quality: number; scale: number; size: number; data: T };

export type SearchOutcome<T> =
  /** Within the limit (and at/above the minimum, if one was set). */
  | { kind: 'fits'; best: Attempt<T>; tries: number }
  /** Even the smallest try is over the limit; `best` is the smallest found. */
  | { kind: 'too-big'; best: Attempt<T>; tries: number }
  /** Under the minimum even at top quality; `best` is the largest found. */
  | { kind: 'too-small'; best: Attempt<T>; tries: number };

export type SearchOptions = {
  maxBytes: number;
  minBytes?: number;
  /** May the image be scaled down to fit? False when the pixel size is fixed. */
  allowScale: boolean;
  minQuality?: number;
  maxQuality?: number;
  /** Binary-search steps per scale. */
  steps?: number;
  /** How many times to shrink the image before giving up. */
  maxScaleSteps?: number;
  /** Smallest scale allowed (protects against absurd downsizing). */
  minScale?: number;
};

/**
 * Find the highest JPG quality (and, if allowed, the largest scale) whose
 * output fits under `maxBytes`. `encode(quality, scale)` returns the encoded
 * size plus whatever data the caller wants back (e.g. the Blob).
 */
export async function searchTarget<T>(
  encode: (quality: number, scale: number) => Promise<{ size: number; data: T }>,
  opts: SearchOptions,
): Promise<SearchOutcome<T>> {
  const minQ = opts.minQuality ?? 0.2;
  const maxQ = opts.maxQuality ?? 0.95;
  const steps = opts.steps ?? 8;
  const maxScaleSteps = opts.allowScale ? (opts.maxScaleSteps ?? 8) : 0;
  const minScale = opts.minScale ?? 0.05;
  let tries = 0;

  const run = async (quality: number, scale: number): Promise<Attempt<T>> => {
    tries++;
    const r = await encode(quality, scale);
    return { quality, scale, size: r.size, data: r.data };
  };

  let scale = 1;
  let smallest: Attempt<T> | null = null;

  for (let round = 0; round <= maxScaleSteps; round++) {
    const top = await run(maxQ, scale);
    if (top.size <= opts.maxBytes) {
      if (opts.minBytes && top.size < opts.minBytes) return { kind: 'too-small', best: top, tries };
      return { kind: 'fits', best: top, tries };
    }

    const bottom = await run(minQ, scale);
    if (bottom.size <= opts.maxBytes) {
      // Binary search for the highest quality that still fits.
      let lo = bottom;
      let loQ = minQ;
      let hiQ = maxQ;
      for (let i = 0; i < steps; i++) {
        const midQ = Math.round(((loQ + hiQ) / 2) * 1000) / 1000;
        const mid = await run(midQ, scale);
        if (mid.size <= opts.maxBytes) {
          lo = mid;
          loQ = midQ;
        } else {
          hiQ = midQ;
        }
      }
      return { kind: 'fits', best: lo, tries };
    }

    if (!smallest || bottom.size < smallest.size) smallest = bottom;
    if (round === maxScaleSteps) break;
    // Shrink roughly by the area needed, with a margin; never below minScale.
    const next = scale * Math.sqrt(opts.maxBytes / bottom.size) * 0.92;
    if (next < minScale) break;
    scale = Math.round(next * 1000) / 1000;
  }

  return { kind: 'too-big', best: smallest!, tries };
}

/** Plain-English label for a JPG quality setting. */
export function qualityLabel(quality: number): 'Good' | 'OK' | 'Low' {
  if (quality >= 0.75) return 'Good';
  if (quality >= 0.45) return 'OK';
  return 'Low';
}

/** `photo.png` + 50 KB → `photo-50kb.jpg`; exact size only → `photo-413x531.jpg`. */
export function targetFilename(original: string, kb: number | null, width: number, height: number): string {
  const dot = original.lastIndexOf('.');
  const base = (dot > 0 ? original.slice(0, dot) : original).trim().replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 100) || 'image';
  return kb ? `${base}-${kb}kb.jpg` : `${base}-${width}x${height}.jpg`;
}
