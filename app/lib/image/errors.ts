export type ImageErrorCode =
  | 'empty-file'
  | 'file-too-large'
  | 'unsupported-format'
  | 'format-mismatch'
  | 'corrupted'
  | 'dimensions-too-large'
  | 'webp-unsupported'
  | 'heic-decode-failed'
  | 'avif-decode-failed'
  | 'encode-failed'
  | 'memory-limit'
  | 'browser-limit'
  | 'convert-failed'
  | 'worker-failed'
  | 'invalid-dimensions';

const MESSAGES: Record<ImageErrorCode, string> = {
  'empty-file': 'That file looks empty. Try another image.',
  'file-too-large': 'That file is too large. Keep it under 25 MB.',
  'unsupported-format': "That file type isn't supported. Use JPG, PNG, WebP, HEIC, or AVIF.",
  'format-mismatch': "That file doesn't match the selected input format. Pick the right format or choose another file.",
  'corrupted': "Couldn't read that image. It may be corrupted or incomplete.",
  'dimensions-too-large':
    'That image is very large. Try a smaller photo, or resize it before converting.',
  'webp-unsupported': "Your browser can't create WebP images. Try Chrome, Firefox, or Edge.",
  'heic-decode-failed':
    "Couldn't open that HEIC photo. Try exporting it from Photos, or convert to JPG on your phone first.",
  'avif-decode-failed':
    "Couldn't open that AVIF image. Your browser may not support AVIF decoding — try Chrome or Firefox.",
  'encode-failed': "Couldn't save the converted image. Try a different output format.",
  'memory-limit': 'Not enough memory for this image. Try a smaller file or close other tabs.',
  'browser-limit': "Your browser couldn't finish the conversion. Try updating it or using another browser.",
  'convert-failed': "Couldn't convert that image. Try another file or format.",
  'worker-failed': "Conversion hit a snag. Try again, or refresh the page.",
  'invalid-dimensions': 'Check your resize settings — width and height must be valid positive numbers.',
};

export function userMessageForCode(code: ImageErrorCode, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? MESSAGES['convert-failed'];
}

export function mapThrownError(err: unknown): { code: ImageErrorCode; message: string } {
  if (err instanceof Error) {
    const lower = err.message.toLowerCase();
    if (lower.includes('memory') || lower.includes('allocation')) {
      return { code: 'memory-limit', message: userMessageForCode('memory-limit') };
    }
    if (lower.includes('heic')) {
      return { code: 'heic-decode-failed', message: userMessageForCode('heic-decode-failed') };
    }
    if (lower.includes('avif')) {
      return { code: 'avif-decode-failed', message: userMessageForCode('avif-decode-failed') };
    }
    if (lower.includes('corrupt') || lower.includes("couldn't read")) {
      return { code: 'corrupted', message: userMessageForCode('corrupted') };
    }
    return { code: 'convert-failed', message: err.message };
  }
  return { code: 'convert-failed', message: userMessageForCode('convert-failed') };
}
