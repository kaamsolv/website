import type { FrameId } from './design';

export const CTA_MAX_LENGTH = 24;

export const FRAME_OPTIONS: { id: FrameId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'border', label: 'Border' },
  { id: 'scan-me', label: 'Scan Me' },
  { id: 'pay-here', label: 'Pay Here' },
  { id: 'view-menu', label: 'View Menu' },
  { id: 'visit-website', label: 'Visit Website' },
  { id: 'whatsapp-us', label: 'WhatsApp Us' },
];

const DEFAULT_CTA: Partial<Record<FrameId, string>> = {
  'scan-me': 'Scan Me',
  'pay-here': 'Pay Here',
  'view-menu': 'View Menu',
  'visit-website': 'Visit Website',
  'whatsapp-us': 'WhatsApp Us',
};

export function frameHasCta(id: FrameId): boolean {
  return id !== 'none' && id !== 'border';
}

export function defaultCtaText(id: FrameId): string | null {
  return DEFAULT_CTA[id] ?? null;
}

export function resolveCtaText(id: FrameId, custom?: string): string | null {
  if (!frameHasCta(id)) return null;
  const raw = (custom ?? defaultCtaText(id) ?? '').trim();
  if (!raw) return defaultCtaText(id);
  return raw.slice(0, CTA_MAX_LENGTH);
}

export function sanitizeCtaInput(value: string): string {
  return value.slice(0, CTA_MAX_LENGTH);
}

export function frameHasBorder(id: FrameId): boolean {
  return id !== 'none';
}
