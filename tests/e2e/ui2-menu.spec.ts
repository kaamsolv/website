import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * UI 2.0: the frozen workspace menu. Products in four looks (Pro, Free while you're inside, Upgrade, Soon),
 * the product page they open, and the editors that now open inside the workspace.
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Your workspace' });
const row = (page: Page, slug: string) => nav(page).locator(`[data-product="${slug}"]`);

test.use({ viewport: { width: 1440, height: 900 } });

test('a free account: Invoices and QR both say Free (QR has a Pro page behind it), PDF says Soon', async ({ page }) => {
  await signIn(page, email('free-menu'));
  await page.goto('/app/invoices');
  await expect(row(page, 'invoices')).toHaveAttribute('data-state', 'free');
  await expect(row(page, 'invoices')).toContainText('Free');
  await expect(row(page, 'qr')).toHaveAttribute('data-state', 'upgrade');
  await expect(row(page, 'qr')).toContainText('Free'); // same label as the hub; the row opens QR Pro
  await expect(row(page, 'qr')).toHaveAttribute('href', '/app/products/qr');
  await expect(row(page, 'pdf')).toHaveAttribute('data-state', 'soon');
  await expect(row(page, 'pdf')).toContainText('Soon');
  await expect(row(page, 'pdf')).toHaveAttribute('href', '/app/products/pdf');
  // Inside Invoices: its free pages, no Pro pages, and the way to unlock them.
  await expect(nav(page).getByRole('link', { name: 'All invoices' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Overview' })).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'Unlock Invoice Pro' })).toHaveAttribute('href', '/app/products/invoices');
  // Coupons are not offered: there is no such product.
  await expect(nav(page).getByText('Coupons')).toHaveCount(0);
});

test('a free account in QR sees QR as Free with its pages and an unlock line; Invoices opens its Pro page', async ({ page }) => {
  await signIn(page, email('free-menu2'));
  await page.goto('/app/qr');
  await expect(row(page, 'qr')).toHaveAttribute('data-state', 'free');
  await expect(nav(page).getByRole('link', { name: 'Unlock QR Pro' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Campaigns' })).toHaveCount(0);
  await expect(row(page, 'invoices')).toHaveAttribute('data-state', 'upgrade');
});

test('an Invoice Pro account: Invoices is Pro with all its pages; QR still opens its Pro page', async ({ page }) => {
  await signIn(page, email('pro-menu'));
  await page.goto('/app/invoices/overview');
  await expect(row(page, 'invoices')).toHaveAttribute('data-state', 'pro');
  await expect(row(page, 'invoices')).toContainText('Pro');
  await expect(nav(page).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('link', { name: 'Unlock Invoice Pro' })).toHaveCount(0);
  await expect(row(page, 'qr')).toHaveAttribute('data-state', 'upgrade');
});

// The QR Pro page itself is covered in qr-pro-page.spec.ts; here: the way in from the menu.
test('the QR row opens the QR Pro page; the top bar still says QR codes and the free product stays reachable', async ({ page }) => {
  await signIn(page, email('free-prod'));
  await page.goto('/app/invoices');
  // Until the plan has loaded the row is neutral (it opens the product home); wait for it to know it has a Pro page behind it.
  await expect(row(page, 'qr')).toHaveAttribute('data-state', 'upgrade');
  await row(page, 'qr').click();
  await expect(page).toHaveURL(/\/app\/products\/qr$/);
  await expect(page.getByRole('heading', { level: 1, name: 'QR Pro' })).toBeVisible();
  await expect(page.getByTestId('workspace-app-name')).toHaveText('QR codes');
  const prod = page.getByTestId('product-page');
  await expect(prod.getByTestId('free-link')).toHaveAttribute('href', '/app/qr');
  await expect(row(page, 'qr')).toHaveAttribute('aria-current', 'page');
});

test('a subscribed product page says so and has no subscribe button; the PDF page is honest about being early', async ({ page }) => {
  await signIn(page, email('pro-prod'));
  await page.goto('/app/products/invoices');
  const prod = page.getByTestId('product-page');
  await expect(prod.getByText('You have Invoice Pro')).toBeVisible();
  await expect(prod.getByTestId('subscribe')).toHaveCount(0);
  await expect(prod.getByRole('link', { name: 'Open Invoices' })).toHaveAttribute('href', '/app/invoices');

  await page.goto('/app/products/pdf');
  const pdf = page.getByTestId('product-page');
  await expect(pdf.getByText('It is not available yet.')).toBeVisible();
  await expect(pdf.getByTestId('subscribe')).toHaveCount(0);
  await expect(pdf.getByRole('link', { name: 'Open the free PDF tools' })).toHaveAttribute('href', '/pdf-tools');
  await expect(row(page, 'pdf')).toHaveAttribute('aria-current', 'page');
});

test('product pages need a sign-in, and an unknown product is a 404', async ({ page }) => {
  await page.goto('/app/products/qr');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fproducts%2Fqr/);
  await signIn(page, email('free-404'));
  const res = await page.goto('/app/products/nope');
  expect(res?.status()).toBe(404);
});

test('invoices open inside the workspace: new, save, reopen; the public page is untouched', async ({ page }) => {
  await signIn(page, email('free-editor'));
  await page.goto('/app/invoices');
  await page.getByRole('link', { name: '+ New invoice' }).click();
  await expect(page).toHaveURL(/\/app\/invoices\/editor$/);
  await expect(nav(page)).toBeVisible(); // still in the workspace
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await page.getByLabel('Your business name').fill('Pat Studio');
  await page.getByLabel('Client name').fill('Workspace Client');
  await page.getByLabel('Item 1 description').fill('Design work');
  await page.getByLabel('Item 1 rate').fill('5000');
  await expect(page.getByTestId('invoice-total')).toHaveText('₹5,000.00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/invoices\/editor\?id=[0-9a-f-]{36}$/);
  await page.goto('/app/invoices');
  const open = page.getByRole('link', { name: /^Open / }).first();
  await expect(open).toHaveAttribute('href', /^\/app\/invoices\/editor\?id=/);
  await open.click();
  await expect(page).toHaveURL(/\/app\/invoices\/editor\?id=/);
  await expect(page.getByLabel('Client name')).toHaveValue('Workspace Client');

  // Signed out, the public editor is unchanged and the workspace one asks you to log in.
  await page.context().clearCookies();
  await page.goto('/invoice-generator');
  await expect(page).toHaveURL(/\/invoice-generator$/);
  await page.goto('/app/invoices/editor');
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('QR codes open inside the workspace too', async ({ page }) => {
  await signIn(page, email('free-qrnew'));
  await page.goto('/app/qr');
  await page.getByRole('link', { name: '+ New QR code' }).click();
  await expect(page).toHaveURL(/\/app\/qr\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'New QR code' })).toBeVisible();
  await expect(nav(page)).toBeVisible();
  await expect(page.getByText('What should this QR do?')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1440, 768, 375]) {
    test(`${width}px ${scheme}: menu and product page; screenshots`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      await signIn(page, email('free-shots'));
      await page.goto('/app/products/qr');
      await page.waitForLoadState('networkidle');
      if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.screenshot({ path: `${SHOTS}/ui2-menu-free-${width}-${scheme}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.context().clearCookies();
      await signIn(page, email('pro-shots'));
      await page.goto('/app/invoices/overview');
      await page.waitForLoadState('networkidle');
      if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.screenshot({ path: `${SHOTS}/ui2-menu-pro-${width}-${scheme}.png` });
    });
  }
}
