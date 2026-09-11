/**
 * QR payload and style types.
 *
 * Phase 1 encodes the payload string directly into the image (`mode: 'static'`).
 * Later, dynamic/tracked QR can keep the same payload + style and only change
 * `mode` so the image encodes a KaamKit short URL instead. Do not collapse
 * payload, style, and encoded text into one blob — that would force a rewrite.
 */

export const QR_KINDS = ['url', 'text', 'wifi', 'email', 'phone', 'whatsapp', 'vcard'] as const;
export type QrKind = (typeof QR_KINDS)[number];

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export type QrPayload =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'wifi'; ssid: string; password: string; security: WifiSecurity; hidden: boolean }
  | { kind: 'email'; email: string; subject: string; body: string }
  | { kind: 'phone'; phone: string }
  | { kind: 'whatsapp'; phone: string; message: string }
  | { kind: 'vcard'; name: string; phone: string; email: string; org: string; url: string; address: string };

/** What the QR image should contain. Static = payload string. Dynamic = later. */
export type QrEncodeMode = 'static';

export type EncodeOk = {
  ok: true;
  /** The exact string drawn into the QR. Swap this later for a tracking URL. */
  text: string;
  mode: QrEncodeMode;
  kind: QrKind;
};

export type EncodeFail = { ok: false; field?: string; message: string };
export type EncodeResult = EncodeOk | EncodeFail;

export const QR_SIZES = [256, 512, 1024] as const;
export type QrSize = (typeof QR_SIZES)[number];

export const QR_EC_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type QrEcLevel = (typeof QR_EC_LEVELS)[number];

export const QR_FG_PRESETS = [
  { label: 'Navy', value: '#0C2248' },
  { label: 'Coral', value: '#FE6336' },
  { label: 'Purple', value: '#6934D0' },
] as const;

export type QrStyle = {
  fg: string;
  /** `#FFFFFF` or empty string for transparent (PNG/SVG). */
  bg: string;
  transparent: boolean;
  size: QrSize;
  errorCorrection: QrEcLevel;
};

export const DEFAULT_QR_STYLE: QrStyle = {
  fg: '#0C2248',
  bg: '#FFFFFF',
  transparent: false,
  size: 512,
  errorCorrection: 'M',
};

export const MAX_TEXT_LENGTH = 1200;
export const MAX_URL_LENGTH = 2048;
export const MAX_LOGO_BYTES = 500 * 1024;
export const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
