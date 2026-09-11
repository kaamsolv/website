import type { EncodeResult } from '../types';
import { telDigits } from '../validate';

/** Standard `sms:` URI — phone required, body optional. */
export function encodeSmsPayload(phone: string, message: string): EncodeResult {
  const tel = telDigits(phone);
  if (!tel.ok) return { ok: false, field: 'phone', message: tel.message };

  const body = message.trim();
  const text = body ? `sms:${tel.tel}?body=${encodeURIComponent(body)}` : `sms:${tel.tel}`;
  return { ok: true, text, mode: 'static', kind: 'sms' };
}
