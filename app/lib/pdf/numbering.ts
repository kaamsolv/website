/**
 * Page numbers, as plain data: the choices people make, how a number is written, and which
 * pages get one. No PDF library here, so the page preview, the engine (stamp.ts) and the
 * unit tests all use the same rules (test/pdf-stamp.test.mts).
 */

export type NumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
export type NumberFormat = 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total';

export type NumberOptions = {
  position: NumberPosition;
  format: NumberFormat;
  /** The number written on the first numbered page. */
  startAt: number;
  /** 1-based first page that gets a number (pages before it, such as a cover, are left alone). */
  fromPage: number;
  /** Text height in points. */
  size: number;
};

export const DEFAULT_NUMBER_OPTIONS: NumberOptions = { position: 'bottom-center', format: 'n', startAt: 1, fromPage: 1, size: 11 };

export const NUMBER_POSITIONS: { value: NumberPosition; label: string }[] = [
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];
export const NUMBER_FORMATS: { value: NumberFormat; label: string }[] = [
  { value: 'n', label: '1' },
  { value: 'page-n', label: 'Page 1' },
  { value: 'n-of-total', label: '1 of 10' },
  { value: 'page-n-of-total', label: 'Page 1 of 10' },
];
export const NUMBER_SIZES: { value: number; label: string }[] = [
  { value: 9, label: 'Small' },
  { value: 11, label: 'Medium' },
  { value: 14, label: 'Large' },
];

export const MAX_START_NUMBER = 9999;

/** Distance from the edge of the page, in points (about 1 cm). */
export const EDGE_MARGIN = 28;

/** "Page 3 of 10" for the chosen format. `total` is the last number that will be written. */
export function formatPageLabel(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case 'n':
      return String(n);
    case 'page-n':
      return `Page ${n}`;
    case 'n-of-total':
      return `${n} of ${total}`;
    case 'page-n-of-total':
      return `Page ${n} of ${total}`;
  }
}

export type NumberCheck = { ok: true } | { ok: false; message: string };

/** Plain-words checks for what was typed, against the PDF's page count. */
export function checkNumberOptions(o: NumberOptions, pageCount: number): NumberCheck {
  if (!Number.isInteger(o.fromPage) || o.fromPage < 1 || o.fromPage > pageCount) {
    return { ok: false, message: `Start on a page from 1 to ${pageCount}.` };
  }
  if (!Number.isInteger(o.startAt) || o.startAt < 0 || o.startAt > MAX_START_NUMBER) {
    return { ok: false, message: `Start the numbering at a number from 0 to ${MAX_START_NUMBER}.` };
  }
  return { ok: true };
}

/** What is written on each page, in order, for the pages that get a number (`null` for pages that don't). */
export function planNumberLabels(o: NumberOptions, pageCount: number): (string | null)[] {
  const numbered = Math.max(0, pageCount - (o.fromPage - 1));
  const total = o.startAt + numbered - 1;
  return Array.from({ length: pageCount }, (_, i) => (i + 1 < o.fromPage ? null : formatPageLabel(o.format, o.startAt + (i + 1 - o.fromPage), total)));
}

/** "Report" → "Report-numbered.pdf" */
export function numberedPdfName(baseName: string): string {
  return `${baseName}-numbered.pdf`;
}
