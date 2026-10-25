/**
 * Invoice design (Pro): PDF templates and the brand colour. Framework-free.
 * Text drawn on the brand colour picks white or navy — whichever has the
 * higher contrast (WCAG relative luminance) — so any colour stays readable.
 */

export const TEMPLATES = [
  { id: 'classic', label: 'Classic', hint: 'Clean, with a coloured accent' },
  { id: 'minimal', label: 'Minimal', hint: 'Light lines — best for black-and-white printing' },
  { id: 'bold', label: 'Bold', hint: 'A coloured header band' },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]['id'];

export const DEFAULT_TEMPLATE: TemplateId = 'classic';
export const DEFAULT_BRAND_COLOR = '#FE6336';

export const SWATCHES = [
  { hex: '#FE6336', name: 'Coral' },
  { hex: '#0C2248', name: 'Navy' },
  { hex: '#38BBAC', name: 'Teal' },
  { hex: '#6934D0', name: 'Purple' },
  { hex: '#2E7D32', name: 'Green' },
  { hex: '#1D4ED8', name: 'Blue' },
  { hex: '#8B1E3F', name: 'Maroon' },
  { hex: '#374151', name: 'Charcoal' },
] as const;

export type Design = { template: TemplateId; color: string };

export const DEFAULT_DESIGN: Design = { template: DEFAULT_TEMPLATE, color: DEFAULT_BRAND_COLOR };

export function isTemplate(v: unknown): v is TemplateId {
  return typeof v === 'string' && TEMPLATES.some((t) => t.id === v);
}

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
}

/** A design as stored: anything unreadable falls back to the defaults. */
export function cleanDesign(input: unknown): Design {
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    template: isTemplate(r.template) ? r.template : DEFAULT_TEMPLATE,
    color: isHexColor(r.color) ? r.color.toUpperCase() : DEFAULT_BRAND_COLOR,
  };
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const NAVY = '#0C2248';
export const WHITE = '#FFFFFF';

/** White or navy — whichever reads better on the given colour. */
export function textOn(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, NAVY) ? WHITE : NAVY;
}
