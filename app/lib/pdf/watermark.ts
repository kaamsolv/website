/**
 * Watermarks as plain data: the choices, what can be written, how big, which pages.
 * No PDF library here (the panel's preview and the engine in stamp.ts share it), tested in
 * test/pdf-watermark.test.mts.
 */

import { parsePageRanges } from './ranges';

export type WatermarkLayout = 'diagonal' | 'center';
export type WatermarkSize = 'small' | 'medium' | 'large';
export type WatermarkColor = 'grey' | 'red' | 'blue';
export type ImagePosition = 'center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export type TextWatermark = {
  text: string;
  layout: WatermarkLayout;
  size: WatermarkSize;
  color: WatermarkColor;
  /** 0.05 to 0.8: how solid it is. */
  opacity: number;
  /** 0-based pages, or `null` for every page. */
  pages: number[] | null;
};

export type ImageWatermark = {
  position: ImagePosition;
  /** Share of the page width the picture takes, 0.1 to 1. */
  widthShare: number;
  opacity: number;
  pages: number[] | null;
};

export const MAX_WATERMARK_CHARS = 60;
export const MIN_OPACITY = 0.05;
export const MAX_OPACITY = 0.8;
export const DEFAULT_TEXT_WATERMARK: TextWatermark = { text: 'CONFIDENTIAL', layout: 'diagonal', size: 'medium', color: 'grey', opacity: 0.25, pages: null };
export const DEFAULT_IMAGE_WATERMARK: ImageWatermark = { position: 'center', widthShare: 0.4, opacity: 0.3, pages: null };

export const WATERMARK_COLORS: Record<WatermarkColor, { label: string; rgb: [number, number, number]; css: string }> = {
  grey: { label: 'Grey', rgb: [0.45, 0.45, 0.45], css: 'rgb(115 115 115)' },
  red: { label: 'Red', rgb: [0.8, 0.12, 0.12], css: 'rgb(204 31 31)' },
  blue: { label: 'Blue', rgb: [0.1, 0.25, 0.7], css: 'rgb(26 64 179)' },
};

/** The part of a page's size the text's length may take. */
const SIZE_SHARE: Record<WatermarkSize, number> = { small: 0.35, medium: 0.55, large: 0.8 };

/** Letters the built-in font can draw: basic Latin, Latin-1 (accents) and a few common symbols. */
const DRAWABLE = /^[\x20-\x7E -ÿ–—‘’“”•€]*$/;

export function canDrawText(text: string): boolean {
  return DRAWABLE.test(text);
}

export type WatermarkCheck = { ok: true } | { ok: false; message: string };

export function checkTextWatermark(w: TextWatermark): WatermarkCheck {
  const text = w.text.trim();
  if (text === '') return { ok: false, message: 'Type the words to stamp on each page.' };
  if (text.length > MAX_WATERMARK_CHARS) return { ok: false, message: `Keep it to ${MAX_WATERMARK_CHARS} characters or fewer.` };
  if (!canDrawText(text)) return { ok: false, message: 'Watermarks can use English letters, numbers and common symbols for now. Hindi and other scripts aren’t supported yet.' };
  if (!(w.opacity >= MIN_OPACITY && w.opacity <= MAX_OPACITY)) return { ok: false, message: 'Pick how solid it should be.' };
  return { ok: true };
}

/**
 * Which pages: empty text means every page; otherwise ranges like "1-3, 5". Returns 0-based pages or a message.
 */
export function pagesForWatermark(text: string, pageCount: number): { ok: true; pages: number[] | null } | { ok: false; message: string } {
  if (text.trim() === '') return { ok: true, pages: null };
  const parsed = parsePageRanges(text, pageCount);
  if (!parsed.ok) return parsed;
  if (parsed.pages.length === 0) return { ok: false, message: 'Pick at least one page, or leave this empty for every page.' };
  return { ok: true, pages: parsed.pages };
}

/**
 * Font size so the text spans `SIZE_SHARE` of the room it has: the page diagonal when it runs diagonally,
 * the page width when it sits flat. `widthAt1pt` is the text's width at 1 pt (from the font).
 */
export function watermarkFontSize(widthAt1pt: number, shownWidth: number, shownHeight: number, layout: WatermarkLayout, size: WatermarkSize): number {
  const room = layout === 'diagonal' ? Math.hypot(shownWidth, shownHeight) : shownWidth;
  const fit = (room * SIZE_SHARE[size]) / Math.max(widthAt1pt, 0.01);
  return Math.max(8, Math.min(fit, 320));
}

export function checkImageWatermark(w: ImageWatermark): WatermarkCheck {
  if (!(w.widthShare >= 0.1 && w.widthShare <= 1)) return { ok: false, message: 'Pick a size for the picture.' };
  if (!(w.opacity >= MIN_OPACITY && w.opacity <= MAX_OPACITY)) return { ok: false, message: 'Pick how solid it should be.' };
  return { ok: true };
}

/** "Report" → "Report-watermarked.pdf" */
export function watermarkedPdfName(baseName: string): string {
  return `${baseName}-watermarked.pdf`;
}
