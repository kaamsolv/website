import { decodeFormat } from './codecs/decode';
import type { FormatId } from './registry/format-registry';

/** Probe dimensions without retaining bitmap in React state. */
export async function probeImageDimensions(
  file: File,
  format: FormatId,
): Promise<{ width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const bitmap = await decodeFormat(buffer, format);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}
