import type { ConverterSlug, ImageFormat, ImageToolDef } from './types';
import { CONVERTER_SLUGS } from './types';
import { seoPathForSlug } from './routes';

const JPEG_MIME = ['image/jpeg'];
const PNG_MIME = ['image/png'];
const WEBP_MIME = ['image/webp'];
const HEIC_MIME = ['image/heic', 'image/heif'];
const AVIF_MIME = ['image/avif'];

function def(
  slug: ConverterSlug,
  from: ImageFormat,
  to: ImageFormat,
  copy: {
    name: string;
    title: string;
    h1: string;
    description: string;
    blurb: string;
    acceptedMime: readonly string[];
    acceptedExtensions: readonly string[];
  },
): ImageToolDef {
  const fromLabel = from === 'jpeg' ? 'JPG' : from.toUpperCase();
  const toLabel = to === 'jpeg' ? 'JPG' : to.toUpperCase();
  return {
    slug,
    path: seoPathForSlug(slug),
    from,
    to,
    fromLabel,
    toLabel,
    ...copy,
  };
}

export const IMAGE_TOOLS: Record<ConverterSlug, ImageToolDef> = {
  'jpg-to-png': def('jpg-to-png', 'jpeg', 'png', {
    name: 'JPG to PNG',
    title: 'Convert JPG to PNG',
    h1: 'Convert JPG to PNG',
    description:
      'Turn JPG images into PNG in your browser. No upload — your file stays on your device. Free, fast, and private.',
    blurb: 'Turn a JPG into a PNG without uploading anything.',
    acceptedMime: JPEG_MIME,
    acceptedExtensions: ['jpg', 'jpeg'],
  }),
  'png-to-jpg': def('png-to-jpg', 'png', 'jpeg', {
    name: 'PNG to JPG',
    title: 'Convert PNG to JPG',
    h1: 'Convert PNG to JPG',
    description:
      'Convert PNG images to smaller JPG files in your browser. Adjust quality, download instantly — nothing is uploaded.',
    blurb: 'Shrink a PNG into a JPG, right in your browser.',
    acceptedMime: PNG_MIME,
    acceptedExtensions: ['png'],
  }),
  'jpg-to-webp': def('jpg-to-webp', 'jpeg', 'webp', {
    name: 'JPG to WEBP',
    title: 'Convert JPG to WEBP',
    h1: 'Convert JPG to WEBP',
    description:
      'Convert JPG images to WEBP for smaller file sizes. Processed locally in your browser — free and private.',
    blurb: 'Lighter WEBP files from your JPGs, locally.',
    acceptedMime: JPEG_MIME,
    acceptedExtensions: ['jpg', 'jpeg'],
  }),
  'png-to-webp': def('png-to-webp', 'png', 'webp', {
    name: 'PNG to WEBP',
    title: 'Convert PNG to WEBP',
    h1: 'Convert PNG to WEBP',
    description:
      'Convert PNG images to WEBP in your browser. Smaller files for the web — your image never leaves your device.',
    blurb: 'PNG to WEBP, processed on your device.',
    acceptedMime: PNG_MIME,
    acceptedExtensions: ['png'],
  }),
  'webp-to-jpg': def('webp-to-jpg', 'webp', 'jpeg', {
    name: 'WEBP to JPG',
    title: 'Convert WEBP to JPG',
    h1: 'Convert WEBP to JPG',
    description:
      'Convert WEBP images to JPG in your browser. Open them anywhere — no upload, no account.',
    blurb: 'WEBP into a JPG everyone can open.',
    acceptedMime: WEBP_MIME,
    acceptedExtensions: ['webp'],
  }),
  'webp-to-png': def('webp-to-png', 'webp', 'png', {
    name: 'WEBP to PNG',
    title: 'Convert WEBP to PNG',
    h1: 'Convert WEBP to PNG',
    description:
      'Convert WEBP images to PNG in your browser. Lossless output, processed locally on your device.',
    blurb: 'WEBP to PNG, locally and privately.',
    acceptedMime: WEBP_MIME,
    acceptedExtensions: ['webp'],
  }),
  'heic-to-jpg': def('heic-to-jpg', 'heic', 'jpeg', {
    name: 'HEIC to JPG',
    title: 'Convert HEIC to JPG',
    h1: 'Convert HEIC to JPG',
    description:
      'Convert iPhone HEIC photos to JPG in your browser. Your photos stay on your device — nothing is uploaded to KaamSolv.',
    blurb: 'iPhone HEIC photos to JPG, on your device.',
    acceptedMime: HEIC_MIME,
    acceptedExtensions: ['heic', 'heif'],
  }),
  'heic-to-png': def('heic-to-png', 'heic', 'png', {
    name: 'HEIC to PNG',
    title: 'Convert HEIC to PNG',
    h1: 'Convert HEIC to PNG',
    description:
      'Convert HEIC photos to PNG in your browser. Private, local processing — your image is not uploaded.',
    blurb: 'HEIC to PNG without sending your photo anywhere.',
    acceptedMime: HEIC_MIME,
    acceptedExtensions: ['heic', 'heif'],
  }),
  'avif-to-jpg': def('avif-to-jpg', 'avif', 'jpeg', {
    name: 'AVIF to JPG',
    title: 'Convert AVIF to JPG',
    h1: 'Convert AVIF to JPG',
    description:
      'Convert AVIF images to JPG in your browser. Works locally — your file is not uploaded.',
    blurb: 'AVIF to JPG, processed in your browser.',
    acceptedMime: AVIF_MIME,
    acceptedExtensions: ['avif'],
  }),
  'avif-to-png': def('avif-to-png', 'avif', 'png', {
    name: 'AVIF to PNG',
    title: 'Convert AVIF to PNG',
    h1: 'Convert AVIF to PNG',
    description:
      'Convert AVIF images to PNG in your browser. Local processing, no upload, free to use.',
    blurb: 'AVIF to PNG on your device.',
    acceptedMime: AVIF_MIME,
    acceptedExtensions: ['avif'],
  }),
};

export const IMAGE_TOOL_LIST: ImageToolDef[] = CONVERTER_SLUGS.map((slug) => IMAGE_TOOLS[slug]);

export function getImageTool(slug: string): ImageToolDef | undefined {
  if ((CONVERTER_SLUGS as readonly string[]).includes(slug)) {
    return IMAGE_TOOLS[slug as ConverterSlug];
  }
  return undefined;
}

export function relatedImageTools(current: ConverterSlug, limit = 3): ImageToolDef[] {
  return IMAGE_TOOL_LIST.filter((t) => t.slug !== current).slice(0, limit);
}
