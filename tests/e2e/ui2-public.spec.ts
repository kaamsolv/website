import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * UI 2.0, public side: the homepage and the header's Products menu.
 * Screenshots go to test-results/screenshots/ui2-*.png.
 */

const SHOTS = 'test-results/screenshots';
const settle = async (page: Page) => page.waitForLoadState('networkidle');

test.describe('homepage', () => {
  test('hero with the main products beside it, popular tools without them, and categories', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Digital Toolkit for Everyday Kaam.');
    await expect(page.getByText('Simple, useful tools for business, documents, work and everyday life.')).toBeVisible();
    await expect(page.getByText('Small tools. Less kaam.')).toBeAttached();
    await expect(page.locator('#hero-search-anchor')).toBeAttached();

    const apps = page.getByRole('region', { name: 'Featured products' });
    await expect(apps.getByRole('link')).toHaveCount(4); // three products and "Explore all products"
    await expect(apps.getByTestId('explore-products')).toHaveAttribute('href', '/tools');
    await expect(apps.getByTestId('app-invoice')).toHaveAttribute('href', '/invoice-generator');
    await expect(apps.getByTestId('app-pdf')).toHaveAttribute('href', '/pdf-tools');
    await expect(apps.getByTestId('app-qr')).toHaveAttribute('href', '/qr-code-generator');
    for (const href of ['/invoice-generator', '/pdf-tools', '/qr-code-generator']) {
      expect((await page.request.get(href)).status(), `${href} opens`).toBe(200);
    }

    await expect(page.getByRole('heading', { name: 'Popular tools' })).toBeVisible();
    const cats = page.locator('#categories').getByRole('link');
    await expect(cats).toHaveCount(10);
    await expect(cats.first()).toHaveAttribute('href', '/tools#money');
    // The order on the page: hero (with the products), popular tools, categories.
    const order = await page.locator('main h1, main h2').allTextContents();
    expect(order.slice(0, 3)).toEqual(['Your Digital Toolkit for Everyday Kaam.', 'Popular tools', 'Explore tools by category']);
  });

  test('the hero search finds a tool and opens it', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const box = page.locator('#hero-search');
    await box.fill('gst');
    await expect(page.getByRole('option').first()).toContainText('GST');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/gst-calculator$/);
  });

  test('the compact header search still appears once the hero search scrolls away', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await settle(page);
    await expect(page.locator('header').getByRole('combobox')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(page.locator('header').getByRole('combobox')).toBeVisible();
  });
});

test.describe('Products menu, desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('opens on click, shows categories, featured products and live popular tools; closes with Escape and outside click', async ({ page }) => {
    await page.goto('/tools');
    await settle(page);
    const button = page.getByRole('button', { name: 'Products' });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    const before = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, top: document.querySelector('main')!.getBoundingClientRect().top }));
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByTestId('products-menu');
    await expect(menu).toBeVisible();
    expect(await page.evaluate(() => ({ h: document.documentElement.scrollHeight, top: document.querySelector('main')!.getBoundingClientRect().top }))).toEqual(before); // no layout shift

    await expect(menu.getByRole('link', { name: /^(Money|Work|Business|Documents|Images & Files|Writing|Career|Everyday|India|Creators)\b/ })).toHaveCount(10);
    await expect(menu.getByRole('link', { name: /Invoice Generator/ })).toHaveAttribute('href', '/invoice-generator');
    await expect(menu.getByRole('link', { name: /PDF Bundle/ })).toHaveAttribute('href', '/pdf-tools');
    await expect(menu.getByRole('link', { name: /QR Studio/ })).toHaveAttribute('href', '/qr-code-generator');
    await expect(menu.getByRole('link', { name: /Explore all products/ })).toHaveAttribute('href', '/tools');
    for (const href of await menu.locator('[data-tool-link]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
      expect(href, 'popular tools are live pages, never a "coming soon" anchor').not.toMatch(/#/);
    }

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();

    await button.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(40, 700);
    await expect(menu).toHaveCount(0);
  });

  test('search reuses the catalogue: live tools only, arrow keys move, a planned tool is not offered', async ({ page }) => {
    await page.goto('/tools');
    await settle(page);
    await page.getByRole('button', { name: 'Products' }).click();
    const menu = page.getByTestId('products-menu');
    const search = menu.getByRole('searchbox', { name: 'Search tools' });
    await search.fill('pdf');
    const links = menu.locator('[data-tool-link]');
    expect(await links.count()).toBeGreaterThan(1);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) expect(href).not.toMatch(/#/);
    await search.press('ArrowDown');
    await expect(links.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(links.nth(0)).toBeFocused();

    await search.fill('resume builder'); // planned, not live
    await expect(menu.getByText('No tool for “resume builder” yet.')).toBeVisible();
    await expect(links).toHaveCount(0);

    await search.fill('gst');
    await menu.getByRole('link', { name: /GST Calculator/ }).click();
    await expect(page).toHaveURL(/\/gst-calculator$/);
  });

  test('a category link opens that group on /tools', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.getByRole('button', { name: 'Products' }).click();
    await page.getByTestId('products-menu').getByRole('link', { name: /^Documents/ }).click();
    await expect(page).toHaveURL(/\/tools#documents$/);
  });
});

test.describe('Products menu, phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the accordion lives in the phone menu', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const toggle = page.getByRole('button', { name: 'Products' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByTestId('products-accordion');
    await expect(panel.getByRole('link', { name: 'PDF Bundle' })).toHaveAttribute('href', '/pdf-tools');
    await expect(panel.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/tools#documents');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.getByRole('link', { name: 'QR Studio' }).click();
    await expect(page).toHaveURL(/\/qr-code-generator$/);
  });
});

const WIDTHS = [1440, 768, 375];
for (const scheme of ['light', 'dark'] as const) {
  for (const width of WIDTHS) {
    test(`${width}px ${scheme}: homepage and menu fit; screenshots`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(e.message));
      page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
      await page.goto('/');
      await settle(page);
      await page.screenshot({ path: `${SHOTS}/ui2-home-${width}-${scheme}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll').toBe(true);
      // Featured cards never run off the screen.
      const outside = await page.locator('[data-testid^="app-"]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5).length);
      expect(outside).toBe(0);
      if (width >= 1024) {
        await page.getByRole('button', { name: 'Products' }).click();
        await page.screenshot({ path: `${SHOTS}/ui2-menu-${width}-${scheme}.png` });
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('button', { name: 'Products' }).click();
        await page.screenshot({ path: `${SHOTS}/ui2-menu-${width}-${scheme}.png` });
      }
      expect(problems).toEqual([]);
    });
  }
}

// The two public editors keep working without an account, in the new work-area presentation.
test('the public invoice editor and QR generator work signed out', async ({ page }) => {
  await page.goto('/invoice-generator');
  await expect(page).toHaveURL(/\/invoice-generator$/);
  await page.getByLabel('Item 1 description').fill('Design');
  await page.getByLabel('Item 1 rate').fill('1000');
  await expect(page.getByTestId('invoice-total')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoice generator');
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible(); // SEO content intact

  await page.goto('/qr-code-generator');
  await expect(page).toHaveURL(/\/qr-code-generator$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make a QR code');
  await expect(page.getByRole('heading', { name: /^Three steps/ })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of WIDTHS) {
    test(`${width}px ${scheme}: public editors fit; screenshots`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      for (const [label, path] of [['invoice-editor', '/invoice-generator'], ['qr-editor', '/qr-code-generator']]) {
        await page.goto(path);
        await settle(page);
        await page.screenshot({ path: `${SHOTS}/ui2-${label}-${width}-${scheme}.png`, fullPage: false });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: no sideways scroll`).toBe(true);
      }
    });
  }
}

// PDF tool pages: the same workspace, now framed with a sidebar of the live PDF tools.
test.describe('PDF workspace frame', () => {
  test('desktop: sidebar lists the live PDF tools, marks the current one, never links a planned tool', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/rotate-pdf');
    await settle(page);
    const side = page.getByRole('navigation', { name: 'PDF tools', exact: true });
    await expect(side).toBeVisible();
    await expect(side.getByRole('link', { name: 'Rotate PDF' })).toHaveAttribute('aria-current', 'page');
    await expect(side.getByRole('link', { name: 'PDF workspace' })).toHaveAttribute('href', '/pdf-tools');
    expect(await side.getByRole('link').count()).toBe(15); // the hub plus 14 live tools
    for (const planned of ['OCR PDF', 'Extract tables', 'Compare PDFs']) await expect(side.getByText(planned)).toHaveCount(0);
    await side.getByRole('link', { name: 'Merge PDF' }).click();
    await expect(page).toHaveURL(/\/merge-pdf$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Merge PDF files');
    // The workspace is still there and still takes a file.
    await expect(page.locator('input[type=file]').first()).toBeAttached();
  });

  test('phone: the tool list folds into one disclosure above the workspace', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/compress-pdf');
    await settle(page);
    await expect(page.getByRole('navigation', { name: 'PDF tools', exact: true })).toHaveCount(0);
    await page.getByText('All PDF tools').click();
    const menu = page.getByRole('navigation', { name: 'PDF tools menu' });
    await expect(menu.getByRole('link', { name: 'Compress PDF' })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of WIDTHS) {
    test(`${width}px ${scheme}: PDF workspace frame fits; screenshots`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      await page.goto('/split-pdf');
      await settle(page);
      await page.screenshot({ path: `${SHOTS}/ui2-pdf-workspace-${width}-${scheme}.png`, fullPage: false });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

// Search is prominent on the tools directory and always in the header on a tool page.
test('the tools directory has a big search that opens a tool', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tools');
  await settle(page);
  const box = page.locator('#tools-search');
  await expect(box).toBeVisible();
  await box.fill('emi');
  await expect(page.getByRole('option').first()).toContainText('EMI');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/emi-calculator$/);
});

test('a tool page carries the search in the header (desktop) and in the phone menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/gst-calculator');
  await settle(page);
  const header = page.locator('header').getByRole('combobox', { name: 'Search for a tool' });
  await expect(header).toBeVisible();
  await header.fill('pdf to word');
  await header.press('Enter');
  await expect(page).toHaveURL(/\/pdf-to-word$/);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/gst-calculator');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#mobile-menu').getByRole('combobox', { name: 'Search for a tool' })).toBeVisible();
});

test('ads: anonymous visitors see the house promo slots, outside the tool itself', async ({ page }) => {
  await page.goto('/gst-calculator');
  await settle(page);
  const below = page.locator('[data-ad-slot="gst-calculator-below-tool"]');
  await expect(below).toBeVisible();
  // The slot sits after the tool block, never inside it.
  expect(await page.evaluate(() => {
    const ad = document.querySelector('[data-ad-slot="gst-calculator-below-tool"]')!;
    const tool = document.querySelector('#tool-title')!.closest('section')!;
    return !!(tool.compareDocumentPosition(ad) & Node.DOCUMENT_POSITION_FOLLOWING) && !tool.contains(ad);
  })).toBe(true);
  await page.goto('/tools');
  await expect(page.locator('[data-ad-slot="tools-promo"]')).toBeVisible();
});
