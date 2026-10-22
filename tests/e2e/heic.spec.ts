import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * HEIC tools. heic2any needs `window`, so HEIC is decoded on the main thread
 * before the job goes to the conversion worker (worker-client.ts). These tests
 * catch the "window is not defined" regression.
 *
 * photo.heic is a real HEIC (HEVC tiles in a 2 × 2 grid, like an iPhone
 * photo) of ffmpeg's test pattern — see fixtures/make-heic.mts.
 */
const PHOTO = 'tests/e2e/fixtures/photo.heic';
const SHOTS = 'test-results/screenshots';
const HEIC_ERROR = "Couldn't open that HEIC photo.";

/** Alerts with text — Next.js also renders an empty route-announcer alert. */
const messages = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });

/** A file that passes the HEIC signature check but holds no image. */
function brokenHeic(): Buffer {
  const ftyp = Buffer.from('00000018667479706865696300000000' + '6d69663168656963', 'hex');
  return Buffer.concat([ftyp, Buffer.alloc(4096, 0x5a)]);
}

/** Decode an image in the browser; return its size and RGB at a few points (one per grid tile). */
async function inspectImage(page: Page, bytes: Buffer, mime: string) {
  return page.evaluate(
    async ({ b64, mime }) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([data], { type: mime }));
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
      return {
        width: bmp.width,
        height: bmp.height,
        green: px(250, 300), // top-left tile
        cyan: px(950, 300), // top-right tile
        red: px(80, 600), // bottom-left tile
        blue: px(600, 600), // bottom-right tile
      };
    },
    { b64: bytes.toString('base64'), mime },
  );
}

function expectColour(actual: number[], expected: [number, number, number]) {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]), `channel ${i} of ${actual}`).toBeLessThan(40));
}

for (const { route, label, mime, ext, magic } of [
  { route: '/heic-to-jpg', label: 'JPG', mime: 'image/jpeg', ext: 'jpg', magic: 'ffd8ff' },
  { route: '/heic-to-png', label: 'PNG', mime: 'image/png', ext: 'png', magic: '89504e47' },
]) {
  test(`HEIC to ${label}: a real HEIC photo converts`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(route);
    await page.locator('input[type="file"]').setInputFiles(PHOTO);
    await page.getByRole('button', { name: `Convert to ${label}` }).click();

    const download = page.getByRole('button', { name: `Download ${label}` });
    await expect(download).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('1024 × 1024').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/heic-to-${ext}-done.png`, fullPage: true });

    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file.suggestedFilename()).toBe(`photo.${ext}`);
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, magic.length / 2).toString('hex')).toBe(magic);

    const img = await inspectImage(page, bytes, mime);
    expect([img.width, img.height]).toEqual([1024, 1024]);
    expectColour(img.green, [0, 255, 0]);
    expectColour(img.cyan, [0, 255, 255]);
    expectColour(img.red, [255, 0, 0]);
    expectColour(img.blue, [0, 0, 255]);
    expect(pageErrors).toEqual([]);
  });

  test(`HEIC to ${label}: a broken HEIC shows a clear error`, async ({ page }) => {
    await page.goto(route);
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: brokenHeic() });
    await page.getByRole('button', { name: `Convert to ${label}` }).click();

    await expect(messages(page)).toContainText(HEIC_ERROR, { timeout: 60_000 });
    await expect(page.getByText(/window is not defined/i)).toHaveCount(0);
    // The user can still pick another file or try again.
    await expect(page.getByRole('button', { name: `Convert to ${label}` })).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/heic-to-${ext}-broken.png`, fullPage: true });
  });
}

test('Image Compressor: a real HEIC photo compresses', async ({ page }) => {
  await page.goto('/image-compressor');
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Compress image' }).click();

  // Either a result, or "your original is already smaller" — never an error.
  await expect(
    page.getByRole('button', { name: /^Download/ }).or(page.getByText('Your original is already the smaller file.')),
  ).toBeVisible({ timeout: 60_000 });
  await expect(messages(page)).toHaveCount(0);
});
