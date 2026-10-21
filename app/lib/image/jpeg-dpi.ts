/**
 * Write a DPI value into a JPEG's JFIF (APP0) header, so the file says
 * "300 dpi" and prints at the size the user asked for (e.g. 3.5 × 4.5 cm).
 * Pixels are untouched. Framework-free; works on raw bytes.
 */

const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"

function hasJfifAt(bytes: Uint8Array, offset: number): boolean {
  return JFIF.every((b, i) => bytes[offset + i] === b);
}

/** Returns a copy with JFIF density set to `dpi` (units = dots per inch). */
export function setJpegDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes; // not a JPEG

  // Existing APP0/JFIF right after SOI: patch units + densities in place.
  if (bytes[2] === 0xff && bytes[3] === 0xe0 && hasJfifAt(bytes, 6)) {
    const out = bytes.slice();
    out[13] = 1;
    out[14] = d >> 8;
    out[15] = d & 0xff;
    out[16] = d >> 8;
    out[17] = d & 0xff;
    return out;
  }

  // No JFIF header: insert a minimal one after SOI.
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, ...JFIF, 0x01, 0x01, 0x01, d >> 8, d & 0xff, d >> 8, d & 0xff, 0x00, 0x00,
  ]);
  const out = new Uint8Array(bytes.length + app0.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}

/** Read the DPI from a JFIF header, or null. */
export function readJpegDpi(bytes: Uint8Array): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes[3] !== 0xe0 || !hasJfifAt(bytes, 6)) return null;
  if (bytes[13] !== 1) return null;
  return (bytes[14] << 8) | bytes[15];
}
