import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { assertPdfBytes, hasPdfHeader, isEncryptedPdf, looksLikePdf, pdfBaseName } from '../app/lib/pdf/validate.ts';
import { PdfToolError, toPdfToolError } from '../app/lib/pdf/errors.ts';
import { layoutImagePage, jpegOrientation, A4, SMALL_MARGIN_PT } from '../app/lib/pdf/image-layout.ts';
import {
  BATCH_HARD_CAP,
  FREE_IMAGES_TO_PDF,
  FREE_MAX_FILE_BYTES,
  FREE_MERGE_FILES,
  PRO_MAX_FILE_BYTES,
  maxFileBytes,
  maxImagesToPdf,
  maxMergeFiles,
} from '../app/lib/pdf/limits.ts';
import { entitlementsFrom, NO_ENTITLEMENTS } from '../app/lib/entitlements.ts';

const enc = (s: string) => new TextEncoder().encode(s);

test('PDF header: at the start or after a little junk; not elsewhere', () => {
  assert.equal(hasPdfHeader(enc('%PDF-1.7\n...')), true);
  assert.equal(hasPdfHeader(enc(`${'x'.repeat(500)}%PDF-1.4`)), true);
  assert.equal(hasPdfHeader(enc(`${'x'.repeat(2000)}%PDF-1.4`)), false);
  assert.equal(hasPdfHeader(enc('\x89PNG\r\n')), false);
  assert.equal(hasPdfHeader(new Uint8Array()), false);
});

test('encrypted PDFs are spotted from the trailer, plain ones are not', async () => {
  const plain = await (await PDFDocument.create()).save();
  assert.equal(isEncryptedPdf(plain), false);

  const doc = await PDFDocument.create();
  doc.addPage();
  doc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' });
  const locked = await doc.save();
  assert.equal(isEncryptedPdf(locked), true);
  assert.equal(isEncryptedPdf(enc('%PDF-1.4\ntrailer\n<< /Root 1 0 R /Encrypt 5 0 R >>')), true);
});

test('assertPdfBytes: empty, too big, not a PDF, password', async () => {
  const code = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      return (e as PdfToolError).code;
    }
    return 'ok';
  };
  assert.equal(code(() => assertPdfBytes(new Uint8Array(), 10)), 'empty-file');
  assert.equal(code(() => assertPdfBytes(enc('%PDF-1.4 hello'), 5)), 'file-too-large');
  assert.equal(code(() => assertPdfBytes(enc('hello'), 100)), 'not-pdf');
  assert.equal(code(() => assertPdfBytes(enc('%PDF-1.4 /Encrypt 3 0 R'), 100)), 'encrypted');
  assert.equal(code(() => assertPdfBytes(enc('%PDF-1.4 fine'), 100)), 'ok');

  try {
    assertPdfBytes(new Uint8Array(FREE_MAX_FILE_BYTES + 1), FREE_MAX_FILE_BYTES);
  } catch (e) {
    assert.equal((e as Error).message, 'This PDF is over 10 MB. Free PDF tools work with files up to 10 MB each.');
  }
});

test('errors from libraries become calm messages', () => {
  assert.equal(toPdfToolError(Object.assign(new Error('x'), { name: 'PasswordException' })).code, 'encrypted');
  assert.equal(toPdfToolError(Object.assign(new Error('Invalid PDF structure.'), { name: 'InvalidPDFException' })).code, 'corrupted');
  assert.equal(toPdfToolError(new Error('Failed to parse PDF document')).code, 'corrupted');
  assert.equal(toPdfToolError(new Error('weird')).code, 'failed');
  const mine = new PdfToolError('not-pdf');
  assert.equal(toPdfToolError(mine), mine);
});

test('names', () => {
  assert.equal(pdfBaseName('Report Q3.PDF'), 'Report Q3');
  assert.equal(pdfBaseName('a/b:c?.pdf'), 'a_b_c_');
  assert.equal(pdfBaseName('.pdf'), 'document');
  assert.equal(looksLikePdf(new File([], 'x.pdf')), true);
  assert.equal(looksLikePdf(new File([], 'x', { type: 'application/pdf' })), true);
  assert.equal(looksLikePdf(new File([], 'x.jpg', { type: 'image/jpeg' })), false);
});

test('limits ask each key: free numbers today, Pro keys lift only their own limit', () => {
  const free = entitlementsFrom(NO_ENTITLEMENTS);
  assert.equal(maxFileBytes(free), FREE_MAX_FILE_BYTES);
  assert.equal(maxMergeFiles(free), FREE_MERGE_FILES);
  assert.equal(maxImagesToPdf(free), FREE_IMAGES_TO_PDF);
  assert.equal(FREE_MAX_FILE_BYTES, 10 * 1024 * 1024);

  const largeOnly = entitlementsFrom(['pdf_large_files']);
  assert.equal(maxFileBytes(largeOnly), PRO_MAX_FILE_BYTES);
  assert.equal(maxMergeFiles(largeOnly), FREE_MERGE_FILES, 'large files does not unlock merging');

  const merge = entitlementsFrom(['pdf_unlimited_merge', 'pdf_batch_convert']);
  assert.equal(maxMergeFiles(merge), BATCH_HARD_CAP);
  assert.equal(maxImagesToPdf(merge), BATCH_HARD_CAP);
  assert.equal(maxFileBytes(merge), FREE_MAX_FILE_BYTES);
});

test('A4 layout: fits inside the margin, centred; photo size keeps the shape', () => {
  const portrait = layoutImagePage(3000, 4000, 'a4', 'none');
  assert.equal(portrait.pageWidth, A4.width);
  assert.ok(portrait.width <= A4.width && portrait.height <= A4.height + 0.01);
  assert.ok(Math.abs(portrait.x - (A4.width - portrait.width) / 2) < 0.01);

  const land = layoutImagePage(4000, 3000, 'a4', 'small');
  assert.equal(land.pageWidth, A4.height);
  assert.ok(land.x >= SMALL_MARGIN_PT - 0.01 && land.y >= SMALL_MARGIN_PT - 0.01);

  const photo = layoutImagePage(1000, 500, 'photo', 'none');
  assert.equal(photo.pageWidth, A4.height);
  assert.equal(photo.pageHeight, Math.round((A4.height / 2) * 100) / 100);
  assert.throws(() => layoutImagePage(0, 10, 'a4', 'none'));
});

function exifJpeg(orientation: number, little: boolean): Uint8Array {
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) => (little ? [...u16(n & 0xffff), ...u16(n >>> 16)] : [...u16(n >>> 16), ...u16(n & 0xffff)]);
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

test('EXIF orientation is read in both byte orders; missing means upright', () => {
  assert.equal(jpegOrientation(exifJpeg(6, true)), 6);
  assert.equal(jpegOrientation(exifJpeg(8, false)), 8);
  assert.equal(jpegOrientation(exifJpeg(1, true)), 1);
  assert.equal(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), 1);
  assert.equal(jpegOrientation(enc('not a jpeg')), 1);
});

test('pdf.js runtime files in public/vendor/pdfjs match the installed pdfjs-dist', () => {
  const root = resolve(import.meta.dirname, '..');
  const pkg = resolve(root, 'node_modules/pdfjs-dist');
  const vendor = resolve(root, 'public/vendor/pdfjs');
  const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
  assert.equal(readFileSync(join(vendor, 'VERSION'), 'utf8').trim(), version, 'run `npm run pdfjs:sync` after upgrading pdfjs-dist');
  for (const dir of ['wasm', 'standard_fonts', 'iccs']) {
    for (const name of readdirSync(join(pkg, dir))) {
      if (name.startsWith('quickjs-eval') || !statSync(join(pkg, dir, name)).isFile()) continue;
      assert.deepEqual(readFileSync(join(vendor, dir, name)), readFileSync(join(pkg, dir, name)), `${dir}/${name} differs — run npm run pdfjs:sync`);
    }
  }
});
