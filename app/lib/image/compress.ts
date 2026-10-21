/**
 * Image Kit — Compress module. Framework-free decisions for the Image
 * Compressor: which output formats make sense for an input, quality levels,
 * the optional "max size" downscale, and whether the result actually helped.
 * Encoding itself reuses the shared pipeline (decode → resize → encode).
 */
import { getFormat } from './registry/capabilities';
import type { FormatId } from './registry/format-registry';
import type { OutputFormat, ResizeOptions } from './types';
import { DEFAULT_RESIZE_OPTIONS } from './types';

export type CompressLevel = 'smaller' | 'balanced' | 'quality';

/** Lossy encoder quality per level (JPG / WebP). */
export const COMPRESS_QUALITY: Record<CompressLevel, number> = {
  smaller: 0.6,
  balanced: 0.75,
  quality: 0.88,
};

export const COMPRESS_LEVELS: { id: CompressLevel; label: string; hint: string }[] = [
  { id: 'smaller', label: 'Smaller file', hint: 'Smallest size. Fine for messages and email.' },
  { id: 'balanced', label: 'Balanced', hint: 'Much smaller, still looks the same. Best for most uses.' },
  { id: 'quality', label: 'Best quality', hint: 'Gentle compression for photos you’ll print or edit.' },
];

export const DEFAULT_COMPRESS_LEVEL: CompressLevel = 'balanced';

/** Formats the compressor accepts. Animated / vector / icon inputs are left out on purpose. */
export const COMPRESSIBLE_INPUTS: readonly FormatId[] = ['jpeg', 'png', 'webp', 'heic', 'avif', 'bmp'];

export function isCompressibleInput(format: FormatId): boolean {
  return COMPRESSIBLE_INPUTS.includes(format);
}

/** `accept` attribute for the file picker: MIME types + extensions of compressible inputs. */
export function compressAcceptString(): string {
  const parts = new Set<string>();
  for (const id of COMPRESSIBLE_INPUTS) {
    const f = getFormat(id);
    f.mimeTypes.forEach((m) => parts.add(m));
    f.extensions.forEach((e) => parts.add(`.${e}`));
  }
  return [...parts].join(',');
}

export type CompressOutputChoice = { format: OutputFormat; label: string; hint: string };

/**
 * Output formats offered for an input, default first. Keeping the input's own
 * format comes first where it can shrink (JPG, WebP). PNG defaults to WebP,
 * which keeps transparency at a fraction of the size — PNG→PNG stays offered
 * but can only shrink by resizing, since PNG is lossless.
 */
export function compressOutputChoices(input: FormatId): CompressOutputChoice[] {
  const jpg: CompressOutputChoice = { format: 'jpeg', label: 'JPG', hint: 'Works everywhere. No transparency.' };
  const webp: CompressOutputChoice = { format: 'webp', label: 'WebP', hint: 'Smallest, keeps transparency. Works in modern apps and browsers.' };
  const png: CompressOutputChoice = { format: 'png', label: 'PNG', hint: 'Stays lossless — only “Max size” makes it smaller.' };
  switch (input) {
    case 'jpeg':
      return [jpg, webp];
    case 'webp':
      return [webp, jpg];
    case 'png':
      return [webp, jpg, png];
    default:
      // HEIC, AVIF, BMP: JPG is the format everything opens.
      return [jpg, webp];
  }
}

export function defaultCompressOutput(input: FormatId): OutputFormat {
  return compressOutputChoices(input)[0].format;
}

export function qualityForLevel(level: CompressLevel): number {
  return COMPRESS_QUALITY[level];
}

/** Longest-side limits offered under "Max size" (px). `null` = keep original size. */
export const MAX_SIDE_CHOICES: readonly (number | null)[] = [null, 3840, 2560, 1920, 1280];

/** Only offer limits that would actually shrink this image (never upscale). */
export function maxSideChoicesFor(width: number | null, height: number | null): (number | null)[] {
  if (!width || !height) return [null];
  const longest = Math.max(width, height);
  return MAX_SIDE_CHOICES.filter((side) => side === null || side < longest);
}

/** Resize options that cap the longest side at `maxSide`, keeping the aspect ratio. */
export function resizeForMaxSide(
  maxSide: number | null,
  width: number | null,
  height: number | null,
): ResizeOptions {
  if (maxSide === null || !width || !height || Math.max(width, height) <= maxSide) {
    return DEFAULT_RESIZE_OPTIONS;
  }
  const landscape = width >= height;
  return {
    ...DEFAULT_RESIZE_OPTIONS,
    mode: 'dimensions',
    keepAspectRatio: true,
    width: landscape ? maxSide : null,
    height: landscape ? null : maxSide,
  };
}

export type CompressOutcome =
  | { kind: 'smaller'; savedBytes: number; savedPercent: number }
  | { kind: 'not-smaller'; extraBytes: number };

/** Did compressing help? A result that isn't smaller is never offered as a download. */
export function compressOutcome(inputBytes: number, outputBytes: number): CompressOutcome {
  if (inputBytes > 0 && outputBytes < inputBytes) {
    const savedBytes = inputBytes - outputBytes;
    return { kind: 'smaller', savedBytes, savedPercent: Math.round((savedBytes / inputBytes) * 100) };
  }
  return { kind: 'not-smaller', extraBytes: Math.max(0, outputBytes - inputBytes) };
}

/** `photo.jpg` → `photo-compressed.webp` (never overwrites the original's name). */
export function compressedFilename(original: string, extension: string): string {
  const dot = original.lastIndexOf('.');
  const base = (dot > 0 ? original.slice(0, dot) : original).trim() || 'image';
  return `${base}-compressed.${extension}`;
}
