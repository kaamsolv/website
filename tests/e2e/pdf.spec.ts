import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeFixtures, type Fixtures } from './pdf-fixtures';

/**
 * PDF tools, end to end with real files (made fresh by pdf-fixtures.ts): each
 * tool runs in the browser, the download is checked as a real PDF / JPG / ZIP.
 */
const SHOTS = 'test-results/screenshots';
let fx: Fixtures;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  fx = await makeFixtures(page);
  await page.close();
});

/** Alerts with text — Next.js also renders an empty route-announcer alert. */
const alerts = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });
const dropInput = (page: Page) => page.locator('input[type="file"]').first();
/** Pick an option the way a person does: by clicking its label (the radio itself is visually hidden). */
const pick = (page: Page, name: string | RegExp) => page.locator('label').filter({ has: page.getByRole('radio', { name }) }).click();

async function pdfInfo(bytes: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    texts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  const pages = doc.numPages;
  await doc.loadingTask.destroy();
  return { pages, texts };
}

async function download(page: Page, name: string | RegExp) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('compress: a 5 MB photo PDF comes out smaller, still a valid PDF with its text', async ({ page }) => {
  const errors = watchErrors(page);
  const inputBytes = statSync(fx.photo).size;
  expect(inputBytes, 'fixture is a ~5 MB PDF').toBeGreaterThan(4 * 1024 * 1024);
  expect(inputBytes).toBeLessThan(10 * 1024 * 1024);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/compress-pdf');
  await dropInput(page).setInputFiles(fx.photo);
  await expect(page.getByText('2 pages ·')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/pdf-compress-ready-desktop-light.png`, fullPage: true });

  await page.getByRole('button', { name: 'Compress PDF' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/pictures made smaller/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/pdf-compress-done-desktop-light.png`, fullPage: true });

  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('photos-5mb-compressed.pdf');
  expect(out.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(out.bytes.length).toBeLessThan(inputBytes);
  const info = await pdfInfo(out.bytes);
  expect(info.pages).toBe(2);
  expect(info.texts[0]).toContain('Photo page 1');
  console.log(`[pdf] compress photos: ${inputBytes} → ${out.bytes.length} bytes`);
  expect(errors).toEqual([]);
});

test('compress: a scanned PDF shrinks; a text-only PDF is left alone', async ({ page }) => {
  await page.goto('/compress-pdf');
  await dropInput(page).setInputFiles(fx.scan);
  await page.getByRole('button', { name: 'Compress PDF' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  const inputBytes = statSync(fx.scan).size;
  expect(out.bytes.length).toBeLessThan(inputBytes);
  expect((await pdfInfo(out.bytes)).pages).toBe(3);
  console.log(`[pdf] compress scan: ${inputBytes} → ${out.bytes.length} bytes`);

  await page.getByRole('button', { name: 'Compress another' }).click();
  await dropInput(page).setInputFiles(fx.doc12);
  await page.getByRole('button', { name: 'Compress PDF' }).click();
  await expect(page.getByText('This PDF is already about as small as it gets.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Download PDF' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compress PDF' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Compress another' }).click();
  await expect(dropInput(page)).toBeAttached();
});

test('merge: three PDFs, reordered, in one file; a fourth is refused', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/merge-pdf');
  await dropInput(page).setInputFiles([fx.a2, fx.b3, fx.c1]);
  await expect(page.getByRole('list', { name: 'PDFs to merge' }).getByRole('listitem')).toHaveCount(3, { timeout: 30_000 });

  // c.pdf to the top: two moves up.
  await page.getByRole('button', { name: 'Move c.pdf up' }).click();
  await page.getByRole('button', { name: 'Move c.pdf up' }).click();
  await expect(page.getByRole('button', { name: 'Move c.pdf up' })).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/pdf-merge-list-desktop.png`, fullPage: true });

  await expect(page.getByText('That’s 3 — the most you can merge at a time.').or(page.getByText("That's 3 — the most you can merge at a time."))).toBeVisible();

  await page.getByRole('button', { name: 'Merge 3 PDFs' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('merged.pdf');
  const info = await pdfInfo(out.bytes);
  expect(info.pages).toBe(6);
  expect(info.texts.map((t) => t.match(/(\w+) page (\d+)/)?.slice(1).join(' '))).toEqual([
    'Charlie 1',
    'Alpha 1',
    'Alpha 2',
    'Bravo 1',
    'Bravo 2',
    'Bravo 3',
  ]);
  expect(errors).toEqual([]);
});

test('merge: dropping four PDFs keeps three and says why', async ({ page }) => {
  await page.goto('/merge-pdf');
  await dropInput(page).setInputFiles([fx.a2, fx.b3, fx.c1, fx.doc12]);
  await expect(alerts(page)).toContainText('Merge works with up to 3 PDFs at a time — added the first 3.', { timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'PDFs to merge' }).getByRole('listitem')).toHaveCount(3);
});

test('split: tick pages 2, 5 and 7 of 12 and get exactly those', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/split-pdf');
  await dropInput(page).setInputFiles(fx.doc12);
  for (const n of [7, 2, 5]) await page.getByRole('checkbox', { name: `Page ${n}`, exact: true }).check();
  await expect(page.getByRole('button', { name: 'Extract 3 pages' })).toBeEnabled();
  await page.waitForTimeout(1500); // let the thumbnails draw for the screenshot
  await page.screenshot({ path: `${SHOTS}/pdf-split-grid-desktop.png`, fullPage: true });

  await page.getByRole('button', { name: 'Extract 3 pages' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('report-12-pages-pages.pdf');
  const info = await pdfInfo(out.bytes);
  expect(info.texts.map((t) => t.match(/page (\d+) of 12/)?.[1])).toEqual(['2', '5', '7']);
});

test('PDF to JPG: 12 pages → a ZIP of 12 JPGs at 150 DPI', async ({ page }) => {
  await page.goto('/pdf-to-jpg');
  await dropInput(page).setInputFiles(fx.doc12);
  await page.getByRole('button', { name: 'Convert 12 pages to JPG' }).click();
  await expect(page.getByText('Done. 12 JPGs are ready.')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('1240 × 1754 px for page 1')).toBeVisible();
  const zip = await download(page, 'Download all (ZIP)');
  expect(zip.name).toBe('report-12-pages-jpg.zip');
  const files = unzipSync(new Uint8Array(zip.bytes));
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(12);
  expect(names[0]).toBe('report-12-pages-page-01.jpg');
  for (const n of names) expect(Buffer.from(files[n].subarray(0, 3)).toString('hex')).toBe('ffd8ff');
});

test('JPG to PDF: five photos → five A4 pages; a sixth is refused', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/jpg-to-pdf');
  await dropInput(page).setInputFiles(fx.images);
  await expect(alerts(page)).toContainText('Up to 5 images per PDF — added the first 5.');
  await expect(page.getByRole('list', { name: 'Images for the PDF' }).getByRole('listitem')).toHaveCount(5);
  await page.getByRole('button', { name: 'Make PDF' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('images.pdf');
  const doc = await getDocument({ data: new Uint8Array(out.bytes), disableFontFace: true }).promise;
  expect(doc.numPages).toBe(5);
  const p1 = (await doc.getPage(1)).getViewport({ scale: 1 }); // portrait photo → portrait A4
  const p2 = (await doc.getPage(2)).getViewport({ scale: 1 }); // landscape photo → landscape A4
  expect([Math.round(p1.width), Math.round(p1.height)]).toEqual([595, 842]);
  expect([Math.round(p2.width), Math.round(p2.height)]).toEqual([842, 595]);
  await doc.loadingTask.destroy();
  expect(errors).toEqual([]);
});

test('errors: password, not a PDF, over 10 MB', async ({ page }) => {
  await page.goto('/compress-pdf');
  await dropInput(page).setInputFiles(fx.locked);
  await expect(alerts(page)).toContainText('This PDF has a password. Remove it in your PDF app first, then try again.');
  await dropInput(page).setInputFiles(fx.notPdf);
  await expect(alerts(page)).toContainText("That doesn't look like a PDF.");
  await dropInput(page).setInputFiles(fx.huge);
  await expect(alerts(page)).toContainText('This PDF is over 10 MB. Free PDF tools work with files up to 10 MB each.');
  await expect(page.getByRole('button', { name: 'Compress PDF' })).toHaveCount(0);
});

test('hub: photos go to JPG → PDF, several PDFs go to Merge', async ({ page }) => {
  await page.goto('/pdf-tools');
  await expect(page).toHaveTitle(/PDF tools/);
  await dropInput(page).setInputFiles(fx.images.slice(0, 2));
  await expect(page.getByRole('radio', { name: /Convert/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'JPG → PDF' })).toBeChecked();
  await expect(page).toHaveURL(/\/pdf-tools$/);

  await page.getByRole('button', { name: 'Start again' }).click();
  await page.getByRole('radio', { name: 'PDF → JPG' }).waitFor({ state: 'detached' });
  await page.reload();
  await dropInput(page).setInputFiles([fx.a2, fx.c1]);
  await expect(page.getByRole('radio', { name: /Merge/ })).toBeChecked({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Merge 2 PDFs' })).toBeEnabled();
});

test('switching action keeps the file and updates the URL', async ({ page }) => {
  await page.goto('/compress-pdf');
  await dropInput(page).setInputFiles(fx.doc12);
  await pick(page, /Split/);
  await expect(page).toHaveURL(/\/split-pdf$/);
  await expect(page.getByRole('checkbox', { name: 'Page 12', exact: true })).toBeVisible();
  await pick(page, /Convert/);
  await expect(page).toHaveURL(/\/pdf-to-jpg$/);
  await expect(page.getByRole('button', { name: 'Convert 12 pages to JPG' })).toBeVisible();

  // Keyboard: the actions are one radio group, so arrow keys move between them.
  await page.getByRole('radio', { name: /Convert/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: /Split/ })).toBeChecked();
  await expect(page).toHaveURL(/\/split-pdf$/);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Remove report-12-pages.pdf' })).toBeFocused();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`phone 375 px ${scheme}: touch targets, no sideways scroll, screenshots`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/merge-pdf');
    await page.screenshot({ path: `${SHOTS}/pdf-merge-empty-375-${scheme}.png`, fullPage: true });
    await dropInput(page).setInputFiles([fx.a2, fx.b3]);
    await expect(page.getByRole('button', { name: 'Merge 2 PDFs' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/pdf-merge-list-375-${scheme}.png`, fullPage: true });

    for (const name of ['Move a.pdf down', 'Remove b.pdf']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.width, name).toBeGreaterThanOrEqual(44);
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(sideways, 'no horizontal scroll').toBe(false);

    await pick(page, /Split/);
    await page.getByRole('checkbox', { name: 'Page 1', exact: true }).check();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/pdf-split-375-${scheme}.png`, fullPage: true });

    await pick(page, /Compress/);
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await expect(page.getByText(/Done\. Your PDF is ready\.|already about as small/)).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${SHOTS}/pdf-compress-result-375-${scheme}.png`, fullPage: true });
  });
}
