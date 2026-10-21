/**
 * QR payload and style types.
 *
 * Phase 1 encodes the payload string directly into the image (`mode: 'static'`).
 * Later, dynamic/tracked QR can keep the same payload + style and only change
 * `mode` so the image encodes a KaamSolv short URL instead. Do not collapse
 * payload, style, and encoded text into one blob — that would force a rewrite.
 */

export const QR_KINDS = [
  'url',
  'text',
  'wifi',
  'email',
  'phone',
  'sms',
  'whatsapp',
  'vcard',
  'location',
  'event',
  'social',
  'file',
  'upi',
] as const;
export type QrKind = (typeof QR_KINDS)[number];

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type QrPayload =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'wifi'; ssid: string; password: string; security: WifiSecurity; hidden: boolean }
  | { kind: 'email'; email: string; subject: string; body: string }
  | { kind: 'phone'; phone: string }
  | { kind: 'sms'; phone: string; message: string }
  | { kind: 'whatsapp'; phone: string; message: string }
  | { kind: 'vcard'; name: string; phone: string; email: string; org: string; url: string; address: string }
  | { kind: 'location'; latitude: string; longitude: string; name: string; mapsUrl: string }
  | { kind: 'event'; title: string; start: string; end: string; location: string; description: string }
  | { kind: 'social'; platform: SocialPlatform; url: string }
  | { kind: 'file'; url: string; label: string }
  | { kind: 'upi'; upiId: string; payeeName: string; amount: string; note: string };

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

export const QR_EC_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type QrEcLevel = (typeof QR_EC_LEVELS)[number];

export const MAX_TEXT_LENGTH = 1200;
export const MAX_URL_LENGTH = 2048;
export const MAX_LOGO_BYTES = 500 * 1024;
export const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
