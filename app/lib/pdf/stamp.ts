/**
 * Writing on pages with pdf-lib: page numbers (and, next, watermarks). The text is drawn so it
 * reads upright however the page is turned (/Rotate), and inside the page's visible box
 * (the crop box), not a corner of some larger sheet. Works in Node, so it is unit-tested
 * against real PDFs in test/pdf-stamp.test.mts.
 */

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import { PdfToolError } from './errors';
import { EDGE_MARGIN, checkNumberOptions, planNumberLabels, type NumberOptions, type NumberPosition } from './numbering';
import { WATERMARK_COLORS, checkImageWatermark, checkTextWatermark, watermarkFontSize, type ImageWatermark, type TextWatermark } from './watermark';

export { EDGE_MARGIN };

const LOAD = { updateMetadata: false, parseSpeed: 1500 } as const;
const SAVE = { useObjectStreams: true, objectsPerTick: 1500 } as const;

/**
 * Where to draw `text` so it appears with its baseline starting at (dx, dy) of the page *as shown*
 * (origin bottom-left, y up), whatever the page's /Rotate is. Returns the point and angle in the
 * page's own, unturned space.
 */
export function placeUpright(
  box: { x: number; y: number; width: number; height: number },
  turn: number,
  dx: number,
  dy: number,
): { x: number; y: number; angle: number } {
  const w = box.width;
  const h = box.height;
  switch (((turn % 360) + 360) % 360) {
    case 90:
      return { x: box.x + (w - dy), y: box.y + dx, angle: 90 };
    case 180:
      return { x: box.x + (w - dx), y: box.y + (h - dy), angle: 180 };
    case 270:
      return { x: box.x + dy, y: box.y + (h - dx), angle: 270 };
    default:
      return { x: box.x + dx, y: box.y + dy, angle: 0 };
  }
}

/** The visible size of the page once turned: sideways pages swap width and height. */
export function shownSize(box: { width: number; height: number }, turn: number): { width: number; height: number } {
  return Math.abs(turn) % 180 === 90 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

/** Left edge of a piece of text of `textWidth` points for the chosen side, inside the shown page. */
export function alignedX(position: NumberPosition, shownWidth: number, textWidth: number): number {
  if (position.endsWith('left')) return EDGE_MARGIN;
  if (position.endsWith('right')) return shownWidth - EDGE_MARGIN - textWidth;
  return (shownWidth - textWidth) / 2;
}

function drawLabel(page: PDFPage, font: PDFFont, text: string, position: NumberPosition, size: number) {
  const box = page.getCropBox();
  const turn = page.getRotation().angle;
  const shown = shownSize(box, turn);
  const textWidth = font.widthOfTextAtSize(text, size);
  const dx = alignedX(position, shown.width, textWidth);
  const dy = position.startsWith('top') ? shown.height - EDGE_MARGIN - size * 0.72 : EDGE_MARGIN;
  const at = placeUpright(box, turn, dx, dy);
  page.drawText(text, { x: at.x, y: at.y, size, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(at.angle) });
}

/** Writes a number on each page from `fromPage` on. Everything else about the PDF is left as it was. */
export async function addPageNumbers(input: Uint8Array, options: NumberOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input, LOAD);
  const pages = doc.getPages();
  const check = checkNumberOptions(options, pages.length);
  if (!check.ok) throw new PdfToolError('failed', check.message);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const labels = planNumberLabels(options, pages.length);
  pages.forEach((page, i) => {
    const label = labels[i];
    if (label !== null) drawLabel(page, font, label, options.position, options.size);
  });
  doc.setProducer('KaamSolv (kaamsolv.com)');
  return doc.save(SAVE);
}

// ───────────────────────────── watermarks ─────────────────────────────

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Stamps the words across each chosen page: diagonal or flat, centred, see-through. Latin letters only (built-in font). */
export async function addTextWatermark(input: Uint8Array, w: TextWatermark): Promise<Uint8Array> {
  const check = checkTextWatermark(w);
  if (!check.ok) throw new PdfToolError('failed', check.message);
  const doc = await PDFDocument.load(input, LOAD);
  const pages = doc.getPages();
  const wanted = w.pages ?? pages.map((_, i) => i);
  if (wanted.some((i) => !pages[i])) throw new PdfToolError('failed', 'That page isn’t in this PDF.');
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = w.text.trim();
  const widthAt1 = font.widthOfTextAtSize(text, 1);
  const [r, g, b] = WATERMARK_COLORS[w.color].rgb;
  const angle = w.layout === 'diagonal' ? 45 : 0;
  for (const i of wanted) {
    const page = pages[i];
    const box = page.getCropBox();
    const turn = page.getRotation().angle;
    const shown = shownSize(box, turn);
    const size = watermarkFontSize(widthAt1, shown.width, shown.height, w.layout, w.size);
    const textWidth = widthAt1 * size;
    const capHeight = size * CAP_HEIGHT;
    const t = rad(angle);
    // The text's baseline start, so that the middle of the words (half the width, half the capital height) is the page's middle.
    const dx = shown.width / 2 - (textWidth / 2) * Math.cos(t) + (capHeight / 2) * Math.sin(t);
    const dy = shown.height / 2 - (textWidth / 2) * Math.sin(t) - (capHeight / 2) * Math.cos(t);
    const at = placeUpright(box, turn, dx, dy);
    page.drawText(text, { x: at.x, y: at.y, size, font, color: rgb(r, g, b), opacity: w.opacity, rotate: degrees((at.angle + angle) % 360) });
  }
  doc.setProducer('KaamSolv (kaamsolv.com)');
  return doc.save(SAVE);
}

/** Capital letters of Helvetica stand about this tall, as a share of the font size. */
export const CAP_HEIGHT = 0.72;

/** Places a picture on each chosen page, see-through, upright however the page is turned. JPG or PNG bytes. */
export async function addImageWatermark(input: Uint8Array, image: { type: 'jpeg' | 'png'; bytes: Uint8Array }, w: ImageWatermark): Promise<Uint8Array> {
  const check = checkImageWatermark(w);
  if (!check.ok) throw new PdfToolError('failed', check.message);
  const doc = await PDFDocument.load(input, LOAD);
  const pages = doc.getPages();
  const wanted = w.pages ?? pages.map((_, i) => i);
  if (wanted.some((i) => !pages[i])) throw new PdfToolError('failed', 'That page isn’t in this PDF.');
  const embedded = image.type === 'jpeg' ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes);
  for (const i of wanted) {
    const page = pages[i];
    const box = page.getCropBox();
    const turn = page.getRotation().angle;
    const shown = shownSize(box, turn);
    // Width from the share asked for, but never taller than the page allows.
    const scale = Math.min((shown.width * w.widthShare) / embedded.width, (shown.height * 0.9) / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    const left = w.position.endsWith('left');
    const right = w.position.endsWith('right');
    const dx = left ? EDGE_MARGIN : right ? shown.width - EDGE_MARGIN - width : (shown.width - width) / 2;
    const dy = w.position === 'center' ? (shown.height - height) / 2 : w.position.startsWith('top') ? shown.height - EDGE_MARGIN - height : EDGE_MARGIN;
    const at = placeUpright(box, turn, dx, dy);
    page.drawImage(embedded, { x: at.x, y: at.y, width, height, rotate: degrees(at.angle), opacity: w.opacity });
  }
  doc.setProducer('KaamSolv (kaamsolv.com)');
  return doc.save(SAVE);
}
