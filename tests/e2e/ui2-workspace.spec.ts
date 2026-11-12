import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * UI 2.0, application side: the WorkspaceShell around /app/*. Per-page sign-in checks and entitlement
 * visibility are unchanged; this covers the frame (top bar, sidebar, drawer, no footer, full width).
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Your workspace' });

test('signed out: every workspace area still sends you to log in, with the way back', async ({ page }) => {
  for (const path of ['/app', '/app/invoices', '/app/qr', '/app/business']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%/g, '%')}`));
  }
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a free account: top bar, sidebar with the active page, full-width content, no marketing footer', async ({ page }) => {
    await signIn(page, email('free-ui2'));
    await page.goto('/app/invoices');
    await expect(page.getByTestId('workspace-app-name')).toHaveText('Invoices');
    await expect(page.getByRole('heading', { level: 1, name: 'All invoices' })).toBeVisible();
    await expect(nav(page)).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'All invoices' })).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).getByRole('link', { name: 'Overview' })).toHaveCount(0); // Pro-only: free accounts see no dead end
    await expect(nav(page).getByRole('link', { name: 'QR codes' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toHaveCount(0); // no marketing footer in a workspace
    await expect(page.getByRole('button', { name: /Account menu/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'KaamSolv home' })).toBeVisible();
    // Content uses the available width (not the 1200px marketing column).
    const width = await page.locator('main#main').evaluate((e) => e.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a Pro account sees the Pro pages in the same navigation', async ({ page }) => {
    await signIn(page, email('pro-ui2'));
    await page.goto('/app/invoices/overview');
    await expect(nav(page).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).getByRole('link', { name: 'Payments & collections' })).toBeVisible();
  });

  test('the QR area names itself and keeps its own pages', async ({ page }) => {
    await signIn(page, email('free-ui2qr'));
    await page.goto('/app/qr');
    await expect(page.getByTestId('workspace-app-name')).toHaveText('QR codes');
    await expect(nav(page).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).getByRole('link', { name: 'All QR codes' })).toBeVisible();
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the sidebar is a drawer: closed by default, opens, navigates, closes with Escape', async ({ page }) => {
    await signIn(page, email('free-ui2m'));
    await page.goto('/app/invoices');
    await expect(page.getByRole('heading', { level: 1, name: 'All invoices' })).toBeVisible();
    await expect(nav(page)).toHaveCount(0); // hidden from the page and from assistive tech while closed
    const toggle = page.getByRole('button', { name: 'Open navigation' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
    await expect(nav(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await nav(page).getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/app\/business\/customers$/);
    await expect(nav(page)).toHaveCount(0); // closed again after navigating
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('tapping the backdrop closes the drawer', async ({ page }) => {
    await signIn(page, email('free-ui2b'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(nav(page)).toBeVisible();
    await page.getByTestId('workspace-backdrop').click({ position: { x: 350, y: 300 } });
    await expect(nav(page)).toHaveCount(0);
  });
});

const PAGES: [string, string, string][] = [
  ['invoices', '/app/invoices', 'free'],
  ['overview', '/app/invoices/overview', 'pro'],
  ['qr', '/app/qr', 'free'],
];
for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1440, 768, 375]) {
    test(`${width}px ${scheme}: workspace pages fit; screenshots`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(e.message));
      for (const [label, path, plan] of PAGES) {
        await signIn(page, email(`${plan}-ui2s`));
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: no sideways scroll`).toBe(true);
        await page.screenshot({ path: `${SHOTS}/ui2-ws-${label}-${width}-${scheme}.png`, fullPage: true });
      }
      expect(problems).toEqual([]);
    });
  }
}

test.describe('ads follow the plan', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a free account sees the slots; a Pro account sees none, on tool pages and in the workspace', async ({ page }) => {
    await signIn(page, email('free-ads'));
    await page.goto('/app/invoices');
    await expect(page.locator('[data-ad-slot="workspace-footer"]')).toBeVisible();
    await page.goto('/gst-calculator');
    await expect(page.locator('[data-ad-slot="gst-calculator-below-tool"]')).toBeVisible();

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await signIn(page, email('pro-ads'));
    await page.goto('/app/invoices/overview');
    await expect(page.getByRole('heading', { level: 1, name: 'Invoices overview' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-ad-slot]')).toHaveCount(0);
    await page.goto('/gst-calculator');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-ad-slot]')).toHaveCount(0);
    await page.goto('/tools');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-ad-slot]')).toHaveCount(0);
  });
});
