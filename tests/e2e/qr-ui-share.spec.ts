import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Three fixes on the QR generator and the tool pages around it:
 *   1. the QR type row (and the style rows) scroll with a mouse, and wrap on a laptop;
 *   2. the QR preview sits in the middle of its white frame;
 *   3. a compact share row on the main tool pages, and the "Pass it on" card on every one that was missing it.
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}

const typeRow = (page: Page) => page.getByRole('group', { name: 'QR type', exact: true });
const metrics = (page: Page, name: string) =>
  page.getByRole('group', { name, exact: true }).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, left: el.scrollLeft }));

test.describe('QR type row', () => {
  test('on a laptop every type is on screen, wrapped, with nothing to scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/qr-code-generator');
    const row = typeRow(page);
    const buttons = row.getByRole('button');
    expect(await buttons.count()).toBeGreaterThan(8);
    const m = await metrics(page, 'QR type');
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    const box = (await row.boundingBox())!;
    for (let i = 0; i < (await buttons.count()); i++) {
      const b = (await buttons.nth(i).boundingBox())!;
      expect(b.x + b.width, `chip ${i} inside the row`).toBeLessThanOrEqual(box.x + box.width + 1);
    }
    await expect(row.locator('xpath=..').locator('[data-scroll-right]')).toHaveCount(0);
  });

  test('on a phone it scrolls: arrows appear, the arrow moves it, the mouse wheel moves it, Tab brings the last chip into view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/qr-code-generator');
    await page.waitForLoadState('networkidle');
    const row = typeRow(page);
    const holder = row.locator('xpath=..');
    let m = await metrics(page, 'QR type');
    expect(m.sw, 'the row overflows on a phone').toBeGreaterThan(m.cw + 20);
    await expect(holder.locator('[data-scroll-right]')).toBeVisible();
    await expect(holder.locator('[data-scroll-left]')).toHaveCount(0);

    await holder.locator('[data-scroll-right]').click();
    await expect.poll(async () => (await metrics(page, 'QR type')).left).toBeGreaterThan(50);
    await expect(holder.locator('[data-scroll-left]')).toBeVisible();

    const before = (await metrics(page, 'QR type')).left;
    const b = (await row.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await metrics(page, 'QR type')).left).toBeGreaterThan(before);

    // Keyboard: focusing the last chip scrolls it into view.
    await page.getByRole('group', { name: 'QR type', exact: true }).evaluate((el) => (el.scrollLeft = 0));
    const last = row.getByRole('button').last();
    await last.focus();
    await expect.poll(async () => {
      const lb = (await last.boundingBox())!;
      const rb = (await row.boundingBox())!;
      return lb.x + lb.width <= rb.x + rb.width + 1;
    }).toBe(true);
    m = await metrics(page, 'QR type');
    expect(m.left).toBeGreaterThan(0);
  });

  test('the style rows (presets, frames) use the same scrolling row', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/qr-code-generator');
    await page.getByLabel('Website address').fill('https://example.com');
    for (const name of ['QR style presets', 'QR frame']) {
      const g = page.getByRole('group', { name, exact: true });
      await expect(g).toBeVisible();
      expect(await g.evaluate((el) => el.hasAttribute('data-scroll-row'))).toBe(true);
    }
  });

  test('the same row works inside the signed-in workspace', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await signIn(page, email('free-scroll'));
    await page.goto('/app/qr/new');
    const m = await metrics(page, 'QR type');
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1); // wraps: every type is reachable
    await page.setViewportSize({ width: 500, height: 800 });
    await expect.poll(async () => (await metrics(page, 'QR type')).sw > (await metrics(page, 'QR type')).cw).toBe(true);
    await expect(typeRow(page).locator('xpath=..').locator('[data-scroll-right]')).toBeVisible();
  });
});

test.describe('QR preview is centred in its frame', () => {
  for (const width of [1280, 768, 375, 320]) {
    test(`${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/qr-code-generator');
      await page.getByLabel('Website address').fill('https://example.com/centre');
      const canvas = page.getByRole('img', { name: 'QR code preview' });
      await expect(canvas).toBeVisible();
      await page.waitForTimeout(400);
      const frame = page.locator('.qr-paper').first();
      const f = (await frame.boundingBox())!;
      const c = (await canvas.boundingBox())!;
      const frameCentre = f.x + f.width / 2;
      const canvasCentre = c.x + c.width / 2;
      expect(Math.abs(frameCentre - canvasCentre), 'canvas centre vs frame centre (px)').toBeLessThanOrEqual(1.5);
      expect(c.x).toBeGreaterThanOrEqual(f.x - 0.5);
      expect(c.x + c.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
    });
  }

  test('also in the workspace', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, email('free-centre'));
    await page.goto('/app/qr/new');
    await page.getByLabel('Website address').fill('https://example.com/centre');
    const canvas = page.getByRole('img', { name: 'QR code preview' });
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);
    const f = (await page.locator('.qr-paper').first().boundingBox())!;
    const c = (await canvas.boundingBox())!;
    expect(Math.abs(f.x + f.width / 2 - (c.x + c.width / 2))).toBeLessThanOrEqual(1.5);
  });
});

test.describe('share', () => {
  test('the QR page: share row at the top (WhatsApp, copy, more), the Pass it on card after the tool', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      (navigator as unknown as { share: (d: unknown) => Promise<void> }).share = async (d) => {
        (window as unknown as { __shared: unknown }).__shared = d;
      };
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/qr-code-generator');
    const bar = page.getByTestId('share-bar');
    await expect(bar).toBeVisible();
    expect(await page.getByTestId('share-bar').count()).toBe(1);
    const inFirstScreen = (await bar.boundingBox())!.y + (await bar.boundingBox())!.height < 800;
    expect(inFirstScreen, 'the bar is on the first screen').toBe(true);

    const wa = page.getByTestId('share-bar-whatsapp');
    const href = (await wa.getAttribute('href')) ?? '';
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(href.slice('https://wa.me/?text='.length));
    expect(text).toContain('QR Code Generator on KaamSolv');
    expect(text).toMatch(/\/qr-code-generator$/);
    expect(text).not.toMatch(/[?&](utm_|ref=)/);
    await expect(wa).toHaveAttribute('target', '_blank');
    await expect(wa).toHaveAttribute('rel', /noopener/);

    await page.getByTestId('share-bar-copy').click();
    await expect(page.getByTestId('share-bar-copy')).toContainText('Link copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/qr-code-generator$/);
    expect(copied).not.toContain('?');

    await page.getByTestId('share-bar-native').click();
    const shared = (await page.evaluate(() => (window as unknown as { __shared: { url: string } }).__shared)) as { url: string };
    expect(shared.url).toMatch(/\/qr-code-generator$/);

    // The card sits after the generator.
    const card = page.getByTestId('share-tool');
    await expect(card).toHaveCount(1);
    expect(
      await page.evaluate(() => {
        const gen = document.querySelector('[role="group"][aria-label="QR type"]')!;
        const c = document.querySelector('[data-testid="share-tool"]')!;
        return !!(gen.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
    ).toBe(true);
    for (const id of ['share-bar-whatsapp', 'share-bar-copy', 'share-bar-native']) {
      expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
    }
  });

  test('phone: icon-only buttons, still 44px and still named, nothing runs off the screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/qr-code-generator');
    await page.waitForLoadState('networkidle');
    const wa = page.getByRole('link', { name: 'Share this tool on WhatsApp' });
    await expect(wa).toBeVisible();
    const copy = page.getByRole('button', { name: 'Copy link to this tool' });
    await expect(copy).toBeVisible();
    for (const el of [wa, copy]) {
      const b = (await el.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(43.5);
      expect(b.height).toBeGreaterThanOrEqual(43.5);
      expect(b.x + b.width).toBeLessThanOrEqual(320.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  const WITH_BAR = ['/qr-code-generator', '/url-shortener', '/jpg-to-png', '/image-compressor', '/resize-image-in-kb', '/invoice-generator', '/merge-pdf', '/pdf-to-word'];
  for (const path of WITH_BAR) {
    test(`${path}: one share row and one Pass it on card`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await expect(page.getByTestId('share-bar')).toHaveCount(1);
      await expect(page.getByTestId('share-tool')).toHaveCount(1);
      const url = decodeURIComponent(((await page.getByTestId('share-bar-whatsapp').getAttribute('href')) ?? '').split('text=')[1] ?? '');
      expect(url).toContain(path);
    });
  }

  test('short calculators keep just the card (no extra row)', async ({ page }) => {
    await page.goto('/gst-calculator');
    await expect(page.getByTestId('share-tool')).toHaveCount(1);
    await expect(page.getByTestId('share-bar')).toHaveCount(0);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1440, 768, 375, 320]) {
    test(`${width}px ${scheme}: QR page top fits; screenshots`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      await page.goto('/qr-code-generator');
      await page.getByLabel('Website address').fill('https://example.com/shot');
      await expect(page.getByRole('img', { name: 'QR code preview' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/qr-share-${width}-${scheme}.png`, fullPage: false });
    });
  }
}
