import type { EncodeResult } from '../types';
import { normalizeHttpUrl } from '../validate';

/** Encodes a public file URL. Label is UI-only and not included in the QR. */
export function encodeFilePayload(url: string): EncodeResult {
  const normalized = normalizeHttpUrl(url);
  if (!normalized.ok) return { ok: false, field: 'url', message: normalized.message };
  return { ok: true, text: normalized.url, mode: 'static', kind: 'file' };
}
