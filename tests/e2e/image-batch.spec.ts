import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

/**
 * Batch conversion on the image tools: several files at once, a bar per file,
 * one ZIP for everything, and the free daily limit (25 for visitors, then sign
 * in). The limit's counter lives on the server, so the counter test uses its
 * own IP per run (the first X-Forwarded-For entry is the caller, off Cloudflare).
 */

/** A small JPG in a given colour, drawn in the browser so no binary fixture is needed. */
async function makeJpg(page: Page, colour: string): Promise<Buffer> {
  const b64 = await page.evaluate(async (fill) => {
    const canvas = new OffscreenCanvas(64, 48);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 64, 48);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  }, colour);
  return Buffer.from(b64, 'base64');
}

const mockQuota = (page: Page, body: object, status = 200) =>
  page.route('**/api/image-quota', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );

test('three files convert together: a bar for each, and one ZIP with all three', async ({ page }) => {
  await mockQuota(page, { ok: true, limit: 25, used: 0, remaining: 25, signedIn: false });
  await page.goto('/jpg-to-png');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeJpg(page, '#FE6336') },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: await makeJpg(page, '#38BBAC') },
    { name: 'c.jpg', mimeType: 'image/jpeg', buffer: await makeJpg(page, '#6934D0') },
  ]);

  // Every file has its own progress bar, named after the file.
  await expect(page.getByRole('progressbar', { name: /^a\.jpg:/ })).toBeVisible();
  // The headline shows the saving once a file gets smaller, otherwise the count.
  await expect(page.locator('#batch-heading')).toHaveText(/3 of 3 done|saved/, { timeout: 90_000 });

  for (const name of ['a.png', 'b.png', 'c.png']) {
    await expect(page.getByRole('button', { name: `Download ${name}` })).toBeVisible();
  }

  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Download all \(\.zip\) · 3 files$/ }).click(),
  ]);
  expect(zip.suggestedFilename()).toBe('kaamsolv-png-images.zip');
  const entries = unzipSync(new Uint8Array(await readFile(await zip.path())));
  expect(Object.keys(entries).sort()).toEqual(['a.png', 'b.png', 'c.png']);
  // PNG signature on every entry.
  for (const bytes of Object.values(entries)) {
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }

  // Share lives in the results only: one row there, and no header bar or bottom card.
  await expect(page.getByTestId('share-bar')).toHaveCount(1);
  await expect(page.locator('#batch-heading').locator('xpath=ancestor::section').getByTestId('share-bar')).toHaveCount(1);
  await expect(page.getByTestId('share-tool')).toHaveCount(0);
});

test('a visitor who is out of free files is asked to sign in, and nothing downloads', async ({ page }) => {
  await page.route('**/api/image-quota', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, limit: 25, used: 25, remaining: 0, signedIn: false }),
        })
      : route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'daily_limit', needsSignIn: true, limit: 25, remaining: 0 }),
        }),
  );

  await page.goto('/jpg-to-png');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'late.jpg', mimeType: 'image/jpeg', buffer: await makeJpg(page, '#FDBD43') });

  const note = page.getByRole('status');
  await expect(note.getByText("You've used today's free conversions.")).toBeVisible({ timeout: 60_000 });
  const signIn = page.getByRole('link', { name: 'Sign in to keep converting today' });
  await expect(signIn).toHaveAttribute('href', /^\/login\?next=/);
  await expect(page.getByRole('button', { name: /^Download/ })).toHaveCount(0);
});

test('a signed-in person who is out for the day is told it resets at midnight, with no sign-in link', async ({ page }) => {
  await page.route('**/api/image-quota', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, limit: 100, used: 100, remaining: 0, signedIn: true }),
        })
      : route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'daily_limit', needsSignIn: false, limit: 100, remaining: 0 }),
        }),
  );

  await page.goto('/jpg-to-png');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'late.jpg', mimeType: 'image/jpeg', buffer: await makeJpg(page, '#FDBD43') });

  await expect(page.getByRole('status').getByText(/resets at midnight India time/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'Sign in to keep converting today' })).toHaveCount(0);
});

test('the daily counter counts each visitor and stops at 25 (server)', async ({ page }) => {
  // A fresh address per run, so earlier runs on the same day don't use it up.
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}-${Date.now() % 100000}`;
  const headers = { 'x-forwarded-for': ip, 'content-type': 'application/json' };
  const use = () => page.request.post('/api/image-quota', { headers, data: { op: 'use' } });

  for (let i = 1; i <= 25; i += 1) {
    const res = await use();
    expect(res.status(), `file ${i}`).toBe(200);
  }
  const blocked = await use();
  expect(blocked.status()).toBe(429);
  expect(await blocked.json()).toMatchObject({ ok: false, error: 'daily_limit', needsSignIn: true, remaining: 0 });

  const read = await page.request.get('/api/image-quota', { headers });
  expect(await read.json()).toMatchObject({ ok: true, limit: 25, remaining: 0, signedIn: false });

  // A file that failed to convert is given back.
  await page.request.post('/api/image-quota', { headers, data: { op: 'give-back' } });
  const after = await page.request.get('/api/image-quota', { headers });
  expect(await after.json()).toMatchObject({ remaining: 1 });
});
