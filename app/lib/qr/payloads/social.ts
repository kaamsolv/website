import type { EncodeResult, SocialPlatform } from '../types';
import { normalizeHttpUrl } from '../validate';

/** Encodes the supplied profile/page URL directly — platform is UI context only. */
export function encodeSocialPayload(platform: SocialPlatform, url: string): EncodeResult {
  const normalized = normalizeHttpUrl(url);
  if (!normalized.ok) return { ok: false, field: 'url', message: normalized.message };
  return { ok: true, text: normalized.url, mode: 'static', kind: 'social' };
}
