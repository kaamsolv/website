import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { FIXTURES, makeFixtures, type Fixtures } from './pdf-fixtures';

/**
 * PDF to Word, end to end with real PDFs: the page, the conversion in the browser, the
 * downloaded .docx opened and read, the refusals (scan, password, not a PDF, too big), and
 * that nothing is uploaded. What this cannot show: how Microsoft Word itself displays the file.
 */
const SHOTS = 'test-results/screenshots';
let fx: Fixtures;
let letter: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  fx = await makeFixtures(page);
  await page.close();

  // A short letter: a heading, two paragraphs (one wraps), a list line, and a second page.
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Offer of Employment', { x: 72, y: 760, size: 24, font: bold });
  p1.drawText('Dear Priya, we are delighted to offer you the role of Senior Designer at KaamSolv, and', { x: 72, y: 720, size: 11, font: helv });
  p1.drawText('we hope you will join us on the first of next month.', { x: 72, y: 706, size: 11, font: helv });
  p1.drawText('Your salary is Rs 12,00,000 a year & benefits are listed on page two.', { x: 72, y: 670, size: 11, font: helv });
  const p2 = doc.addPage([595, 842]);
  p2.drawText('Benefits', { x: 72, y: 760, size: 18, font: bold });
  p2.drawText('Health cover for you and your family.', { x: 72, y: 725, size: 11, font: helv });
  mkdirSync(FIXTURES, { recursive: true });
  letter = join(FIXTURES, 'offer-letter.pdf');
  writeFileSync(letter, await doc.save());
});

const alerts = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });
const dropInput = (page: Page) => page.locator('input[type="file"]').first();

async function docxOf(page: Page) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Word file' }).click()]);
  const bytes = await readFile(await file.path());
  const parts = Object.fromEntries(Object.entries(unzipSync(new Uint8Array(bytes))).map(([k, v]) => [k, new TextDecoder().decode(v)]));
  const paragraphs = [...parts['word/document.xml'].matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => ({
    style: /<w:pStyle w:val="([^"]+)"/.exec(m[1])?.[1] ?? null,
    breakBefore: m[1].includes('<w:pageBreakBefore/>'),
    text: [...m[1].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => t[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join(''),
  }));
  return { name: file.suggestedFilename(), bytes, parts, paragraphs };
}

test('the page: heading, honest note, drop zone, and it is a listed tool', async ({ page, request }) => {
  await page.goto('/pdf-to-word');
  await expect(page).toHaveTitle(/PDF to Word/);
  await expect(page.getByRole('heading', { level: 1, name: 'PDF to Word' })).toBeVisible();
  await expect(page.getByText('Drop your PDF here')).toBeVisible();
  await expect(page.getByText('Will it look exactly like my PDF?')).toBeVisible();
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/pdf-to-word');
  expect((await request.get('/documents/pdf-to-word')).status(), 'the old placeholder address was never a page').toBe(404);
});

test('converts a letter in the browser: right text, headings, paragraphs and pages, and nothing is uploaded', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/pdf-to-word');
  await dropInput(page).setInputFiles(letter);
  await expect(page.getByText('Text, paragraphs and headings come across.')).toBeVisible();
  await page.getByRole('button', { name: /^Convert 2 pages to Word$/ }).click();
  await expect(page.getByText('Done. Your Word file is ready.')).toBeVisible();
  await expect(page.getByText('offer-letter.docx')).toBeVisible();
  await expect(page.getByText('Look it over in Word', { exact: false }).or(page.getByText(/look it over in Word/))).toBeVisible();

  const out = await docxOf(page);
  expect(out.name).toBe('offer-letter.docx');
  expect(out.bytes.subarray(0, 2).toString()).toBe('PK');
  expect(out.paragraphs).toEqual([
    { style: 'Heading1', breakBefore: false, text: 'Offer of Employment' },
    { style: null, breakBefore: false, text: 'Dear Priya, we are delighted to offer you the role of Senior Designer at KaamSolv, and we hope you will join us on the first of next month.' },
    { style: null, breakBefore: false, text: 'Your salary is Rs 12,00,000 a year & benefits are listed on page two.' },
    { style: 'Heading2', breakBefore: true, text: 'Benefits' },
    { style: null, breakBefore: false, text: 'Health cover for you and your family.' },
  ]);
  expect(sent, 'no request carried the file anywhere').toEqual([]);
  expect(errors).toEqual([]);

  // Start again clears the result and takes another file
  await page.getByRole('button', { name: 'Convert another' }).click();
  await expect(page.getByText('Drop your PDF here')).toBeVisible();
});

test('a 12-page report: every page is read, in order, one page break between pages', async ({ page }) => {
  await page.goto('/pdf-to-word');
  await dropInput(page).setInputFiles(fx.doc12);
  await page.getByRole('button', { name: 'Convert 12 pages to Word' }).click();
  await expect(page.getByText('Done. Your Word file is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await docxOf(page);
  expect(out.name).toBe('report-12-pages.docx');
  const heads = out.paragraphs.filter((p) => p.style === 'Heading1').map((p) => p.text);
  expect(heads).toEqual(Array.from({ length: 12 }, (_, i) => `Report page ${i + 1} of 12`));
  expect(out.paragraphs.filter((p) => p.breakBefore)).toHaveLength(11);
  expect(out.paragraphs.some((p) => p.text.includes('Line 30: small problems, solved.'))).toBe(true);
});

test('a scanned PDF (no text) is refused kindly: no Word file offered', async ({ page }) => {
  await page.goto('/pdf-to-word');
  await dropInput(page).setInputFiles(fx.scan);
  await page.getByRole('button', { name: /^Convert 3 pages to Word$/ }).click();
  await expect(alerts(page)).toContainText("We couldn't find any text in this PDF.");
  await expect(alerts(page)).toContainText('scan');
  await expect(page.getByRole('button', { name: 'Download Word file' })).toHaveCount(0);
  await expect(page.getByText('Done. Your Word file is ready.')).toHaveCount(0);
});

test('errors: password, not a PDF, over 10 MB (same messages as the other PDF tools)', async ({ page }) => {
  await page.goto('/pdf-to-word');
  await dropInput(page).setInputFiles(fx.locked);
  await expect(alerts(page)).toContainText('This PDF has a password. Remove it in your PDF app first, then try again.');
  await dropInput(page).setInputFiles(fx.notPdf);
  await expect(alerts(page)).toContainText("That doesn't look like a PDF.");
  await dropInput(page).setInputFiles(fx.huge);
  await expect(alerts(page)).toContainText('This PDF is over 10 MB.');
  await expect(page.getByRole('button', { name: /to Word$/ })).toHaveCount(0);
});

test('switching between PDF tools keeps the file and the address follows', async ({ page }) => {
  await page.goto('/compress-pdf');
  await dropInput(page).setInputFiles(letter);
  await page.locator('label').filter({ has: page.getByRole('radio', { name: /Convert/ }) }).click();
  await expect(page).toHaveURL(/\/pdf-to-jpg$/);
  await page.locator('label').filter({ has: page.getByRole('radio', { name: 'PDF → Word' }) }).click();
  await expect(page).toHaveURL(/\/pdf-to-word$/);
  await expect(page.getByRole('button', { name: /^Convert 2 pages to Word$/ })).toBeVisible();
  await page.locator('label').filter({ has: page.getByRole('radio', { name: 'PDF → JPG' }) }).click();
  await expect(page).toHaveURL(/\/pdf-to-jpg$/);
  await expect(page.getByRole('button', { name: /to JPG$/ })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}: ready, result and error; no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/pdf-to-word');
      const main = page.locator('main').first();
      await dropInput(page).setInputFiles(letter);
      await expect(page.getByRole('button', { name: /^Convert 2 pages to Word$/ })).toBeVisible();
      await main.screenshot({ path: `${SHOTS}/pdf-to-word-${name}-${scheme}-ready.png` });
      await page.getByRole('button', { name: /^Convert 2 pages to Word$/ }).click();
      await expect(page.getByText('Done. Your Word file is ready.')).toBeVisible();
      await main.screenshot({ path: `${SHOTS}/pdf-to-word-${name}-${scheme}-result.png` });
      await page.getByRole('button', { name: 'Convert another' }).click();
      await dropInput(page).setInputFiles(fx.scan);
      await page.getByRole('button', { name: /to Word$/ }).click();
      await expect(alerts(page)).toBeVisible();
      await main.screenshot({ path: `${SHOTS}/pdf-to-word-${name}-${scheme}-error.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no horizontal scroll').toBe(false);
    });
  }
}
