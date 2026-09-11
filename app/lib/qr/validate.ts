import {
  MAX_TEXT_LENGTH,
  MAX_URL_LENGTH,
  type QrKind,
  type QrPayload,
  type WifiSecurity,
} from './types';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BARE_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/.*)?$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

export function emptyPayload(kind: QrKind): QrPayload {
  switch (kind) {
    case 'url':
      return { kind: 'url', url: '' };
    case 'text':
      return { kind: 'text', text: '' };
    case 'wifi':
      return { kind: 'wifi', ssid: '', password: '', security: 'WPA', hidden: false };
    case 'email':
      return { kind: 'email', email: '', subject: '', body: '' };
    case 'phone':
      return { kind: 'phone', phone: '' };
    case 'whatsapp':
      return { kind: 'whatsapp', phone: '', message: '' };
    case 'vcard':
      return { kind: 'vcard', name: '', phone: '', email: '', org: '', url: '', address: '' };
  }
}

export function normalizeHttpUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  const input = (raw ?? '').trim();
  if (!input) return { ok: false, message: 'Paste a website address.' };
  if (input.length > MAX_URL_LENGTH) return { ok: false, message: 'That address is too long.' };
  if (/\s/.test(input) || hasControlChars(input)) {
    return { ok: false, message: "That doesn't look like a valid web address." };
  }

  const candidate = !HAS_SCHEME.test(input) && BARE_DOMAIN.test(input) ? `https://${input}` : input;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, message: "That doesn't look like a valid web address." };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Use an http or https address.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: "That address has a username or password in it — we can't put those in a QR." };
  }
  if (!parsed.hostname) {
    return { ok: false, message: "That doesn't look like a valid web address." };
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  return { ok: true, url: parsed.toString() };
}

export function normalizeEmail(raw: string): { ok: true; email: string } | { ok: false; message: string } {
  const email = (raw ?? '').trim();
  if (!email) return { ok: false, message: 'Add an email address.' };
  if (!EMAIL.test(email) || hasControlChars(email)) {
    return { ok: false, message: "That doesn't look like an email address." };
  }
  return { ok: true, email };
}

/** Keep a leading + and digits; drop spaces, dashes, brackets. */
export function normalizePhoneDisplay(raw: string): string {
  const trimmed = (raw ?? '').trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/[^\d]/g, '');
  return plus + digits;
}

export function whatsappDigits(raw: string): { ok: true; digits: string } | { ok: false; message: string } {
  let digits = (raw ?? '').replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) return { ok: false, message: 'Add a WhatsApp number with country code.' };
  if (digits.length === 10) {
    return { ok: false, message: 'Add a country code, like +91, before the number.' };
  }
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, message: "That doesn't look like a phone number." };
  }
  return { ok: true, digits };
}

export function telDigits(raw: string): { ok: true; tel: string } | { ok: false; message: string } {
  const value = normalizePhoneDisplay(raw);
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return { ok: false, message: 'Add a phone number.' };
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, message: "That doesn't look like a phone number." };
  }
  return { ok: true, tel: value.startsWith('+') ? value : `+${digits}` };
}

export function isWifiSecurity(value: string): value is WifiSecurity {
  return value === 'WPA' || value === 'WEP' || value === 'nopass';
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

/** Contrast ratio of two #RRGGBB colours. QR scanning needs a clear dark/light split. */
export function contrastRatio(fg: string, bg: string): number {
  const L = (hex: string) => {
    const n = hex.replace('#', '');
    const rgb = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  };
  const a = L(fg);
  const b = L(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastWarning(fg: string, bg: string, transparent: boolean): string | null {
  if (transparent) {
    const vsWhite = contrastRatio(fg, '#FFFFFF');
    if (vsWhite < 3) return 'That colour may be hard to scan on a light background.';
    return null;
  }
  if (!isHexColor(fg) || !isHexColor(bg)) return null;
  if (contrastRatio(fg, bg) < 3) {
    return 'Foreground and background are too similar — phones may not read this QR.';
  }
  return null;
}

export { hasControlChars, MAX_TEXT_LENGTH };
