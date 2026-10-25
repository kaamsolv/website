/**
 * Copies the pdf.js files the PDF tools load at run time into
 * public/vendor/pdfjs/ (served as static assets, never part of the Worker):
 *
 * - wasm/            JBIG2 and JPEG 2000 decoders (scanned PDFs), colour profiles
 * - standard_fonts/  the 14 standard PDF fonts, for PDFs that don't embed them
 * - iccs/            the CMYK profile
 *
 * Left out: quickjs-eval (PDF JavaScript — we never run it) and cmaps (only for
 * non-embedded Chinese/Japanese/Korean fonts; 1.5 MB).
 *
 * Run after upgrading pdfjs-dist: `npm run pdfjs:sync`.
 * test/pdf-assets.test.mts fails if the copies don't match node_modules.
 *
 * Run with Node's native TypeScript support: node scripts/sync-pdfjs-assets.mts
 */

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'node_modules/pdfjs-dist');
const dest = resolve(root, 'public/vendor/pdfjs');

export const PDFJS_ASSET_DIRS = ['wasm', 'standard_fonts', 'iccs'] as const;
export const skipAsset = (name: string) => name.startsWith('quickjs-eval');

rmSync(dest, { recursive: true, force: true });
for (const dir of PDFJS_ASSET_DIRS) {
  cpSync(resolve(src, dir), resolve(dest, dir), {
    recursive: true,
    filter: (path) => !skipAsset(path.split(/[\\/]/).pop() ?? ''),
  });
}
const { version } = JSON.parse(readFileSync(resolve(src, 'package.json'), 'utf8')) as { version: string };
writeFileSync(resolve(dest, 'VERSION'), `${version}\n`);
console.log(`pdf.js ${version} assets copied to public/vendor/pdfjs/`);
