import type { QrEcLevel } from './types';

export const MODULE_SHAPES = ['square', 'rounded', 'dots'] as const;
export type ModuleShape = (typeof MODULE_SHAPES)[number];

export const EYE_SHAPES = ['square', 'rounded'] as const;
export type EyeShape = (typeof EYE_SHAPES)[number];

export const LOGO_SIZES = ['s', 'm', 'l'] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];

export const FRAME_IDS = [
  'none',
  'border',
  'scan-me',
  'pay-here',
  'view-menu',
  'visit-website',
  'whatsapp-us',
] as const;
export type FrameId = (typeof FRAME_IDS)[number];

export const PRESET_IDS = ['classic', 'minimal', 'business', 'payment', 'whatsapp', 'restaurant'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const EXPORT_SIZES = [256, 512, 1024, 2048, 4096] as const;
export type ExportSize = (typeof EXPORT_SIZES)[number];

export const MIN_QUIET_ZONE = 4;
export const LOGO_FRACTIONS: Record<LogoSize, number> = { s: 0.14, m: 0.18, l: 0.2 };
export const LOGO_MAX_FRACTION = 0.22;
export const LOGO_PAD_FRACTION = 0.12;

export const QR_FG_PRESETS = [
  { label: 'Navy', value: '#0C2248' },
  { label: 'Coral', value: '#FE6336' },
  { label: 'Purple', value: '#6934D0' },
  { label: 'Teal', value: '#38BBAC' },
] as const;

export type QrDesign = {
  presetId?: PresetId;
  colors: {
    fg: string;
    bg: string;
    transparent: boolean;
  };
  modules: { shape: ModuleShape };
  eyes: { shape: EyeShape };
  logo?: { dataUrl: string; size: LogoSize };
  frame: { id: FrameId; ctaText?: string };
  errorCorrection: QrEcLevel;
  quietZoneModules: number;
};

export type QrExportOptions = {
  pixelSize: ExportSize;
  format: 'png' | 'svg' | 'jpg';
};

export const DEFAULT_QR_DESIGN: QrDesign = {
  colors: { fg: '#0C2248', bg: '#FFFFFF', transparent: false },
  modules: { shape: 'square' },
  eyes: { shape: 'square' },
  frame: { id: 'none' },
  errorCorrection: 'M',
  quietZoneModules: MIN_QUIET_ZONE,
};

export const DEFAULT_EXPORT_OPTIONS: QrExportOptions = {
  pixelSize: 512,
  format: 'png',
};

export function effectiveErrorCorrection(requested: QrEcLevel, hasLogo: boolean): QrEcLevel {
  return hasLogo ? 'H' : requested;
}

export function logoFraction(size: LogoSize): number {
  return LOGO_FRACTIONS[size];
}

export function hasLogo(design: QrDesign): boolean {
  return !!design.logo?.dataUrl;
}

export function isModuleShape(v: string): v is ModuleShape {
  return (MODULE_SHAPES as readonly string[]).includes(v);
}

export function isEyeShape(v: string): v is EyeShape {
  return (EYE_SHAPES as readonly string[]).includes(v);
}

export function isFrameId(v: string): v is FrameId {
  return (FRAME_IDS as readonly string[]).includes(v);
}

export function isPresetId(v: string): v is PresetId {
  return (PRESET_IDS as readonly string[]).includes(v);
}

export function isExportSize(n: number): n is ExportSize {
  return (EXPORT_SIZES as readonly number[]).includes(n);
}

/** Max export edge length — lower on narrow viewports to limit memory use. */
export function maxExportSizeForViewport(viewportWidth: number): ExportSize {
  return viewportWidth < 768 ? 2048 : 4096;
}

export function clampExportSize(size: ExportSize, viewportWidth: number): ExportSize {
  const max = maxExportSizeForViewport(viewportWidth);
  return size > max ? max : size;
}
