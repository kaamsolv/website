import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * Sample files for tests/e2e/pdf.spec.ts, made fresh on every run (nothing
 * committed, nothing downloaded). Photos are drawn on a canvas in Chromium —
 * Node has no JPEG encoder — then pdf-lib builds the PDFs.
 */
export const FIXTURES = 'test-results/pdf-fixtures';

/** A photo-like JPEG: soft colour blobs plus grain, like a phone camera. */
export async function drawJpeg(
  page: Page,
  width: number,
  height: number,
  opts: { grey?: boolean; quality?: number; seed?: number; lines?: boolean } = {},
): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ width, height, grey, quality, seed, lines }) => {
      let s = seed;
      const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = grey ? '#f4f4f0' : '#88a';
      ctx.fillRect(0, 0, width, height);
      if (lines) {
        // A scanned page: rows of dark "words".
        ctx.fillStyle = '#222';
        for (let y = height * 0.08; y < height * 0.92; y += height / 40) {
          for (let x = width * 0.08; x < width * 0.9; ) {
            const w = width * (0.03 + rand() * 0.08);
            ctx.fillRect(x, y, w, height / 110);
            x += w + width * 0.015;
          }
        }
      } else {
        for (let i = 0; i < 60; i++) {
          const g = ctx.createRadialGradient(rand() * width, rand() * height, 0, rand() * width, rand() * height, width * (0.1 + rand() * 0.4));
          g.addColorStop(0, `hsla(${rand() * 360},70%,${30 + rand() * 50}%,0.8)`);
          g.addColorStop(1, 'hsla(0,0%,50%,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, width, height);
        }
      }
      const img = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - 0.5) * (lines ? 24 : 36);
        if (grey) {
          const v = 0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2] + n;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        } else {
          img.data[i] += n;
          img.data[i + 1] += n;
          img.data[i + 2] += n;
        }
      }
      ctx.putImageData(img, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { width, height, grey: !!opts.grey, quality: opts.quality ?? 0.92, seed: opts.seed ?? 7, lines: !!opts.lines },
  );
  return Buffer.from(b64, 'base64');
}

const A4: [number, number] = [595.28, 841.89];

async function pdfFromPhotos(photos: Buffer[], label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < photos.length; i++) {
    const page = doc.addPage(A4);
    const img = await doc.embedJpg(photos[i]);
    page.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
    page.drawText(`${label} page ${i + 1}`, { x: 40, y: 40, size: 14, font, color: rgb(1, 1, 1) });
  }
  return Buffer.from(await doc.save());
}

/** `pages` pages of text; page i says "<label> page i of n". */
export async function textPdf(label: string, pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage(A4);
    page.drawText(`${label} page ${i} of ${pages}`, { x: 60, y: 760, size: 20, font });
    for (let l = 0; l < 30; l++) page.drawText(`Line ${l + 1}: small problems, solved.`, { x: 60, y: 720 - l * 20, size: 11, font });
  }
  return Buffer.from(await doc.save());
}

export type Fixtures = Record<'photo' | 'scan' | 'doc12' | 'a2' | 'b3' | 'c1' | 'locked' | 'notPdf' | 'huge', string> & {
  images: string[];
};

export async function makeFixtures(page: Page): Promise<Fixtures> {
  mkdirSync(FIXTURES, { recursive: true });
  const put = (name: string, data: Buffer | Uint8Array) => {
    const path = join(FIXTURES, name);
    writeFileSync(path, data);
    return path;
  };

  // ~5 MB photo-heavy PDF: two full-page 300 DPI photos.
  const photos = [await drawJpeg(page, 2480, 3508, { seed: 11 }), await drawJpeg(page, 2480, 3508, { seed: 23 })];
  const photo = put('photos-5mb.pdf', await pdfFromPhotos(photos, 'Photo'));

  // A scanned document: three grey 300 DPI page images, no text layer.
  const scans = [];
  for (let i = 0; i < 3; i++) scans.push(await drawJpeg(page, 2480, 3508, { grey: true, lines: true, quality: 0.85, seed: 31 + i }));
  const scanDoc = await PDFDocument.create();
  for (const s of scans) scanDoc.addPage(A4).drawImage(await scanDoc.embedJpg(s), { x: 0, y: 0, width: A4[0], height: A4[1] });
  const scan = put('scanned.pdf', await scanDoc.save());

  const locked = await PDFDocument.create();
  locked.addPage(A4);
  locked.encrypt({ userPassword: 'secret', ownerPassword: 'owner' });

  const images: string[] = [];
  for (let i = 0; i < 6; i++) {
    images.push(put(`photo-${i + 1}.jpg`, await drawJpeg(page, i % 2 ? 1200 : 900, i % 2 ? 900 : 1200, { seed: 50 + i, quality: 0.85 })));
  }

  return {
    photo,
    scan,
    doc12: put('report-12-pages.pdf', await textPdf('Report', 12)),
    a2: put('a.pdf', await textPdf('Alpha', 2)),
    b3: put('b.pdf', await textPdf('Bravo', 3)),
    c1: put('c.pdf', await textPdf('Charlie', 1)),
    locked: put('locked.pdf', await locked.save()),
    notPdf: put('notes.pdf', Buffer.from('These are plain notes, not a PDF.\n'.repeat(20))),
    huge: put('huge.pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(11 * 1024 * 1024, 0x20)])),
    images,
  };
}
