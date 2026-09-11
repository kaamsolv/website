import type { PresetId, QrDesign } from './design';
import { DEFAULT_QR_DESIGN } from './design';

export type PresetConfig = {
  id: PresetId;
  label: string;
  design: Omit<QrDesign, 'logo' | 'presetId'>;
};

export const PRESETS: PresetConfig[] = [
  {
    id: 'classic',
    label: 'Classic',
    design: {
      colors: { fg: '#0C2248', bg: '#FFFFFF', transparent: false },
      modules: { shape: 'square' },
      eyes: { shape: 'square' },
      frame: { id: 'none' },
      errorCorrection: 'M',
      quietZoneModules: 4,
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    design: {
      colors: { fg: '#0C2248', bg: '#FFFFFF', transparent: false },
      modules: { shape: 'rounded' },
      eyes: { shape: 'rounded' },
      frame: { id: 'border' },
      errorCorrection: 'M',
      quietZoneModules: 4,
    },
  },
  {
    id: 'business',
    label: 'Business',
    design: {
      colors: { fg: '#0C2248', bg: '#FFFFFF', transparent: false },
      modules: { shape: 'square' },
      eyes: { shape: 'square' },
      frame: { id: 'scan-me', ctaText: 'Scan Me' },
      errorCorrection: 'M',
      quietZoneModules: 4,
    },
  },
  {
    id: 'payment',
    label: 'Payment',
    design: {
      colors: { fg: '#0C2248', bg: '#FFFFFF', transparent: false },
      modules: { shape: 'square' },
      eyes: { shape: 'square' },
      frame: { id: 'pay-here', ctaText: 'Pay Here' },
      errorCorrection: 'M',
      quietZoneModules: 4,
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    design: {
      colors: { fg: '#128C7E', bg: '#FFFFFF', transparent: false },
      modules: { shape: 'rounded' },
      eyes: { shape: 'rounded' },
      frame: { id: 'whatsapp-us', ctaText: 'WhatsApp Us' },
      errorCorrection: 'M',
      quietZoneModules: 4,
    },
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    design: {
      colors: { fg: '#FE6336', bg: '#FFFFFF', transparent: false },
      modules: { shape: 'dots' },
      eyes: { shape: 'rounded' },
      frame: { id: 'view-menu', ctaText: 'View Menu' },
      errorCorrection: 'M',
      quietZoneModules: 4,
    },
  },
];

export function getPreset(id: PresetId): PresetConfig {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}

/** Apply preset design — preserves uploaded logo. Does not touch QR payload/type. */
export function applyPreset(current: QrDesign, presetId: PresetId): QrDesign {
  const preset = getPreset(presetId);
  return {
    ...preset.design,
    presetId,
    logo: current.logo,
  };
}

export function isPresetActive(design: QrDesign, presetId: PresetId): boolean {
  return design.presetId === presetId;
}
