import type { QrEcLevel, QrKind } from './types';
import { EXPORT_SIZES, type ExportSize } from './design';

export const SIZE_OPTIONS: { value: ExportSize; label: string }[] = [
  { value: 256, label: '256px · Screen' },
  { value: 512, label: '512px · Default' },
  { value: 1024, label: '1024px · Print' },
  { value: 2048, label: '2048px · High-res' },
  { value: 4096, label: '4096px · Poster' },
];

export const EC_OPTIONS: { value: QrEcLevel; label: string; hint: string }[] = [
  { value: 'L', label: 'Low (L)', hint: 'Smallest QR — fine on screens' },
  { value: 'M', label: 'Medium (M)', hint: 'Good default for print and screens' },
  { value: 'Q', label: 'Quartile (Q)', hint: 'More damage-tolerant' },
  { value: 'H', label: 'High (H)', hint: 'Best with a logo or rough print' },
];

export const KIND_OPTIONS: { kind: QrKind; label: string }[] = [
  { kind: 'url', label: 'Website' },
  { kind: 'text', label: 'Text' },
  { kind: 'wifi', label: 'Wi-Fi' },
  { kind: 'email', label: 'Email' },
  { kind: 'phone', label: 'Phone' },
  { kind: 'sms', label: 'SMS' },
  { kind: 'whatsapp', label: 'WhatsApp' },
  { kind: 'vcard', label: 'Contact' },
  { kind: 'location', label: 'Location' },
  { kind: 'event', label: 'Event' },
  { kind: 'social', label: 'Social' },
  { kind: 'file', label: 'PDF' },
  { kind: 'upi', label: 'UPI' },
];

export { EXPORT_SIZES };
