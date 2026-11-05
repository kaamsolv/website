import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { PDFDocument } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { FIXTURES, textPdf } from './pdf-fixtures';

/**
 * PDF to PNG, PDF to Text and Add page numbers, end to end. Every download is opened again:
 * PNG signatures and sizes, the .txt content, and the numbered PDF read by pdf.js (page text and position).
 */
const SHOTS = 'test-results/screenshots';
let six: string;
let one: string;
let blank: string;

test.beforeAll(async () => {
  mkdirSync(FIXTURES, { recursive: true });
  const put = (name: string, data: Buffer | Uint8Array) => {
    const path = join(FIXTURES, name);
    writeFileSync(path, data);
    return path;
  };
  six = put('six.pdf', await textPdf('Six', 6));
  one = put('one.pdf', await textPdf('One', 1));
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]); // no text at all
  blank = put('blank.pdf', await doc.save());
});

const dropInput = (page: Page) => page.locator('input[type="file"]').first();
const alerts = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });
const pick = (page: Page, name: string | RegExp) => page.locator('label').filter({ has: page.getByRole('radio', { name }) }).click();

async function download(page: Page, name: string | RegExp) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

function watch(page: Page) {
  const problems: string[] = [];
  const sent: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('request', (r) => ['POST', 'PUT', 'PATCH'].includes(r.method()) && sent.push(`${r.method()} ${r.url()}`));
  return { problems, sent };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Width and height from a PNG's IHDR chunk. */
const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
};

/** Text and position of every run, as drawn (pdf.js applies page turns). */
async function shown(bytes: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  const out: { page: number; str: string; x: number; y: number; width: number; pageWidth: number; pageHeight: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const [va, vb, vc, vd, ve, vf] = vp.transform;
    for (const item of (await p.getTextContent()).items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , , e, f] = item.transform;
      out.push({ page: n, str: item.str, x: va * e + vc * f + ve, y: vb * e + vd * f + vf, width: item.width, pageWidth: vp.width, pageHeight: vp.height });
    }
  }
  await doc.loadingTask.destroy();
  return out;
}

test('PDF to PNG: six pages become six real PNGs at 150 DPI in one ZIP, and nothing is uploaded', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await page.goto('/pdf-to-png');
  await dropInput(page).setInputFiles(six);
  await expect(page.getByText(/so the files are larger than JPG/)).toBeVisible();
  await page.getByRole('button', { name: 'Convert 6 pages to PNG' }).click();
  await expect(page.getByText('Done. 6 PNGs are ready.')).toBeVisible({ timeout: 90_000 });
  const zipFile = await download(page, 'Download all (ZIP)');
  expect(zipFile.name).toBe('six-png.zip');
  const zip = unzipSync(new Uint8Array(zipFile.bytes));
  expect(Object.keys(zip).sort()).toEqual([1, 2, 3, 4, 5, 6].map((n) => `six-page-${n}.png`));
  for (const [name, data] of Object.entries(zip)) {
    expect([...data.subarray(0, 8)], `${name} is a PNG`).toEqual(PNG_SIGNATURE);
    expect(pngSize(data), name).toEqual({ width: 1240, height: 1754 });
    expect(data.length, `${name} has real content`).toBeGreaterThan(8_000);
  }
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('PDF to PNG: a one-page PDF gives a single PNG file', async ({ page }) => {
  await page.goto('/pdf-to-png');
  await dropInput(page).setInputFiles(one);
  await page.getByRole('button', { name: 'Convert 1 page to PNG' }).click();
  await expect(page.getByText('Done. Your PNG is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PNG');
  expect(out.name).toBe('one-page-1.png');
  expect([...out.bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
});

test('PDF to Text: the words come out in order, Download gives a .txt, page marks are optional, Copy works', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const w = watch(page);
  await page.goto('/pdf-to-text');
  await dropInput(page).setInputFiles(six);
  await page.getByRole('button', { name: 'Get the text from 6 pages' }).click();
  await expect(page.getByText('Done. Your text is ready.')).toBeVisible({ timeout: 60_000 });
  const preview = page.locator('#pdf-text-preview');
  const text = await preview.inputValue();
  expect(text).toContain('Six page 1 of 6');
  expect(text).toContain('Line 3: small problems, solved.');
  expect(text.indexOf('Six page 1 of 6')).toBeLessThan(text.indexOf('Six page 6 of 6'));
  expect(text).not.toContain('----- Page');
  await page.screenshot({ path: `${SHOTS}/pdf-to-text-desktop.png`, fullPage: true });

  const file = await download(page, 'Download .txt');
  expect(file.name).toBe('six.txt');
  expect(file.bytes.toString('utf8')).toBe(text);

  await page.getByRole('button', { name: 'Copy text' }).click();
  await expect(page.getByText('Copied.')).toBeVisible();
  // Windows turns line endings into CRLF on the clipboard; the words and breaks are what matter.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split(String.fromCharCode(13)).join('')).toBe(text);

  await page.getByRole('button', { name: 'Convert another' }).click();
  await dropInput(page).setInputFiles(six);
  await pick(page, 'Mark each page');
  await page.getByRole('button', { name: 'Get the text from 6 pages' }).click();
  await expect(page.getByText('Done. Your text is ready.')).toBeVisible({ timeout: 60_000 });
  const marked = await page.locator('#pdf-text-preview').inputValue();
  expect(marked).toMatch(/^----- Page 1 -----/);
  expect(marked).toContain('----- Page 6 -----');
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('PDF to Text: a PDF with no text says so plainly', async ({ page }) => {
  await page.goto('/pdf-to-text');
  await dropInput(page).setInputFiles(blank);
  await page.getByRole('button', { name: 'Get the text from 1 page' }).click();
  await expect(alerts(page)).toContainText("We couldn't find any text in this PDF.");
  await expect(page.getByText('Done. Your text is ready.')).toHaveCount(0);
});

test('page numbers: the preview follows the choices, the saved PDF has exactly those numbers in that corner', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await page.goto('/add-page-numbers-to-pdf');
  await dropInput(page).setInputFiles(six);
  const label = page.getByTestId('number-preview-label');
  await expect(label).toHaveText('1');

  await pick(page, 'Bottom right');
  await pick(page, 'Page 1 of 10');
  await expect(label).toHaveText('Page 1 of 6');
  await page.getByLabel('Start on page').fill('2');
  await page.getByLabel('Start numbering at').fill('5');
  await expect(label).toHaveText('Page 5 of 9');
  await expect(page.getByText('Pages 1 to 1 are left without a number. Page 2 gets 5.')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/pdf-numbers-desktop.png`, fullPage: true });

  await page.getByRole('button', { name: 'Add page numbers' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Numbers added to 5 pages.')).toBeVisible();
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('six-numbered.pdf');
  const runs = await shown(out.bytes);
  expect(runs.filter((r) => r.page === 1 && r.str.startsWith('Page '))).toHaveLength(0); // the first page is left alone
  for (let p = 2; p <= 6; p++) {
    const num = runs.find((r) => r.page === p && r.str === `Page ${p + 3} of 9`);
    expect(num, `page ${p} says Page ${p + 3} of 9`).toBeTruthy();
    expect(Math.abs(num!.x + num!.width - (num!.pageWidth - 28)), 'right edge about 1 cm in').toBeLessThan(1.5);
    expect(Math.abs(num!.y - (num!.pageHeight - 28)), 'about 1 cm from the bottom').toBeLessThan(1.5);
  }
  // Their own text is still there.
  expect(runs.some((r) => r.page === 3 && r.str.includes('Six page 3 of 6'))).toBe(true);
  expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(6);
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('page numbers: settings that make no sense are explained and stop the button', async ({ page }) => {
  await page.goto('/add-page-numbers-to-pdf');
  await dropInput(page).setInputFiles(six);
  await page.getByLabel('Start on page').fill('9');
  await expect(alerts(page)).toContainText('Start on a page from 1 to 6.');
  await expect(page.getByRole('button', { name: 'Add page numbers' })).toBeDisabled();
  await page.getByLabel('Start on page').fill('');
  await expect(page.getByRole('button', { name: 'Add page numbers' })).toBeDisabled();
  await page.getByLabel('Start on page').fill('1');
  await page.getByLabel('Start numbering at').fill('');
  await expect(alerts(page)).toContainText('Start the numbering at a number from 0 to 9999.');
  await page.getByLabel('Start numbering at').fill('0');
  await expect(page.getByRole('button', { name: 'Add page numbers' })).toBeEnabled();
});

test('the picker lists the new tools and moving between them keeps the file', async ({ page }) => {
  await page.goto('/pdf-to-png');
  await dropInput(page).setInputFiles(six);
  await expect(page.getByRole('radio', { name: 'Convert', exact: true })).toBeChecked();
  await pick(page, /PDF to Text/);
  await expect(page).toHaveURL(/\/pdf-to-text$/);
  await expect(page.getByRole('button', { name: 'Get the text from 6 pages' })).toBeVisible();
  await pick(page, 'Secure & enhance');
  await pick(page, /Page numbers/);
  await expect(page).toHaveURL(/\/add-page-numbers-to-pdf$/);
  await expect(page.getByRole('button', { name: 'Add page numbers' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [360, 320]) {
    test(`phone ${width} px ${scheme}: numbers, text result and PNG panel fit`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 800 });
      const w = watch(page);
      const noSideways = async (what: string) =>
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll: ${what}`).toBe(true);

      await page.goto('/add-page-numbers-to-pdf');
      await dropInput(page).setInputFiles(six);
      await expect(page.getByTestId('number-preview-label')).toBeVisible({ timeout: 30_000 });
      await noSideways('page numbers');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${SHOTS}/pdf-numbers-${width}-${scheme}.png`, fullPage: true });
      for (const name of ['Add page numbers']) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box!.height, name).toBeGreaterThanOrEqual(44);
      }

      await page.goto('/pdf-to-text');
      await dropInput(page).setInputFiles(six);
      await page.getByRole('button', { name: 'Get the text from 6 pages' }).click();
      await expect(page.getByText('Done. Your text is ready.')).toBeVisible({ timeout: 60_000 });
      await noSideways('text result');
      await page.screenshot({ path: `${SHOTS}/pdf-text-${width}-${scheme}.png`, fullPage: true });

      await page.goto('/pdf-to-png');
      await dropInput(page).setInputFiles(six);
      await expect(page.getByRole('button', { name: 'Convert 6 pages to PNG' })).toBeVisible();
      await noSideways('png panel');
      expect(w.problems).toEqual([]);
    });
  }
}
