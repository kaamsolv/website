import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { textPdf } from './pdf-fixtures';

/**
 * Release smoke: the few journeys that must work before anything ships.
 *   - homepage search, desktop and phone (action-first suggestions, keyboard)
 *   - the hero products in the agreed order
 *   - QR creation and download, decoded with an independent QR reader (OpenCV) when Python with it is installed
 *   - an invoice saved in the workspace and downloaded as a real PDF
 *   - one PDF conversion (PDF to JPG)
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
const settle = (page: Page) => page.waitForLoadState('networkidle');

test.describe('homepage search', () => {
  for (const [label, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`${label}: invites a task, offers action-first suggestions, works by keyboard`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await settle(page);
      const box = page.locator('#hero-search');
      await expect(box).toHaveAttribute('placeholder', /What do you want to do\? Try “make an invoice”/);

      // Nothing typed: six jobs people come for, as actions.
      await box.focus();
      const list = page.getByRole('listbox');
      await expect(list).toBeVisible();
      await expect(page.getByText('Try one of these')).toBeVisible();
      await expect(list.getByRole('option')).toHaveCount(6);
      for (const a of ['Make an invoice', 'Make a QR code', 'Convert HEIC to JPG', 'Make a PDF smaller', 'Calculate GST', 'Shorten a link']) {
        await expect(list.getByRole('option', { name: new RegExp(`^${a}`) })).toHaveCount(1);
      }
      await expect(page.getByRole('status').filter({ hasText: '6 suggestions' })).toHaveCount(1);

      // Typing a task: the action is the label, the tool's name sits beneath it.
      await box.fill('make an invoice');
      const first = list.getByRole('option').first();
      await expect(first).toContainText('Make an invoice');
      await expect(first).toContainText('Invoice Generator');
      await box.fill('i want to convert heic to jpg');
      await expect(list.getByRole('option').first()).toContainText('Convert HEIC to JPG');

      // Keyboard: arrows move, aria-activedescendant follows, Escape closes, Enter opens.
      await box.fill('shrink a pdf');
      await box.press('ArrowDown');
      const activeId = await box.getAttribute('aria-activedescendant');
      expect(activeId).toBeTruthy();
      await expect(page.locator(`[id="${activeId}"]`)).toHaveAttribute('aria-selected', 'true');
      await box.press('Escape');
      await expect(box).toHaveAttribute('aria-expanded', 'false');
      await box.press('ArrowDown');
      await expect(box).toHaveAttribute('aria-expanded', 'true');
      await box.press('Enter');
      await expect(page).toHaveURL(/\/compress-pdf$/);

      // A phrase with no selection: Enter goes to the best match.
      await page.goto('/');
      await settle(page);
      await page.locator('#hero-search').fill('heic to jpg');
      await page.locator('#hero-search').press('Enter');
      await expect(page).toHaveURL(/\/heic-to-jpg$/);

      // A tap/click on a suggestion opens it.
      await page.goto('/');
      await settle(page);
      await page.locator('#hero-search').focus();
      mkdirSync('test-results/screenshots', { recursive: true });
      await page.screenshot({ path: `test-results/screenshots/release-search-open-${label}.png` });
      await page.getByRole('option', { name: /^Make a QR code/ }).click();
      await expect(page).toHaveURL(/\/qr-code-generator$/);
    });
  }

  test('nothing found: says so and points to "tell us"', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.locator('#hero-search').fill('zzzzqqq');
    await expect(page.getByText('No tool for “zzzzqqq” yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'tell us what you need' })).toHaveAttribute('href', '/contact#suggest');
  });

  test('hero products are in the agreed order: QR, Invoice, PDF (and the same in the Products menu)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settle(page);
    const ids = await page.getByTestId('hero-products').locator('a[data-testid^="app-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(ids).toEqual(['app-qr', 'app-invoice', 'app-pdf']);
    await page.getByRole('button', { name: 'Products' }).click();
    const menuLinks = await page.getByTestId('products-menu').locator('a[href="/qr-code-generator"], a[href="/invoice-generator"], a[href="/pdf-tools"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(menuLinks.slice(0, 3)).toEqual(['/qr-code-generator', '/invoice-generator', '/pdf-tools']);
  });
});

test('QR: create a code, download the PNG, and read it back with an independent QR reader', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/qr-code-generator');
  await settle(page);
  const url = 'https://example.com/release-smoke?ref=qr';
  await page.getByLabel('Website address').fill(url);
  await expect(page.getByRole('img', { name: 'QR code preview' })).toBeVisible();
  await page.waitForTimeout(400);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /PNG/ }).first().click()]);
  const path = await download.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString('hex'), 'a PNG file').toBe('89504e470d0a1a0a');
  mkdirSync('test-results', { recursive: true });
  const copy = 'test-results/release-smoke-qr.png';
  writeFileSync(copy, bytes);

  const code = 'import sys\ntry:\n    import cv2\nexcept Exception:\n    print("NO_CV2"); sys.exit(0)\nimg = cv2.imread(sys.argv[1])\nd = cv2.QRCodeDetector()\nv = d.detectAndDecode(img)[0]\nprint(v)\n';
  // Run from the temp folder (not the repo) so nothing in the project can shadow a Python module; the user-level OpenCV install is
  // visible this way, which `python -I` would hide.
  const run = spawnSync('python', ['-c', code, resolve(copy)], { encoding: 'utf8', cwd: tmpdir() });
  const out = (run.stdout ?? '').trim();
  const unavailable = run.error !== undefined || run.status !== 0 || out === 'NO_CV2';
  test.info().annotations.push({ type: 'qr-decoder', description: unavailable ? 'OpenCV not available: PNG checked, content not decoded' : `decoded: ${out}` });
  if (!unavailable) expect(out, 'an independent QR reader finds exactly the address that was typed').toBe(url);
});

test('invoice: fill, save in the workspace, reopen, download a real PDF', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email('free-smoke'));
  await page.goto('/app/invoices/editor');
  await page.getByLabel('Your business name').fill('Release Smoke Co');
  await page.getByLabel('Client name').fill('Smoke Client');
  await page.getByLabel('Item 1 description').fill('Smoke test work');
  await page.getByLabel('Item 1 rate').fill('2500');
  await expect(page.getByTestId('invoice-total')).toHaveText('₹2,500.00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/invoices\/editor\?id=[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByLabel('Client name')).toHaveValue('Smoke Client');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join(' ') + ' ';
  expect(text.replace(/\s+/g, ' ')).toContain('Release Smoke Co');
  expect(text).toContain('Smoke Client');
  expect(text).toContain('2,500');
  await doc.loadingTask.destroy();
});

test('PDF: convert a 3-page PDF to JPG and get a ZIP of three real JPGs', async ({ page }) => {
  mkdirSync('test-results/pdf-fixtures', { recursive: true });
  const file = 'test-results/pdf-fixtures/release-smoke.pdf';
  writeFileSync(file, await textPdf('Release smoke', 3));
  await page.goto('/pdf-to-jpg');
  await settle(page);
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole('button', { name: 'Convert 3 pages to JPG' }).click();
  await expect(page.getByText('Done. 3 JPGs are ready.')).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all (ZIP)' }).click()]);
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(3);
  for (const n of names) expect(Buffer.from(files[n].subarray(0, 3)).toString('hex')).toBe('ffd8ff');
});
