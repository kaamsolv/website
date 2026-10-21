/**
 * Encode-time optimization — format-aware quality / compression params.
 *
 * Future: PNG lossless recompression, metadata stripping, palette reduction.
 */
import type { FormatId } from '../registry/format-registry';
import { encodingControlForFormat } from '../registry/encoding';
import type { ConvertOptions } from '../types';

export type EncodeParams = {
  /** 0–1 quality for lossy encoders; omitted for lossless. */
  quality?: number;
};

export function resolveEncodeParams(format: FormatId, options: ConvertOptions): EncodeParams {
  const control = encodingControlForFormat(format);
  if (control === 'quality') {
    return { quality: options.quality };
  }
  // Future: lossless optimization level for PNG when a codec supports it.
  return {};
}
