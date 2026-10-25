/**
 * Compress PDF — make the pictures inside a PDF smaller and leave everything
 * else alone, so text stays real (selectable, searchable) text.
 *
 *   1. Find every image we can safely rewrite: JPEG (DCTDecode) or 8-bit
 *      Flate/raw pixels, grey or RGB, with no masks or decode tricks.
 *   2. Shrink it to at most `maxDpi` of the *largest page* — a full-page scan
 *      at 300 DPI comes down to 150 DPI; small logos never get touched, since
 *      no image can show more detail than a full page at that DPI.
 *   3. Re-encode as JPEG and swap it in only if it's clearly smaller.
 *   4. Deflate any stream saved uncompressed, then save with object streams.
 *
 * The pixel work (decode → resize → JPEG) is injected as a `Reencoder`, so the
 * PDF walking and the decisions are unit-tested in Node
 * (test/pdf-compress.test.mts) and the browser supplies a canvas encoder
 * (`./canvas-reencoder.ts`). Runs in a Web Worker or on the main thread.
 */

import { unzlibSync, zlibSync } from 'fflate';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream } from '@cantoo/pdf-lib';

export { compressVerdict, compressedPdfName } from './outcome';

export type CompressSettings = { maxDpi: number; quality: number };

/** The free level: sharp on screen and in print-outs of forms, much smaller. */
export const STANDARD_COMPRESSION: CompressSettings = { maxDpi: 150, quality: 0.72 };

export type ImageSource =
  | { kind: 'jpeg'; bytes: Uint8Array; width: number; height: number; components: 1 | 3 }
  | { kind: 'pixels'; pixels: Uint8Array; width: number; height: number; components: 1 | 3 };

/** Decode → resize to `target` → JPEG bytes (always 3-channel). Null if it couldn't. */
export type Reencoder = (source: ImageSource, target: { width: number; height: number }, quality: number) => Promise<Uint8Array | null>;

export type CompressStats = {
  /** Images we looked at and could rewrite. */
  candidates: number;
  /** Images actually replaced by a smaller version. */
  imagesReplaced: number;
  /** Uncompressed streams we deflated. */
  streamsDeflated: number;
};

export type CompressResult = { bytes: Uint8Array; stats: CompressStats };

/** Longest image side, in pixels, that the largest page can show at `dpi`. */
export function pixelCapForPages(pageSizes: readonly { width: number; height: number }[], dpi: number): number {
  const longestPt = Math.max(0, ...pageSizes.map((p) => Math.max(Math.abs(p.width), Math.abs(p.height))));
  return Math.max(1, Math.ceil((longestPt / 72) * dpi));
}

/** Fit inside `cap` on the longest side, keeping the shape. Never upscales. */
export function fitWithin(width: number, height: number, cap: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= cap) return { width, height };
  const scale = cap / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Swap only for a real saving (≥ 10%), so we don't re-compress JPEGs for crumbs. */
export function worthReplacing(oldBytes: number, newBytes: number): boolean {
  return newBytes < oldBytes * 0.9;
}

/**
 * Lossless pixels that already deflate well are drawings, screenshots or
 * text — JPEG would smear them for little gain, so they stay as they are.
 * Photos and scans deflate poorly (often > 40% of raw).
 */
export function isPhotographic(compressedBytes: number, width: number, height: number, components: number): boolean {
  const raw = width * height * components;
  return raw > 0 && compressedBytes / raw > 0.25;
}

/**
 * Undo PNG row filters (Predictor 10–15) for 8-bit samples.
 * Returns null if the data doesn't add up.
 */
export function unpredictPng(data: Uint8Array, width: number, height: number, components: number): Uint8Array | null {
  const stride = width * components;
  if (data.length < (stride + 1) * height) return null;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[src + x];
      const left = x >= components ? out[row + x - components] : 0;
      const up = y > 0 ? out[prev + x] : 0;
      const upLeft = y > 0 && x >= components ? out[prev + x - components] : 0;
      let value: number;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: return null;
      }
      out[row + x] = value & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

const N = {
  Subtype: PDFName.of('Subtype'),
  Image: PDFName.of('Image'),
  Filter: PDFName.of('Filter'),
  DecodeParms: PDFName.of('DecodeParms'),
  Width: PDFName.of('Width'),
  Height: PDFName.of('Height'),
  BitsPerComponent: PDFName.of('BitsPerComponent'),
  ColorSpace: PDFName.of('ColorSpace'),
  Decode: PDFName.of('Decode'),
  ImageMask: PDFName.of('ImageMask'),
  Mask: PDFName.of('Mask'),
  SMask: PDFName.of('SMask'),
  Type: PDFName.of('Type'),
  Predictor: PDFName.of('Predictor'),
  Colors: PDFName.of('Colors'),
  Columns: PDFName.of('Columns'),
  DCTDecode: PDFName.of('DCTDecode'),
  FlateDecode: PDFName.of('FlateDecode'),
  DeviceRGB: PDFName.of('DeviceRGB'),
  DL: PDFName.of('DL'),
  F: PDFName.of('F'),
  N: PDFName.of('N'),
};

function filterNames(dict: PDFDict): string[] | null {
  const f = dict.lookup(N.Filter);
  if (f === undefined) return [];
  if (f instanceof PDFName) return [f.asString()];
  if (f instanceof PDFArray) {
    const names: string[] = [];
    for (let i = 0; i < f.size(); i++) {
      const n = f.lookup(i);
      if (!(n instanceof PDFName)) return null;
      names.push(n.asString());
    }
    return names;
  }
  return null;
}

function num(dict: PDFDict, key: PDFName): number | null {
  const v = dict.lookup(key);
  return v instanceof PDFNumber ? v.asNumber() : null;
}

/** 1 for grey, 3 for RGB, null for anything we leave alone (CMYK, indexed, spot…). */
function colourComponents(dict: PDFDict): 1 | 3 | null {
  const cs = dict.lookup(N.ColorSpace);
  if (cs instanceof PDFName) {
    const name = cs.asString();
    return name === '/DeviceRGB' ? 3 : name === '/DeviceGray' ? 1 : null;
  }
  if (cs instanceof PDFArray && cs.size() >= 2) {
    const family = cs.lookup(0);
    if (!(family instanceof PDFName)) return null;
    const name = family.asString();
    if (name === '/CalRGB') return 3;
    if (name === '/CalGray') return 1;
    if (name === '/ICCBased') {
      const profile = cs.lookup(1);
      const dict2 = profile instanceof PDFStream ? profile.dict : null;
      const n = dict2 ? num(dict2, N.N) : null;
      return n === 3 ? 3 : n === 1 ? 1 : null;
    }
  }
  return null;
}

type Candidate = { ref: PDFRef; stream: PDFRawStream; width: number; height: number; components: 1 | 3; kind: 'jpeg' | 'flate' | 'raw' };

/** Image XObjects we can rewrite without changing how the page looks. */
function findCandidates(doc: PDFDocument): Candidate[] {
  const objects = doc.context.enumerateIndirectObjects();

  // Soft masks are images too, but they're transparency, not pictures: leave them.
  const softMasks = new Set<string>();
  for (const [, obj] of objects) {
    const dict = obj instanceof PDFStream ? obj.dict : null;
    const smask = dict?.get(N.SMask);
    if (smask instanceof PDFRef) softMasks.add(smask.toString());
  }

  const found: Candidate[] = [];
  for (const [ref, obj] of objects) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.lookup(N.Subtype) !== N.Image) continue;
    if (softMasks.has(ref.toString())) continue;
    if (dict.has(N.Decode) || dict.has(N.Mask) || dict.has(N.F) || dict.lookup(N.ImageMask)?.toString() === 'true') continue;
    if (num(dict, N.BitsPerComponent) !== 8) continue;
    const width = num(dict, N.Width);
    const height = num(dict, N.Height);
    if (!width || !height || width < 16 || height < 16) continue;
    const components = colourComponents(dict);
    if (!components) continue;
    const filters = filterNames(dict);
    if (!filters || filters.length > 1) continue;
    const kind = filters.length === 0 ? 'raw' : filters[0] === '/DCTDecode' ? 'jpeg' : filters[0] === '/FlateDecode' ? 'flate' : null;
    if (!kind) continue;
    found.push({ ref, stream: obj, width, height, components, kind });
  }
  return found;
}

/** Raw 8-bit pixels of a Flate / unfiltered image, or null if we can't be sure of them. */
function readPixels(c: Candidate): Uint8Array | null {
  const expected = c.width * c.height * c.components;
  let data: Uint8Array;
  if (c.kind === 'raw') {
    data = c.stream.contents;
  } else {
    try {
      data = unzlibSync(c.stream.contents);
    } catch {
      return null;
    }
    const parms = c.stream.dict.lookup(N.DecodeParms);
    const predictor = parms instanceof PDFDict ? (num(parms, N.Predictor) ?? 1) : 1;
    if (predictor >= 10) {
      const colours = parms instanceof PDFDict ? (num(parms, N.Colors) ?? 1) : 1;
      const columns = parms instanceof PDFDict ? (num(parms, N.Columns) ?? 1) : 1;
      if (colours !== c.components || columns !== c.width) return null;
      const unfiltered = unpredictPng(data, c.width, c.height, c.components);
      if (!unfiltered) return null;
      data = unfiltered;
    } else if (predictor !== 1) {
      return null; // TIFF predictor: rare, leave it
    }
  }
  return data.length >= expected ? data.subarray(0, expected) : null;
}

function replaceWithJpeg(doc: PDFDocument, c: Candidate, jpeg: Uint8Array, width: number, height: number): void {
  const dict = c.stream.dict.clone(doc.context);
  dict.set(N.Filter, N.DCTDecode);
  dict.delete(N.DecodeParms);
  dict.delete(N.DL);
  dict.set(N.Width, PDFNumber.of(width));
  dict.set(N.Height, PDFNumber.of(height));
  dict.set(N.BitsPerComponent, PDFNumber.of(8));
  // Canvas JPEGs are always 3-channel; a grey image becomes grey-looking RGB.
  if (c.components === 1) dict.set(N.ColorSpace, N.DeviceRGB);
  doc.context.assign(c.ref, PDFRawStream.of(dict, jpeg));
}

const SKIP_DEFLATE_TYPES = new Set(['/XRef', '/ObjStm', '/Metadata']);

/** Deflate streams that were saved with no compression at all. */
function deflateUncompressedStreams(doc: PDFDocument): number {
  let count = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.has(N.Filter) || dict.has(N.DecodeParms) || dict.has(N.F)) continue;
    const type = dict.lookup(N.Type);
    if (type instanceof PDFName && SKIP_DEFLATE_TYPES.has(type.asString())) continue;
    if (obj.contents.length < 512) continue;
    const deflated = zlibSync(obj.contents, { level: 6 });
    if (!worthReplacing(obj.contents.length, deflated.length)) continue;
    const next = dict.clone(doc.context);
    next.set(N.Filter, N.FlateDecode);
    doc.context.assign(ref, PDFRawStream.of(next, deflated));
    count++;
  }
  return count;
}

export async function compressPdfBytes(
  input: Uint8Array,
  reencode: Reencoder,
  settings: CompressSettings = STANDARD_COMPRESSION,
  onProgress?: (done: number, total: number) => void,
): Promise<CompressResult> {
  const doc = await PDFDocument.load(input, { updateMetadata: false, parseSpeed: 1500 });
  const cap = pixelCapForPages(doc.getPages().map((p) => p.getSize()), settings.maxDpi);

  const candidates = findCandidates(doc);
  let imagesReplaced = 0;
  onProgress?.(0, candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const target = fitWithin(c.width, c.height, cap);
      let source: ImageSource | null = null;
      if (c.kind === 'jpeg') {
        source = { kind: 'jpeg', bytes: c.stream.contents, width: c.width, height: c.height, components: c.components };
      } else {
        const compressedSize = c.kind === 'raw' ? zlibSync(c.stream.contents, { level: 1 }).length : c.stream.contents.length;
        if (isPhotographic(compressedSize, c.width, c.height, c.components)) {
          const pixels = readPixels(c);
          if (pixels) source = { kind: 'pixels', pixels, width: c.width, height: c.height, components: c.components };
        }
      }
      if (source) {
        const jpeg = await reencode(source, target, settings.quality);
        if (jpeg && worthReplacing(c.stream.contents.length, jpeg.length)) {
          replaceWithJpeg(doc, c, jpeg, target.width, target.height);
          imagesReplaced++;
        }
      }
    } catch {
      // One odd image never fails the whole file — it just stays as it was.
    }
    onProgress?.(i + 1, candidates.length);
  }

  const streamsDeflated = deflateUncompressedStreams(doc);
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false, objectsPerTick: 1500 });
  return { bytes, stats: { candidates: candidates.length, imagesReplaced, streamsDeflated } };
}
