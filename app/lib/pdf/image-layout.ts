/**
 * Page maths for JPG → PDF, in PDF points (1/72 inch). Framework-free
 * (unit-tested in test/pdf-layout.test.mts).
 */

export const A4 = { width: 595.28, height: 841.89 };

export type PageSizeMode = 'a4' | 'photo';
export type MarginMode = 'none' | 'small';

/** "Small" margin: about 1 cm. */
export const SMALL_MARGIN_PT = 28;

export type PageLayout = {
  pageWidth: number;
  pageHeight: number;
  /** Where the image is drawn, bottom-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * - `a4`: an A4 page, turned landscape for a landscape photo; the photo is
 *   scaled to fit inside the margins and centred.
 * - `photo`: the page takes the photo's shape, with its longer side as long
 *   as A4's (so a phone photo doesn't become a 50-inch page).
 */
export function layoutImagePage(imageWidth: number, imageHeight: number, size: PageSizeMode, margin: MarginMode): PageLayout {
  if (!(imageWidth > 0 && imageHeight > 0)) throw new RangeError('Image size must be positive');
  const m = margin === 'small' ? SMALL_MARGIN_PT : 0;
  const landscape = imageWidth > imageHeight;

  if (size === 'photo') {
    const scale = A4.height / Math.max(imageWidth, imageHeight);
    const width = round2(imageWidth * scale);
    const height = round2(imageHeight * scale);
    return { pageWidth: round2(width + 2 * m), pageHeight: round2(height + 2 * m), x: m, y: m, width, height };
  }

  const pageWidth = landscape ? A4.height : A4.width;
  const pageHeight = landscape ? A4.width : A4.height;
  const scale = Math.min((pageWidth - 2 * m) / imageWidth, (pageHeight - 2 * m) / imageHeight);
  const width = round2(imageWidth * scale);
  const height = round2(imageHeight * scale);
  return {
    pageWidth,
    pageHeight,
    x: round2((pageWidth - width) / 2),
    y: round2((pageHeight - height) / 2),
    width,
    height,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * EXIF orientation of a JPEG (1–8), or 1 when there is none. Phones store
 * photos sideways and set this flag; PDFs ignore it, so a photo with any value
 * other than 1 must be redrawn upright before it goes into a PDF.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return 1;
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) return 1; // image data / end: no EXIF before it
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1 && len >= 16 && isExifHeader(bytes, i + 4)) return readTiffOrientation(bytes, i + 10, i + 2 + len);
    i += 2 + len;
  }
  return 1;
}

function isExifHeader(b: Uint8Array, at: number): boolean {
  // "Exif\0\0"
  return b[at] === 0x45 && b[at + 1] === 0x78 && b[at + 2] === 0x69 && b[at + 3] === 0x66 && b[at + 4] === 0 && b[at + 5] === 0;
}

function readTiffOrientation(b: Uint8Array, tiff: number, end: number): number {
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  if (!little && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) return 1;
  const u16 = (at: number) => (little ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1]);
  const u32 = (at: number) => (little ? u16(at) + u16(at + 2) * 65536 : u16(at) * 65536 + u16(at + 2));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}
