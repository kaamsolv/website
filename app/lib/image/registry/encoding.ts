/**
 * Format-aware encoding controls for the converter UI and pipeline.
 */
import type { FormatId } from './format-registry';
import { getFormat } from './capabilities';

/** What kind of output-size control the UI should show for a format. */
export type EncodingControlKind = 'quality' | 'optimization' | 'none';

/**
 * Lossy formats expose a quality slider.
 * Lossless formats may expose optimization in future (not faked today).
 */
export function encodingControlForFormat(format: FormatId): EncodingControlKind {
  if (!getFormat(format).canEncode) return 'none';
  if (format === 'jpeg' || format === 'webp') return 'quality';
  if (format === 'png') return 'none'; // Canvas PNG is lossless; no fake quality slider.
  // Future AVIF encode: return 'quality' when wasm-avif ships.
  return 'none';
}

export function supportsQualityControl(format: FormatId): boolean {
  return encodingControlForFormat(format) === 'quality';
}

export function supportsLosslessOptimization(format: FormatId): boolean {
  return encodingControlForFormat(format) === 'optimization';
}
