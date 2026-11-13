import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * UI polish pass: the homepage products panel (and its dedupe), the calmer tool-page header, /tools without
 * duplicates, the workspace hub and menu with one state vocabulary, shared notice / skeleton / disabled patterns,
 * and 44px touch targets on touch screens. Screenshots go to test-results/screenshots/polish-*.png.
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const settle = async (page: Page) => page.waitForLoadState('networkidle');
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
const CORAL = 'rgb(254, 99, 54)';
const bg = (el: Element) => getComputedStyle(el).backgroundColor;

test.describe('homepage products panel', () => {
  test('desktop: three products with picture, name, sentence and action, on the first screen beside the search', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settle(page);
    const panel = page.getByTestId('hero-products');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.y + box.height, 'the whole panel is on the first screen').toBeLessThanOrEqual(900);
    const search = (await page.locator('#hero-search').boundingBox())!;
    expect(box.x, 'to the right of the search').toBeGreaterThan(search.x + search.width);
    for (const [id, name, text, href] of [
      ['invoice', 'Invoice Generator', 'GST ready', '/invoice-generator'],
      ['qr', 'QR Studio', 'track the scans', '/qr-code-generator'],
      ['pdf', 'PDF Bundle', 'stay on your device', '/pdf-tools'],
    ]) {
      const card = panel.getByTestId(`app-${id}`);
      await expect(card).toHaveAttribute('href', href);
      await expect(card.getByText(name, { exact: true })).toBeVisible();
      await expect(card).toContainText(text);
      expect(await card.locator('svg').first().getAttribute('aria-hidden')).toBe('true');
    }
    await expect(panel.getByTestId('explore-products')).toHaveText('Explore all products');
    await expect(panel.getByTestId('explore-products')).toHaveAttribute('href', '/tools');
  });

  test('phone: the panel follows the search, stacked, nothing runs off the screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await settle(page);
    const panel = page.getByTestId('hero-products');
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox())!.y).toBeGreaterThan((await page.locator('#hero-search').boundingBox())!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const id of ['invoice', 'qr', 'pdf']) expect((await panel.getByTestId(`app-${id}`).boundingBox())!.height).toBeGreaterThanOrEqual(80);
  });

  test('no repeats: no chips, no quick-link row, popular tools exclude the products, one invoice action, a lighter promo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settle(page);
    await expect(page.getByRole('navigation', { name: 'Tools you can use now' })).toHaveCount(0);
    await expect(page.getByText('Popular:', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Featured Applications')).toHaveCount(0);
    const popular = page.locator('#popular-title').locator('xpath=ancestor::section[1]');
    const names = await popular.locator('li a').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    expect(names.length).toBe(4);
    for (const n of names) expect(n).not.toMatch(/Invoice|QR|PDF/i);
    await expect(page.getByText('Make an invoice', { exact: true })).toHaveCount(1);
    await expect(page.getByText('KaamSolv is new', { exact: false })).toHaveCount(0);
    const promo = page.locator('[data-ad-slot="home-hero-promo"]');
    await expect(promo).toHaveCount(1);
    expect((await promo.boundingBox())!.height, 'a strip, not a billboard').toBeLessThan(110);
  });
});

test.describe('tool page header', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('one coral action: no coral Search button in the header; "Suggest a tool" is an outline on a tool page and coral on the homepage', async ({ page }) => {
    await page.goto('/qr-code-generator');
    await settle(page);
    const header = page.locator('header').first();
    await expect(header.getByRole('button', { name: 'Search' })).toHaveCount(0);
    const suggest = header.getByRole('link', { name: 'Suggest a tool' });
    await expect(suggest).toBeVisible();
    expect(await suggest.evaluate(bg)).not.toBe(CORAL);
    await page.goto('/');
    await settle(page);
    expect(await page.locator('header').first().getByRole('link', { name: 'Suggest a tool' }).evaluate(bg)).toBe(CORAL);
  });

  for (const [path, tail] of [
    ['/qr-code-generator', 'Make a QR code'],
    ['/invoice-generator', 'Invoice Generator'],
    ['/url-shortener', 'Shorten a URL'],
    ['/jpg-to-png', 'JPG to PNG'],
    ['/gst-calculator', 'GST Calculator'],
  ] as const) {
    test(`${path}: a category crumb replaces the badge row and the tool starts higher`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('listitem');
      await expect(crumbs).toHaveCount(3);
      await expect(crumbs.nth(1).getByRole('link')).toHaveAttribute('href', /^\/tools#[a-z-]+$/);
      await expect(crumbs.nth(2)).toContainText(tail);
      await expect(page.getByText('Free tool', { exact: false })).toHaveCount(0);
      const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      expect(h1.y + h1.height, 'heading block ends high on the page').toBeLessThan(330);
    });
  }

  test('the invoice heading lines up with the toolbar over the paper', async ({ page }) => {
    await page.goto('/invoice-generator');
    await settle(page);
    const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    const bar = (await page.getByRole('button', { name: 'Download PDF' }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl2")][1]').boundingBox())!;
    expect(Math.abs(h1.x - bar.x), 'heading left edge vs toolbar left edge').toBeLessThanOrEqual(2);
  });

  test('a disabled primary button is neutral, not a faded coral', async ({ page }) => {
    await page.goto('/qr-code-generator');
    await settle(page);
    const png = page.getByRole('button', { name: /PNG/ }).first();
    await expect(png).toBeDisabled();
    expect(await png.evaluate(bg)).not.toBe(CORAL);
    expect(await png.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  });
});

test.describe('touch targets (coarse pointer)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('QR chips, header buttons and calculator choices reach 44px on a touch screen', async ({ page }) => {
    await page.goto('/qr-code-generator');
    await settle(page);
    const chip = page.getByRole('group', { name: 'QR type', exact: true }).getByRole('button').first();
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await page.getByLabel('Website address').fill('https://example.com');
    const preset = page.getByRole('group', { name: 'QR style presets', exact: true }).getByRole('button').first();
    expect((await preset.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    expect((await page.getByRole('button', { name: 'Open menu' }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    expect((await page.locator('header').first().getByRole('link', { name: 'Suggest' }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await page.goto('/gst-calculator');
    await settle(page);
    const choice = page.locator('main label:has(input[type=radio])').first();
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  });
});

test.describe('/tools', () => {
  test('every live tool appears once; categories stay; copy matches the catalogue; jump chips are 44px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tools');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Ready to use' })).toHaveCount(0);
    const hrefs = await page.locator('main section[id] a[href^="/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.length, 'no tool is listed twice').toBe(new Set(hrefs).size);
    expect(hrefs.length).toBeGreaterThan(50);
    const jump = page.getByRole('navigation', { name: 'Jump to a category' }).getByRole('link');
    await expect(jump).toHaveCount(10);
    for (const l of await jump.all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await expect(page.getByText(/^\d+ tools ready to use — free, no sign-up\./)).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('workspace: one state vocabulary, a balanced hub, shared notices and skeletons', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const nav = (page: Page) => page.getByRole('navigation', { name: 'Your workspace' });

  test('free account: hub cards and menu both say Free; two cards share the row; one "all tools" prompt in the page', async ({ page }) => {
    await signIn(page, email('free-polish'));
    await page.goto('/app');
    const cards = page.getByRole('list', { name: 'Your tools' }).getByRole('listitem');
    await expect(cards).toHaveCount(2);
    for (const c of await cards.all()) await expect(c).toContainText('Free');
    await expect(nav(page).locator('[data-product="invoices"]')).toContainText('Free');
    await expect(nav(page).locator('[data-product="qr"]')).toContainText('Free');
    const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
    const main = (await page.locator('main#main').boundingBox())!;
    expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(2);
    expect(a!.width + b!.width + 16, 'the two cards fill the row').toBeGreaterThan(main.width * 0.9);
    await expect(page.locator('main a[href="/tools"]')).toHaveCount(1); // the promo strip only
    await expect(page.getByText('Looking for something else?')).toHaveCount(0);
    for (const name of [/Open invoices/, /New invoice/, /Open QR codes/, /New QR code/]) {
      expect((await page.getByRole('link', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }
    await expect(cards.first().getByRole('link', { name: 'See what Invoice Pro adds' })).toHaveAttribute('href', '/app/products/invoices');
    // The product rows are quiet: no tinted boxes.
    const qrBg = await nav(page).locator('[data-product="qr"]').evaluate(bg);
    expect(qrBg).toBe('rgba(0, 0, 0, 0)');
  });

  test('Pro account: the hub card says Pro and has no upgrade line', async ({ page }) => {
    await signIn(page, email('pro-polish'));
    await page.goto('/app');
    const inv = page.getByRole('list', { name: 'Your tools' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Invoices', exact: true }) });
    await expect(inv).toContainText('Pro');
    await expect(inv.getByRole('link', { name: /See what Invoice Pro adds/ })).toHaveCount(0);
    await expect(nav(page).locator('[data-product="invoices"]')).toContainText('Pro');
  });

  test('a failed dashboard load shows the shared notice (same words, same role, no new actions); loading shows a skeleton', async ({ page }) => {
    await signIn(page, email('pro-notice'));
    await page.route('**/api/dashboard**', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/app/invoices/overview');
    await expect(page.locator('main [aria-hidden="true"].animate-pulse').first()).toBeVisible();
    const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load your dashboard. Refresh to try again.' });
    await expect(alert).toBeVisible();
    expect(await alert.getByRole('button').count()).toBe(0);
    expect(await alert.getByRole('link').count()).toBe(0);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1440, 375]) {
    test(`${width}px ${scheme}: screenshots of the polished pages`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      for (const [name, path] of [['home', '/'], ['tools', '/tools'], ['qr', '/qr-code-generator'], ['invoice', '/invoice-generator']] as const) {
        await page.goto(path);
        await settle(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no sideways scroll`).toBe(true);
        await page.screenshot({ path: `${SHOTS}/polish-${name}-${width}-${scheme}.png`, fullPage: name === 'home' });
      }
      await signIn(page, email('free-shots2'));
      for (const [name, path] of [['hub', '/app'], ['invoices', '/app/invoices']] as const) {
        await page.goto(path);
        await settle(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no sideways scroll`).toBe(true);
        await page.screenshot({ path: `${SHOTS}/polish-${name}-${width}-${scheme}.png` });
      }
    });
  }
}
