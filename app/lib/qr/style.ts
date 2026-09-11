import type { QrEcLevel, QrKind, QrSize, QrStyle } from './types';
import { contrastWarning, isHexColor } from './validate';

export const SIZE_OPTIONS: { value: QrSize; label: string }[] = [
  { value: 256, label: 'Small · 256px' },
  { value: 512, label: 'Medium · 512px' },
  { value: 1024, label: 'Large · 1024px' },
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
  { kind: 'whatsapp', label: 'WhatsApp' },
  { kind: 'vcard', label: 'Contact' },
];

export const DOWNLOAD_PNG = 'kaamkit-qr-code.png';
export const DOWNLOAD_SVG = 'kaamkit-qr-code.svg';

/** Logo needs High correction so scanners can still read the covered modules. */
export function effectiveErrorCorrection(requested: QrEcLevel, hasLogo: boolean): QrEcLevel {
  return hasLogo ? 'H' : requested;
}

export function styleWarning(style: QrStyle): string | null {
  if (!isHexColor(style.fg)) return 'Pick a valid foreground colour.';
  if (!style.transparent && !isHexColor(style.bg)) return 'Pick a valid background colour.';
  return contrastWarning(style.fg, style.transparent ? '#FFFFFF' : style.bg, style.transparent);
}

export const QR_MARGIN_MODULES = 4;
export const LOGO_FRACTION = 0.18;
