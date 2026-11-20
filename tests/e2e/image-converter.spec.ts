import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Image converters. Each pair (`/jpg-to-png`, …) is its own static route, so
 * changing a format must only change the address — a router navigation would
 * mount a fresh workspace and drop the upload (docs/products/image-kit.md:
 * "change formats without losing their upload").
 */

/** A small JPG drawn in the browser, so the test needs no binary fixture. */
async function makeJpg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(64, 48);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FE6336';
    ctx.fillRect(0, 0, 64, 48);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  return Buffer.from(b64, 'base64');
}

test('switching format keeps the upload, updates the URL, and asks to convert again', async ({ page }) => {
  await page.goto('/jpg-to-png');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await makeJpg(page) });
  await expect(page.getByText('photo.jpg')).toBeVisible();
  // Conversion starts on drop; the row offers the download when it's done.
  await expect(page.getByRole('button', { name: 'Download photo.png' })).toBeVisible({ timeout: 60_000 });

  await page.locator('#output-format').selectOption('webp');
  await expect(page).toHaveURL(/\/jpg-to-webp$/);
  await expect(page.getByText('photo.jpg')).toBeVisible();
  await expect(page.locator('#output-format')).toHaveValue('webp');

  // A finished file made with the old settings doesn't download until it's converted again.
  await expect(page.getByRole('button', { name: 'Download photo.png' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Convert again to WebP$/ }).click();

  const download = page.getByRole('button', { name: 'Download photo.webp' });
  await expect(download).toBeVisible({ timeout: 60_000 });
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toBe('photo.webp');
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');

  // Back to the pair the page opened on: the URL follows, the file stays.
  await page.locator('#output-format').selectOption('png');
  await expect(page).toHaveURL(/\/jpg-to-png$/);
  await expect(page.getByText('photo.jpg')).toBeVisible();
});
