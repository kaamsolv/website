/**
 * Image Kit shared types.
 * Framework-free — no React, no Next.
 */
import type { ImageErrorCode } from './errors';
import type { FormatId } from './registry/format-registry';
import { getEncodableFormats } from './registry/capabilities';

export type { FormatId } from './registry/format-registry';

/** @deprecated Use FormatId */
export type ImageFormat = FormatId;

/** Output formats the engine can encode today. */
export const OUTPUT_FORMAT_IDS = getEncodableFormats().map((f) => f.id);
export type OutputFormat = (typeof OUTPUT_FORMAT_IDS)[number];

export const CONVERTER_SLUGS = [
  'jpg-to-png',
  'png-to-jpg',
  'jpg-to-webp',
  'png-to-webp',
  'webp-to-jpg',
  'webp-to-png',
  'heic-to-jpg',
  'heic-to-png',
  'avif-to-jpg',
  'avif-to-png',
] as const;

export type ConverterSlug = (typeof CONVERTER_SLUGS)[number];

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 50_000_000;

export const CONVERT_STAGES = [
  'preparing',
  'reading',
  'decoding',
  'processing',
  'encoding',
  'finalizing',
] as const;

export type ConvertStage = (typeof CONVERT_STAGES)[number];

export type ConvertProgress = {
  stage: ConvertStage;
  percent?: number;
  /** For future batch: "3 / 12 images" */
  batch?: { current: number; total: number };
};

export type ConversionPair = {
  from: FormatId;
  to: OutputFormat;
};

/** How the output image should be resized before encode. */
export type ResizeMode = 'original' | 'scale' | 'dimensions';

export type ResizeOptions = {
  mode: ResizeMode;
  /** Used when mode === 'scale'. 1–400. */
  scalePercent: number;
  /** Used when mode === 'dimensions'. Null = not set. */
  width: number | null;
  height: number | null;
  keepAspectRatio: boolean;
};

export const DEFAULT_RESIZE_OPTIONS: ResizeOptions = {
  mode: 'original',
  scalePercent: 100,
  width: null,
  height: null,
  keepAspectRatio: true,
};

export type ConvertOptions = {
  quality: number;
  jpegBackground: string;
  resize: ResizeOptions;
};

export const DEFAULT_CONVERT_OPTIONS: ConvertOptions = {
  quality: 0.92,
  jpegBackground: '#FFFFFF',
  resize: DEFAULT_RESIZE_OPTIONS,
};

export type ConvertOk = {
  ok: true;
  blob: Blob;
  outputMime: string;
  outputExtension: string;
  width: number;
  height: number;
  inputBytes: number;
  outputBytes: number;
};

export type ConvertFail = {
  ok: false;
  code: ImageErrorCode;
  message: string;
};

export type ConvertResult = ConvertOk | ConvertFail;

export type ImageToolDef = {
  slug: ConverterSlug;
  path: string;
  name: string;
  title: string;
  h1: string;
  description: string;
  blurb: string;
  from: FormatId;
  to: FormatId;
  fromLabel: string;
  toLabel: string;
  acceptedMime: readonly string[];
  acceptedExtensions: readonly string[];
};

export type DetectedImage = {
  format: FormatId;
  mime: string;
  bytes: number;
  name: string;
};

/** Future job model for batch / multi-step Image Kit operations. */
export type ImageJobKind = 'convert' | 'compress' | 'resize' | 'edit' | 'clean';

export type ImageJob = {
  id: string;
  kind: ImageJobKind;
  from: FormatId;
  to: FormatId;
  options: ConvertOptions;
};
