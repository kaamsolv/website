/** Plain-English errors for the PDF tools — calm, and always saying what to do next. */

export type PdfErrorCode =
  | 'empty-file'
  | 'not-pdf'
  | 'file-too-large'
  | 'encrypted'
  | 'corrupted'
  | 'too-many-pages'
  | 'no-text'
  | 'unsupported-image'
  | 'image-failed'
  | 'memory-limit'
  | 'failed';

const MESSAGES: Record<PdfErrorCode, string> = {
  'empty-file': 'That file looks empty. Try another one.',
  'not-pdf': "That doesn't look like a PDF. Pick a file that ends in .pdf.",
  'file-too-large': 'That file is too large.',
  encrypted: 'This PDF has a password. Remove it in your PDF app first, then try again.',
  corrupted: "Couldn't read that PDF. It may be damaged or incomplete — try saving it again from the app that made it.",
  'too-many-pages': 'That PDF has too many pages to show here.',
  'no-text': "We couldn't find any text in this PDF. It's probably a scan or a photo of a page, which this tool can't read yet. A PDF saved from an app like Word or a browser works best.",
  'unsupported-image': "That image type isn't supported. Use JPG, PNG, WebP or HEIC.",
  'image-failed': "Couldn't open that image. Try exporting it again as JPG.",
  'memory-limit': 'Your device ran out of memory for this file. Close other tabs, or try a smaller file.',
  failed: 'Something went wrong. Try again, or refresh the page.',
};

export function pdfErrorMessage(code: PdfErrorCode): string {
  return MESSAGES[code];
}

/** A failure the UI can show as-is. */
export class PdfToolError extends Error {
  constructor(
    readonly code: PdfErrorCode,
    message: string = MESSAGES[code],
  ) {
    super(message);
    this.name = 'PdfToolError';
  }
}

/** Turn anything thrown by pdf.js / pdf-lib / the browser into a message for the user. */
export function toPdfToolError(err: unknown): PdfToolError {
  if (err instanceof PdfToolError) return err;
  const name = (err as { name?: string })?.name ?? '';
  const message = String((err as { message?: string })?.message ?? err ?? '');
  if (name === 'PasswordException' || /encrypt|password/i.test(message)) return new PdfToolError('encrypted');
  if (name === 'InvalidPDFException' || /invalid pdf|failed to parse|no pdf header/i.test(message)) {
    return new PdfToolError('corrupted');
  }
  if (name === 'RangeError' || /out of memory|allocation failed/i.test(message)) return new PdfToolError('memory-limit');
  return new PdfToolError('failed');
}
