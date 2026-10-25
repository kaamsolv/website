/**
 * First checks on a dropped file — before any PDF library loads. Framework-free
 * (unit-tested in test/pdf-validate.test.mts).
 */

import { PdfToolError } from './errors';
import { FREE_MAX_FILE_BYTES, sizeLimitLabel } from './limits';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/**
 * True when "%PDF-" appears in the first 1024 bytes. The spec allows junk
 * before the header, and readers accept it there — so we do too.
 */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < PDF_MAGIC.length; j++) if (bytes[i + j] !== PDF_MAGIC[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * True when a trailer or cross-reference stream names an /Encrypt dictionary.
 * Both are plain text even in compressed PDFs, so a byte scan is enough —
 * and it lets us refuse password-protected files before parsing them.
 */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  // latin1 keeps one char per byte; chunked so a 50 MB file doesn't build one giant string.
  const decoder = new TextDecoder('latin1');
  const CHUNK = 1 << 20;
  const OVERLAP = 32;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const text = decoder.decode(bytes.subarray(start, Math.min(bytes.length, start + CHUNK + OVERLAP)));
    if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(text)) return true;
  }
  return false;
}

function tooLarge(maxBytes: number, what = 'This PDF'): PdfToolError {
  const limit = sizeLimitLabel(maxBytes);
  const who = maxBytes === FREE_MAX_FILE_BYTES ? 'Free PDF tools work' : 'PDF tools work';
  return new PdfToolError('file-too-large', `${what} is over ${limit}. ${who} with files up to ${limit} each.`);
}

/** Size and type checks shared by every PDF tool. Throws a PdfToolError. */
export function assertPdfBytes(bytes: Uint8Array, maxBytes: number): void {
  if (bytes.length === 0) throw new PdfToolError('empty-file');
  if (bytes.length > maxBytes) throw tooLarge(maxBytes);
  if (!hasPdfHeader(bytes)) throw new PdfToolError('not-pdf');
  if (isEncryptedPdf(bytes)) throw new PdfToolError('encrypted');
}

/** Same size rule for images going into a PDF. */
export function assertImageSize(file: File, maxBytes: number): void {
  if (file.size === 0) throw new PdfToolError('empty-file');
  if (file.size > maxBytes) throw tooLarge(maxBytes, 'This image');
}

/** Reads a dropped file and runs the checks. Size is checked before reading. */
export async function readPdfFile(file: File, maxBytes: number): Promise<Uint8Array> {
  if (file.size > maxBytes) throw tooLarge(maxBytes);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertPdfBytes(bytes, maxBytes);
  return bytes;
}

/** "Report Q3.pdf" → "Report Q3"; safe for a download name. */
export function pdfBaseName(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '').replace(/\.[^.]+$/, '') || 'document';
  return base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120);
}

/** True for a file the PDF tools should treat as a PDF (by type or name; bytes are checked later). */
export function looksLikePdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
