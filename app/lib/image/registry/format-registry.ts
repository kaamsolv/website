/**
 * KaamSolv Image Kit — central format capability registry.
 *
 * Every known format is defined here once. UI, validation, pipeline, and SEO
 * routes query this registry — they do not hard-code format lists.
 *
 * Tier meanings:
 * - live: implemented and offered in the converter today
 * - architected: schema ready, codec not shipped yet
 * - deferred: valuable later, no false promises
 * - pro-only: may need server processing in future (never silent upload)
 */

export type FormatId =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'heic'
  | 'gif'
  | 'bmp'
  | 'tiff'
  | 'ico'
  | 'svg'
  | 'apng'
  | 'jxl'
  | 'jp2'
  | 'icns'
  | 'qoi'
  | 'tga'
  | 'psd'
  | 'psb'
  | 'eps'
  | 'ai'
  | 'xcf'
  | 'ora'
  | 'raw'
  | 'dng'
  | 'cr2'
  | 'cr3'
  | 'nef'
  | 'arw'
  | 'raf'
  | 'rw2'
  | 'orf'
  | 'exr'
  | 'hdr'
  | 'ppm'
  | 'pbm'
  | 'pgm'
  | 'pnm';

export type FormatTier = 'live' | 'architected' | 'deferred' | 'pro-only';

export type FormatKind = 'raster' | 'vector' | 'layered' | 'raw' | 'animated';

export type FormatGroup =
  | 'popular'
  | 'images'
  | 'vector-icons'
  | 'modern'
  | 'camera'
  | 'design'
  | 'professional';

export type DecoderKind = 'browser' | 'wasm-heic' | 'wasm-tiff' | 'rasterize-svg' | 'none';

export type EncoderKind = 'browser-canvas' | 'wasm-avif' | 'none';

export type FormatCapability = {
  id: FormatId;
  label: string;
  group: FormatGroup;
  kind: FormatKind;
  tier: FormatTier;
  /** Decode is implemented and available in the current engine. */
  canDecode: boolean;
  /** Encode is implemented and available in the current engine. */
  canEncode: boolean;
  decoder: DecoderKind;
  encoder: EncoderKind;
  browserDecode: boolean;
  wasmDecode: boolean;
  browserEncode: boolean;
  wasmEncode: boolean;
  animated: boolean;
  vector: boolean;
  transparency: boolean;
  preservesMetadata: boolean;
  extensions: readonly string[];
  mimeTypes: readonly string[];
};

function fmt(
  id: FormatId,
  label: string,
  group: FormatGroup,
  kind: FormatKind,
  tier: FormatTier,
  opts: Partial<FormatCapability> & Pick<FormatCapability, 'canDecode' | 'canEncode' | 'extensions' | 'mimeTypes'>,
): FormatCapability {
  return {
    id,
    label,
    group,
    kind,
    tier,
    decoder: opts.decoder ?? 'none',
    encoder: opts.encoder ?? 'none',
    browserDecode: opts.browserDecode ?? false,
    wasmDecode: opts.wasmDecode ?? false,
    browserEncode: opts.browserEncode ?? false,
    wasmEncode: opts.wasmEncode ?? false,
    animated: opts.animated ?? false,
    vector: opts.vector ?? false,
    transparency: opts.transparency ?? false,
    preservesMetadata: opts.preservesMetadata ?? false,
    canDecode: opts.canDecode,
    canEncode: opts.canEncode,
    extensions: opts.extensions,
    mimeTypes: opts.mimeTypes,
  };
}

/** All formats KaamSolv knows about — including deferred and pro-only. */
export const FORMAT_REGISTRY: Record<FormatId, FormatCapability> = {
  // ── Popular / live ──────────────────────────────────────────────
  jpeg: fmt('jpeg', 'JPG', 'popular', 'raster', 'live', {
    canDecode: true,
    canEncode: true,
    decoder: 'browser',
    encoder: 'browser-canvas',
    browserDecode: true,
    browserEncode: true,
    extensions: ['jpg', 'jpeg'],
    mimeTypes: ['image/jpeg'],
  }),
  png: fmt('png', 'PNG', 'popular', 'raster', 'live', {
    canDecode: true,
    canEncode: true,
    decoder: 'browser',
    encoder: 'browser-canvas',
    browserDecode: true,
    browserEncode: true,
    transparency: true,
    extensions: ['png'],
    mimeTypes: ['image/png'],
  }),
  webp: fmt('webp', 'WebP', 'popular', 'raster', 'live', {
    canDecode: true,
    canEncode: true,
    decoder: 'browser',
    encoder: 'browser-canvas',
    browserDecode: true,
    browserEncode: true,
    transparency: true,
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
  }),
  avif: fmt('avif', 'AVIF', 'popular', 'raster', 'live', {
    canDecode: true,
    canEncode: false,
    decoder: 'browser',
    encoder: 'none',
    browserDecode: true,
    transparency: true,
    extensions: ['avif'],
    mimeTypes: ['image/avif'],
  }),
  heic: fmt('heic', 'HEIC', 'popular', 'raster', 'live', {
    canDecode: true,
    canEncode: false,
    decoder: 'wasm-heic',
    encoder: 'none',
    wasmDecode: true,
    extensions: ['heic', 'heif'],
    mimeTypes: ['image/heic', 'image/heif'],
  }),

  // ── Images / live where reliable ────────────────────────────────
  gif: fmt('gif', 'GIF', 'images', 'animated', 'live', {
    canDecode: true,
    canEncode: false,
    decoder: 'browser',
    encoder: 'none',
    browserDecode: true,
    animated: true,
    transparency: true,
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
  }),
  apng: fmt('apng', 'APNG', 'images', 'animated', 'live', {
    canDecode: true,
    canEncode: false,
    decoder: 'browser',
    encoder: 'none',
    browserDecode: true,
    animated: true,
    transparency: true,
    extensions: ['apng', 'png'],
    mimeTypes: ['image/apng', 'image/png'],
  }),
  bmp: fmt('bmp', 'BMP', 'images', 'raster', 'live', {
    canDecode: true,
    canEncode: false,
    decoder: 'browser',
    encoder: 'none',
    browserDecode: true,
    extensions: ['bmp'],
    mimeTypes: ['image/bmp', 'image/x-ms-bmp'],
  }),
  tiff: fmt('tiff', 'TIFF', 'images', 'raster', 'architected', {
    canDecode: false,
    canEncode: false,
    decoder: 'wasm-tiff',
    encoder: 'none',
    extensions: ['tif', 'tiff'],
    mimeTypes: ['image/tiff'],
  }),

  // ── Vector & icons ──────────────────────────────────────────────
  svg: fmt('svg', 'SVG', 'vector-icons', 'vector', 'live', {
    canDecode: true,
    canEncode: false,
    decoder: 'rasterize-svg',
    encoder: 'none',
    browserDecode: true,
    vector: true,
    transparency: true,
    extensions: ['svg'],
    mimeTypes: ['image/svg+xml'],
  }),
  ico: fmt('ico', 'ICO', 'vector-icons', 'raster', 'live', {
    canDecode: true,
    canEncode: false,
    decoder: 'browser',
    encoder: 'none',
    browserDecode: true,
    transparency: true,
    extensions: ['ico'],
    mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon'],
  }),
  icns: fmt('icns', 'ICNS', 'vector-icons', 'raster', 'architected', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['icns'],
    mimeTypes: ['image/icns'],
  }),

  // ── Modern / architected ────────────────────────────────────────
  jxl: fmt('jxl', 'JPEG XL', 'modern', 'raster', 'architected', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['jxl'],
    mimeTypes: ['image/jxl'],
  }),
  jp2: fmt('jp2', 'JPEG 2000', 'modern', 'raster', 'architected', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['jp2', 'jpx'],
    mimeTypes: ['image/jp2'],
  }),
  qoi: fmt('qoi', 'QOI', 'modern', 'raster', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['qoi'],
    mimeTypes: ['image/qoi'],
  }),
  tga: fmt('tga', 'TGA', 'professional', 'raster', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['tga'],
    mimeTypes: ['image/tga'],
  }),

  // ── Design / layered ────────────────────────────────────────────
  psd: fmt('psd', 'PSD', 'design', 'layered', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['psd'],
    mimeTypes: ['image/vnd.adobe.photoshop'],
  }),
  psb: fmt('psb', 'PSB', 'design', 'layered', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['psb'],
    mimeTypes: ['image/vnd.adobe.photoshop'],
  }),
  eps: fmt('eps', 'EPS', 'design', 'vector', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    vector: true,
    extensions: ['eps'],
    mimeTypes: ['application/postscript', 'image/eps'],
  }),
  ai: fmt('ai', 'AI', 'design', 'vector', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    vector: true,
    extensions: ['ai'],
    mimeTypes: ['application/illustrator', 'application/pdf'],
  }),
  xcf: fmt('xcf', 'XCF', 'design', 'layered', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['xcf'],
    mimeTypes: ['image/x-xcf'],
  }),
  ora: fmt('ora', 'ORA', 'design', 'layered', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['ora'],
    mimeTypes: ['image/openraster'],
  }),

  // ── Camera / RAW ────────────────────────────────────────────────
  raw: fmt('raw', 'RAW', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['raw'],
    mimeTypes: ['image/x-raw'],
  }),
  dng: fmt('dng', 'DNG', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['dng'],
    mimeTypes: ['image/x-adobe-dng'],
  }),
  cr2: fmt('cr2', 'CR2', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['cr2'],
    mimeTypes: ['image/x-canon-cr2'],
  }),
  cr3: fmt('cr3', 'CR3', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['cr3'],
    mimeTypes: ['image/x-canon-cr3'],
  }),
  nef: fmt('nef', 'NEF', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['nef'],
    mimeTypes: ['image/x-nikon-nef'],
  }),
  arw: fmt('arw', 'ARW', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['arw'],
    mimeTypes: ['image/x-sony-arw'],
  }),
  raf: fmt('raf', 'RAF', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['raf'],
    mimeTypes: ['image/x-fuji-raf'],
  }),
  rw2: fmt('rw2', 'RW2', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['rw2'],
    mimeTypes: ['image/x-panasonic-rw2'],
  }),
  orf: fmt('orf', 'ORF', 'camera', 'raw', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['orf'],
    mimeTypes: ['image/x-olympus-orf'],
  }),

  // ── Professional / specialist ───────────────────────────────────
  exr: fmt('exr', 'EXR', 'professional', 'raster', 'pro-only', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['exr'],
    mimeTypes: ['image/aces', 'image/x-exr'],
  }),
  hdr: fmt('hdr', 'HDR', 'professional', 'raster', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['hdr'],
    mimeTypes: ['image/vnd.radiance'],
  }),
  ppm: fmt('ppm', 'PPM', 'professional', 'raster', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['ppm'],
    mimeTypes: ['image/x-portable-pixmap'],
  }),
  pbm: fmt('pbm', 'PBM', 'professional', 'raster', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['pbm'],
    mimeTypes: ['image/x-portable-bitmap'],
  }),
  pgm: fmt('pgm', 'PGM', 'professional', 'raster', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['pgm'],
    mimeTypes: ['image/x-portable-graymap'],
  }),
  pnm: fmt('pnm', 'PNM', 'professional', 'raster', 'deferred', {
    canDecode: false,
    canEncode: false,
    decoder: 'none',
    encoder: 'none',
    extensions: ['pnm'],
    mimeTypes: ['image/x-portable-anymap'],
  }),
};

export const ALL_FORMAT_IDS = Object.keys(FORMAT_REGISTRY) as FormatId[];
