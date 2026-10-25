/** Small PDFs and images built in memory for the PDF unit tests. */

import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';

/**
 * A JPEG that's only headers (SOI, SOF0, EOI). pdf-lib reads nothing else, so
 * it's enough to embed and to stand in for a real photo in Node.
 */
export function fakeJpeg(width: number, height: number, components: 1 | 3 = 3, padTo = 0): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 8 + components * 3, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, components];
  for (let c = 1; c <= components; c++) sof.push(c, 0x11, 0);
  const pad = Math.max(0, padTo - (2 + sof.length + 2));
  // A COM segment carries the padding, so "big" fake JPEGs stay valid.
  const com: number[] = [];
  for (let left = pad; left > 4; ) {
    const len = Math.min(65535, left - 2);
    com.push(0xff, 0xfe, len >> 8, len & 0xff, ...new Array(len - 2).fill(0x41));
    left -= len + 2;
  }
  return new Uint8Array([0xff, 0xd8, ...com, ...sof, 0xff, 0xd9]);
}

/** Pseudo-random bytes: noise deflates badly, like a photo. */
export function noise(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed || 1;
  for (let i = 0; i < length; i++) {
    // xorshift32 — a plain LCG's bytes repeat and deflate far too well.
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = (x >>> 24) & 0xff;
  }
  return out;
}

export type ImageSpec = {
  width: number;
  height: number;
  kind: 'jpeg' | 'flate' | 'raw';
  colorSpace?: 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK';
  pixels?: Uint8Array;
  extra?: Record<string, unknown>;
};

/** Adds an image XObject directly (no drawing needed for the compressor to find it). */
export function addImage(doc: PDFDocument, spec: ImageSpec) {
  const cs = spec.colorSpace ?? 'DeviceRGB';
  const comps = cs === 'DeviceGray' ? 1 : cs === 'DeviceCMYK' ? 4 : 3;
  const dict: Record<string, unknown> = {
    Type: 'XObject',
    Subtype: 'Image',
    Width: spec.width,
    Height: spec.height,
    BitsPerComponent: 8,
    ColorSpace: cs,
    ...spec.extra,
  };
  let stream: PDFRawStream;
  if (spec.kind === 'jpeg') {
    stream = doc.context.stream(fakeJpeg(spec.width, spec.height, comps === 1 ? 1 : 3, 40_000), { ...dict, Filter: 'DCTDecode' });
  } else {
    const pixels = spec.pixels ?? noise(spec.width * spec.height * comps);
    stream = spec.kind === 'flate' ? doc.context.stream(zlibSync(pixels), { ...dict, Filter: 'FlateDecode' }) : doc.context.stream(pixels, dict);
  }
  return doc.context.register(stream);
}

/** A PDF whose page i (0-based) is (200 + i) pt wide and says "Doc <label> page <i+1>". */
export async function labelledPdf(label: string, pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([200 + i, 300]);
    page.drawText(`Doc ${label} page ${i + 1}`, { x: 10, y: 150, size: 12, font });
  }
  return doc.save();
}

export const NAME = (s: string) => PDFName.of(s);
