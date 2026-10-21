import { MAX_IMAGE_BYTES, type DetectedImage, type ImageToolDef } from './types';
import type { FormatId } from './registry/format-registry';
import {
  allDecodableAcceptString,
  extensionForFormatId,
  formatFromExtension,
  formatFromMime,
  labelForFormatId,
  mimeForFormatId,
} from './registry/capabilities';
import { userMessageForCode, type ImageErrorCode } from './errors';

export async function readFileHeader(file: File, length = 32): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

function matchesJpeg(header: Uint8Array): boolean {
  return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

function matchesPng(header: Uint8Array): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return sig.every((b, i) => header[i] === b);
}

function matchesWebp(header: Uint8Array): boolean {
  return (
    header.length >= 12 &&
    header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
  );
}

function matchesHeic(header: Uint8Array): boolean {
  if (header.length < 12) return false;
  const brand = String.fromCharCode(header[4], header[5], header[6], header[7]);
  if (brand !== 'ftyp') return false;
  const minor = String.fromCharCode(header[8], header[9], header[10], header[11]);
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].some((b) =>
    minor.startsWith(b.slice(0, 4)),
  );
}

function matchesAvif(header: Uint8Array): boolean {
  if (header.length < 12) return false;
  const brand = String.fromCharCode(header[4], header[5], header[6], header[7]);
  if (brand !== 'ftyp') return false;
  const minor = String.fromCharCode(header[8], header[9], header[10], header[11]);
  return minor === 'avif' || minor === 'avis';
}

function matchesGif(header: Uint8Array): boolean {
  return (
    header.length >= 6 &&
    header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 &&
    header[3] === 0x38 && (header[4] === 0x37 || header[4] === 0x39) && header[5] === 0x61
  );
}

function matchesBmp(header: Uint8Array): boolean {
  return header.length >= 2 && header[0] === 0x42 && header[1] === 0x4d;
}

function matchesTiff(header: Uint8Array): boolean {
  return (
    header.length >= 4 &&
    ((header[0] === 0x49 && header[1] === 0x49) || (header[0] === 0x4d && header[1] === 0x4d)) &&
    header[2] === 0x2a && header[3] === 0x00
  );
}

function matchesIco(header: Uint8Array): boolean {
  return header.length >= 4 && header[0] === 0 && header[1] === 0 && header[2] === 1 && header[3] === 0;
}

function looksLikeSvg(header: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(header.slice(0, 256)).trimStart();
  return text.startsWith('<svg') || text.startsWith('<?xml');
}

export function detectFormatFromHeader(header: Uint8Array): FormatId | null {
  if (matchesJpeg(header)) return 'jpeg';
  if (matchesPng(header)) return 'png';
  if (matchesGif(header)) return 'gif';
  if (matchesWebp(header)) return 'webp';
  if (matchesBmp(header)) return 'bmp';
  if (matchesIco(header)) return 'ico';
  if (matchesTiff(header)) return 'tiff';
  if (matchesHeic(header)) return 'heic';
  if (matchesAvif(header)) return 'avif';
  if (looksLikeSvg(header)) return 'svg';
  return null;
}

export function extensionOf(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return (parts.pop() ?? '').toLowerCase();
}

export function formatFromFilename(filename: string): FormatId | null {
  return formatFromExtension(extensionOf(filename));
}

export type DetectFileResult =
  | { ok: true; detected: DetectedImage }
  | { ok: false; code: ImageErrorCode; message: string };

export async function detectImageFile(file: File): Promise<DetectFileResult> {
  if (!file) {
    return { ok: false, code: 'empty-file', message: userMessageForCode('empty-file') };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, code: 'file-too-large', message: userMessageForCode('file-too-large') };
  }
  if (file.size === 0) {
    return { ok: false, code: 'empty-file', message: userMessageForCode('empty-file') };
  }

  const header = await readFileHeader(file);
  const fromHeader = detectFormatFromHeader(header);
  const fromMime = file.type ? formatFromMime(file.type) : null;
  const fromName = formatFromFilename(file.name);

  const format = fromHeader ?? fromMime ?? fromName;

  if (!format) {
    return { ok: false, code: 'unsupported-format', message: userMessageForCode('unsupported-format') };
  }

  // TIFF detected but not yet implemented — honest error.
  if (format === 'tiff') {
    return {
      ok: false,
      code: 'unsupported-format',
      message: 'TIFF support is coming soon. Try exporting as JPG or PNG first.',
    };
  }

  const mime = file.type || mimeForFormatId(format);

  return {
    ok: true,
    detected: { format, mime, bytes: file.size, name: file.name },
  };
}

export type ValidateFileResult =
  | { ok: true; detected: DetectedImage }
  | { ok: false; message: string };

export async function validateImageFile(file: File, tool: ImageToolDef): Promise<ValidateFileResult> {
  const result = await detectImageFile(file);
  if (!result.ok) return { ok: false, message: result.message };
  if (result.detected.format !== tool.from) {
    return {
      ok: false,
      message: `That looks like ${labelForFormat(result.detected.format)}, not ${tool.fromLabel}.`,
    };
  }
  return result;
}

export function mimeForFormat(format: FormatId): string {
  return mimeForFormatId(format);
}

export function extensionForFormat(format: FormatId): string {
  return extensionForFormatId(format);
}

export function labelForFormat(format: FormatId): string {
  return labelForFormatId(format);
}

export function acceptStringForFormat(_format: FormatId): string {
  return allDecodableAcceptString();
}

export function allInputAcceptString(): string {
  return allDecodableAcceptString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function outputFilename(inputName: string, toFormat: FormatId): string {
  const base = inputName.replace(/\.[^.]+$/, '') || 'image';
  const safe = base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120);
  return `${safe}.${extensionForFormatId(toFormat)}`;
}

export function sizeDeltaLabel(inputBytes: number, outputBytes: number): string {
  if (inputBytes === 0) return '';
  const ratio = outputBytes / inputBytes;
  if (ratio < 1) return `${Math.round((1 - ratio) * 100)}% smaller`;
  if (ratio > 1) return `${Math.round((ratio - 1) * 100)}% larger`;
  return 'Same size';
}
