import type { ConverterSlug } from './types';
import { CONVERTER_SLUGS } from './types';
import type { FormatId } from './registry/format-registry';

export function seoPathForSlug(slug: ConverterSlug): string {
  return `/${slug}`;
}

const PAIR_TO_SLUG: Record<string, ConverterSlug> = {
  'jpeg-png': 'jpg-to-png',
  'png-jpeg': 'png-to-jpg',
  'jpeg-webp': 'jpg-to-webp',
  'png-webp': 'png-to-webp',
  'webp-jpeg': 'webp-to-jpg',
  'webp-png': 'webp-to-png',
  'heic-jpeg': 'heic-to-jpg',
  'heic-png': 'heic-to-png',
  'avif-jpeg': 'avif-to-jpg',
  'avif-png': 'avif-to-png',
};

export function slugForPair(from: FormatId, to: FormatId): ConverterSlug | null {
  if (from === to) return null;
  return PAIR_TO_SLUG[`${from}-${to}`] ?? null;
}

export function isConverterSlug(slug: string): slug is ConverterSlug {
  return (CONVERTER_SLUGS as readonly string[]).includes(slug);
}
