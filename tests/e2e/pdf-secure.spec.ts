import { expect, test, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { FIXTURES, drawJpeg, textPdf } from './pdf-fixtures';

/**
 * Watermark PDF and Protect PDF, end to end. The files the BROWSER makes are opened again:
 * watermark text and pictures by pdf.js, protected files by pdf.js AND two independent engines
 * (Xpdf's pdftotext and qpdf through pikepdf) when they are installed on this machine.
 * Not covered: Acrobat, Chrome's or Edge's built-in viewer, Preview.
 */
const SHOTS = 'test-results/screenshots';
let six: string;
let logo: string;
const hasXpdf = !spawnSync('pdftotext', ['-v']).error;
const hasPikepdf = spawnSync('python', ['-c', 'import pikepdf']).status === 0;

test.beforeAll(async ({ browser }) => {
  mkdirSync(FIXTURES, { recursive: true });
  six = join(FIXTURES, 'six.pdf');
  writeFileSync(six, await textPdf('Six', 6));
  const page = await browser.newPage();
  logo = join(FIXTURES, 'logo.jpg');
  writeFileSync(logo, await drawJpeg(page, 400, 200, { seed: 7 }));
  await page.close();
});

const dropInput = (page: Page) => page.locator('input[type="file"]').first();
const alerts = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });
const pick = (page: Page, name: string | RegExp) => page.locator('label').filter({ has: page.getByRole('radio', { name }) }).click();

async function download(page: Page, name: string | RegExp) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  return { name: file.suggestedFilename(), path: await file.path(), bytes: await readFile(await file.path()) };
}

function watch(page: Page) {
  const problems: string[] = [];
  const sent: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('request', (r) => ['POST', 'PUT', 'PATCH'].includes(r.method()) && sent.push(`${r.method()} ${r.url()}`));
  return { problems, sent };
}

/** Text of every page and whether the page draws a picture, read by pdf.js. */
async function readPages(bytes: Buffer, password?: string) {
  const doc = await getDocument({ data: new Uint8Array(bytes), password, disableFontFace: true }).promise;
  const pages: { text: string; hasPicture: boolean; dir?: [number, number] }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const items = (await p.getTextContent()).items.filter((i) => 'str' in i) as unknown as { str: string; transform: number[] }[];
    const vp = p.getViewport({ scale: 1 });
    const stamp = items.find((i) => i.str.trim() !== '' && Math.abs(i.transform[1]) > 1);
    const dir = stamp ? ([vp.transform[0] * stamp.transform[0] + vp.transform[2] * stamp.transform[1], vp.transform[1] * stamp.transform[0] + vp.transform[3] * stamp.transform[1]] as [number, number]) : undefined;
    const ops = await p.getOperatorList();
    pages.push({ text: items.map((i) => i.str).join(' '), hasPicture: ops.fnArray.includes(OPS.paintImageXObject), dir });
  }
  await doc.loadingTask.destroy();
  return pages;
}

test('watermark text: chosen pages only, in the colour and words chosen, body text kept, nothing uploaded', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await page.goto('/watermark-pdf');
  await dropInput(page).setInputFiles(six);
  await expect(page.getByTestId('wm-preview-text')).toHaveText('CONFIDENTIAL');
  await page.locator('#wm-text').fill('DRAFT COPY');
  await expect(page.getByTestId('wm-preview-text')).toHaveText('DRAFT COPY');
  await pick(page, 'Red');
  await page.locator('#wm-pages').fill('2-3');
  await expect(page.getByTestId('wm-hint')).toHaveText('Goes on 2 of 6 pages.');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/pdf-watermark-desktop.png`, fullPage: true });

  await page.getByRole('button', { name: 'Add watermark' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Watermark added to 2 pages.')).toBeVisible();
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('six-watermarked.pdf');
  const pages = await readPages(out.bytes);
  expect(pages).toHaveLength(6);
  pages.forEach((p, i) => {
    expect(p.text, `page ${i + 1} keeps its text`).toContain(`Six page ${i + 1} of 6`);
    expect(p.text.includes('DRAFT COPY'), `page ${i + 1} stamped`).toBe(i === 1 || i === 2);
  });
  const d = pages[1].dir!;
  expect(Math.abs(d[0] / Math.hypot(...d) - Math.SQRT1_2), 'rises at 45 degrees').toBeLessThan(0.01);
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('watermark text: Hindi, empty and out-of-range pages are explained and stop the button', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await dropInput(page).setInputFiles(six);
  const button = page.getByRole('button', { name: 'Add watermark' });
  await page.locator('#wm-text').fill('नमस्ते');
  await expect(alerts(page)).toContainText('Hindi and other scripts aren’t supported yet');
  await expect(button).toBeDisabled();
  await page.locator('#wm-text').fill('   ');
  await expect(alerts(page)).toContainText('Type the words');
  await page.locator('#wm-text').fill('CONFIDENTIAL');
  await page.locator('#wm-pages').fill('9');
  await expect(alerts(page)).toContainText('This PDF has 6 pages, so page 9 isn’t there.');
  await expect(button).toBeDisabled();
  await page.locator('#wm-pages').fill('');
  await expect(button).toBeEnabled();
});

test('watermark picture: a logo goes on every page, see-through; with no picture the button waits', async ({ page }) => {
  const w = watch(page);
  await page.goto('/watermark-pdf');
  await dropInput(page).setInputFiles(six);
  await pick(page, 'A picture');
  await expect(page.getByRole('button', { name: 'Add watermark' })).toBeDisabled();
  await expect(alerts(page)).toContainText('Choose a picture first.');
  await page.getByTestId('wm-file').setInputFiles(logo);
  await expect(page.getByTestId('wm-file-name')).toHaveText('logo.jpg');
  await expect(page.getByTestId('wm-preview-image')).toBeVisible();
  await pick(page, 'Bottom right');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/pdf-watermark-picture-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Add watermark' }).click();
  await expect(page.getByText('Watermark added to 6 pages.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  const pages = await readPages(out.bytes);
  expect(pages.every((p) => p.hasPicture), 'every page draws the picture').toBe(true);
  expect(pages[0].text).toContain('Six page 1 of 6');
  expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(6);
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('protect: the browser-made file needs the password in pdf.js, Xpdf and qpdf, and is AES-256', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await page.goto('/protect-pdf');
  await dropInput(page).setInputFiles(six);
  const button = page.getByRole('button', { name: 'Protect PDF' });
  await expect(button).toBeDisabled();
  await expect(page.getByTestId('protect-warning')).toContainText('We can’t see it or recover it');

  await page.getByLabel('Password to open the PDF').fill('abc');
  await expect(page.locator('#pw-hint')).toHaveText('Use at least 4 characters.');
  await page.getByLabel('Password to open the PDF').fill('correct-horse');
  await expect(page.locator('#pw-hint')).toContainText('Fine');
  await page.getByLabel('Type it again').fill('correct-hors');
  await expect(alerts(page)).toContainText('The two passwords don’t match.');
  await expect(button).toBeDisabled();
  await page.getByLabel('Type it again').fill('correct-horse');
  await expect(button).toBeEnabled();

  // The permissions are explained as requests, in plain words, before anyone ticks them.
  await page.getByText('Also ask apps to limit what people can do (optional)').click();
  await expect(page.getByTestId('permissions-note')).toContainText('These are requests, not a lock.');
  await page.getByLabel('Don’t allow copying text and pictures').check();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/pdf-protect-desktop.png`, fullPage: true });

  await button.click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/We can’t recover it/)).toBeVisible();
  await expect(page.getByLabel('Password to open the PDF')).toHaveValue(''); // cleared once used
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('six-protected.pdf');

  // 1) pdf.js (the engine this site itself uses)
  await expect(readPages(out.bytes)).rejects.toThrow(/password/i);
  const pages = await readPages(out.bytes, 'correct-horse');
  expect(pages).toHaveLength(6);
  expect(pages[0].text).toContain('Six page 1 of 6');

  // 2) Xpdf's pdftotext, a different PDF engine
  if (hasXpdf) {
    expect(spawnSync('pdftotext', [out.path, '-'], { encoding: 'utf8' }).status, 'Xpdf: no password').not.toBe(0);
    const ok = spawnSync('pdftotext', ['-upw', 'correct-horse', out.path, '-'], { encoding: 'utf8' });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('Six page 1 of 6');
    expect(ok.stdout).toContain('Six page 6 of 6');
  }
  // 3) qpdf through pikepdf, another
  if (hasPikepdf) {
    const code = `import sys, json, pikepdf
p, pw = sys.argv[1], sys.argv[2]
try:
    pikepdf.open(p).close(); none = 'opened'
except pikepdf.PasswordError:
    none = 'refused'
pdf = pikepdf.open(p, password=pw)
print(json.dumps({'none': none, 'R': pdf.encryption.R, 'V': pdf.encryption.V, 'pages': len(pdf.pages), 'extract': bool(pdf.allow.extract), 'print': bool(pdf.allow.print_highres)}))`;
    const r = spawnSync('python', ['-c', code, out.path, 'correct-horse'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ none: 'refused', R: 6, V: 5, pages: 6, extract: false, print: true });
  }
  expect(w.sent, 'the PDF and the password are never sent anywhere').toEqual([]);
  expect(w.problems).toEqual([]);
});

test('protect: a password over 32 characters is explained and stops the button', async ({ page }) => {
  await page.goto('/protect-pdf');
  await dropInput(page).setInputFiles(six);
  await page.getByLabel('Password to open the PDF').fill('k'.repeat(33));
  await page.getByLabel('Type it again').fill('k'.repeat(33));
  await expect(page.locator('#pw-hint')).toHaveText('Use 32 characters or fewer.');
  await expect(page.getByRole('button', { name: 'Protect PDF' })).toBeDisabled();
});

test('protect: Show the password reveals what was typed', async ({ page }) => {
  await page.goto('/protect-pdf');
  await dropInput(page).setInputFiles(six);
  const field = page.getByLabel('Password to open the PDF');
  await field.fill('correct-horse');
  await expect(field).toHaveAttribute('type', 'password');
  await page.getByLabel('Show the password').check();
  await expect(field).toHaveAttribute('type', 'text');
});

test('the picker has a Secure group with both tools, and moving between them keeps the file', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await dropInput(page).setInputFiles(six);
  await expect(page.getByRole('radio', { name: 'Secure & enhance', exact: true })).toBeChecked();
  await pick(page, /Protect PDF/);
  await expect(page).toHaveURL(/\/protect-pdf$/);
  await expect(page.getByRole('button', { name: 'Protect PDF' })).toBeVisible();
  await pick(page, /Watermark PDF/);
  await expect(page).toHaveURL(/\/watermark-pdf$/);
  await expect(page.getByRole('button', { name: 'Add watermark' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [360, 320]) {
    test(`phone ${width} px ${scheme}: watermark and protect panels fit`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 800 });
      const w = watch(page);
      const noSideways = async (what: string) =>
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll: ${what}`).toBe(true);

      await page.goto('/watermark-pdf');
      await dropInput(page).setInputFiles(six);
      await expect(page.getByTestId('wm-preview-text')).toBeVisible({ timeout: 30_000 });
      await noSideways('watermark text');
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOTS}/pdf-watermark-${width}-${scheme}.png`, fullPage: true });
      await pick(page, 'A picture');
      await page.getByTestId('wm-file').setInputFiles(logo);
      await expect(page.getByTestId('wm-preview-image')).toBeVisible();
      await noSideways('watermark picture');
      const apply = await page.getByRole('button', { name: 'Add watermark' }).boundingBox();
      expect(apply!.height).toBeGreaterThanOrEqual(44);

      await page.goto('/protect-pdf');
      await dropInput(page).setInputFiles(six);
      await expect(page.getByLabel('Password to open the PDF')).toBeVisible({ timeout: 30_000 });
      await page.getByText('Also ask apps to limit what people can do (optional)').click();
      await noSideways('protect');
      await page.screenshot({ path: `${SHOTS}/pdf-protect-${width}-${scheme}.png`, fullPage: true });
      for (const name of ['Show the password']) {
        const box = await page.getByLabel(name).boundingBox();
        expect(box!.height, name).toBeGreaterThanOrEqual(20);
      }
      expect(w.problems).toEqual([]);
    });
  }
}
