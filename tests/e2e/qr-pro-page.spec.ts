import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * The QR Pro page (/app/products/qr): the five states of the status block, the truthful copy, the free paths,
 * the unchanged Invoice Pro bundle cross-sell, and layout/theme/keyboard checks. The e2e database has no
 * Razorpay keys, so "payments aren't available" is the default; the other states stub GET /api/billing/status.
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}

const row = (planKey: string, period: string, amountPaise: number) => ({ planKey, period, amountPaise, name: planKey, currency: 'INR' });
const PRICES = [row('invoice_pro', 'month', 15000), row('qr_pro', 'month', 9900), row('qr_pro', 'year', 99000), row('invoice_qr_bundle', 'month', 19900)];
const status = (over: Record<string, unknown> = {}) => ({ ok: true, configured: true, taxRate: 18, prices: PRICES, subscriptions: [], payments: [], ...over });

async function stub(page: Page, body: unknown, httpStatus = 200, delayMs = 0) {
  await page.route('**/api/billing/status', async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status: httpStatus, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const open = async (page: Page, tag = 'free-qrpro') => {
  await signIn(page, email(tag));
  await page.goto('/app/products/qr');
};
const prod = (page: Page) => page.getByTestId('product-page');

test.use({ viewport: { width: 1440, height: 900 } });

test('payments not available (the default here): the heading, the notice, no price, no Subscribe, a prominent free link, all the features', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'QR Pro' })).toBeVisible();
  await expect(page.getByTestId('workspace-app-name')).toHaveText('QR codes');
  await expect(page).toHaveTitle(/^QR Pro/);
  await expect(prod(page)).toHaveAttribute('data-state', 'unavailable');
  await expect(prod(page).getByTestId('qr-unavailable')).toContainText('QR Pro subscriptions aren’t available yet.');
  await expect(prod(page).getByTestId('qr-price')).toHaveCount(0);
  await expect(prod(page).getByTestId('subscribe')).toHaveCount(0);
  const free = prod(page).getByTestId('free-link');
  await expect(free).toHaveText('Keep using free QR codes');
  await expect(free).toHaveAttribute('href', '/app/qr');
  await expect(prod(page).getByTestId('free-new')).toHaveText('Make a free QR code');
  await expect(prod(page).getByTestId('free-new')).toHaveAttribute('href', '/app/qr/new');
  // The feature list is there even though checkout is not.
  await expect(prod(page).getByTestId('qr-pro-facts').getByRole('listitem')).toHaveCount(5);
  await expect(prod(page).getByRole('heading', { level: 3 })).toHaveText(['Where scans come from', '90 days of history', 'Campaigns', 'CSV export', 'Track more than 3 codes']);
});

test('checkout available: price, Subscribe to the plan, and the free link still there; GST only when the server sends a rate', async ({ page }) => {
  await stub(page, status());
  await open(page);
  await expect(prod(page)).toHaveAttribute('data-state', 'available');
  await expect(prod(page).getByTestId('qr-price')).toHaveText('₹99 a month or ₹990 a year');
  await expect(prod(page).getByTestId('qr-gst')).toHaveText('Includes 18% GST.');
  await expect(prod(page).getByTestId('subscribe')).toHaveText('Subscribe to QR Pro');
  await expect(prod(page).getByTestId('subscribe')).toHaveAttribute('href', '/app/billing#plan-qr_pro');
  await expect(prod(page).getByTestId('free-link')).toHaveAttribute('href', '/app/qr');
  await expect(prod(page).getByTestId('qr-unavailable')).toHaveCount(0);
  await prod(page).getByTestId('subscribe').click();
  await expect(page).toHaveURL(/\/app\/billing#plan-qr_pro$/);

  await page.unroute('**/api/billing/status');
  await stub(page, status({ taxRate: null, prices: [row('qr_pro', 'month', 9900)] }));
  await page.goto('/app/products/qr');
  await expect(prod(page).getByTestId('qr-price')).toHaveText('₹99 a month');
  await expect(prod(page).getByTestId('qr-gst')).toHaveCount(0);
});

test('configured but no QR Pro price: treated as not available', async ({ page }) => {
  await stub(page, status({ prices: [row('invoice_pro', 'month', 15000)] }));
  await open(page);
  await expect(prod(page)).toHaveAttribute('data-state', 'unavailable');
  await expect(prod(page).getByTestId('subscribe')).toHaveCount(0);
  await expect(prod(page).getByTestId('free-link')).toBeVisible();
});

test('status check fails (server error, or an answer we can’t read): says so, keeps the free path, shows no price', async ({ page }) => {
  await stub(page, { ok: false }, 500);
  await open(page);
  await expect(prod(page)).toHaveAttribute('data-state', 'error');
  await expect(prod(page).getByTestId('qr-error')).toContainText('We couldn’t check whether subscriptions are available. Try again in a moment.');
  await expect(prod(page).getByTestId('qr-price')).toHaveCount(0);
  await expect(prod(page).getByTestId('subscribe')).toHaveCount(0);
  await expect(prod(page).getByTestId('free-link')).toHaveAttribute('href', '/app/qr');
  await expect(prod(page).getByTestId('free-new')).toHaveAttribute('href', '/app/qr/new');

  await page.unroute('**/api/billing/status');
  await stub(page, { unexpected: true }, 200);
  await page.goto('/app/products/qr');
  await expect(prod(page)).toHaveAttribute('data-state', 'error');
});

test('while checking: a reserved status area, the free link already visible, no price and no Subscribe; then it settles', async ({ page }) => {
  await stub(page, status(), 200, 1500);
  await signIn(page, email('free-load'));
  await page.goto('/app/products/qr');
  await expect(prod(page)).toHaveAttribute('data-state', 'loading');
  await expect(prod(page).getByTestId('qr-status')).toHaveAttribute('aria-busy', 'true');
  await expect(prod(page).getByTestId('free-link')).toBeVisible();
  await expect(prod(page).getByTestId('subscribe')).toHaveCount(0);
  await expect(prod(page).getByTestId('qr-price')).toHaveCount(0);
  await expect(prod(page)).toHaveAttribute('data-state', 'available', { timeout: 10_000 });
  await expect(prod(page).getByTestId('qr-status')).toHaveAttribute('aria-busy', 'false');
});

test('the copy is truthful: export cap as secondary detail; no ceilings, no "no ads", no bundle, no yearly saving', async ({ page }) => {
  await stub(page, status());
  await open(page);
  const text = (await prod(page).innerText()).replace(/\s+/g, ' ');
  expect(text).toContain('50,000 scans');
  const csv = prod(page).getByTestId('qr-pro-facts').getByRole('listitem').filter({ hasText: 'CSV export' });
  await expect(csv.locator('p').nth(0)).toHaveText('Download your codes or your scans as CSV.');
  await expect(csv.locator('p').nth(1)).toContainText('One file holds up to 50,000 scans.');
  await expect(csv.locator('p').nth(1)).toHaveClass(/text-xs/); // smaller than the headline sentence
  expect(text).not.toMatch(/2,?000|50 campaigns|no ads|bundle|two months|yearly saving|annual|per year/i);
  await expect(prod(page).getByText('Scans count people, not bots or unique visitors.')).toBeVisible();
  await expect(prod(page).getByText('Country is approximate', { exact: false })).toBeVisible();
});

test('the specimen is labelled illustrative, is a figure with a text description, and the picture is hidden from assistive tech', async ({ page }) => {
  await open(page);
  const fig = prod(page).getByTestId('qr-specimen');
  await expect(fig).toBeVisible();
  await expect(fig.getByTestId('illustrative-chip')).toHaveText('Illustrative sample');
  await expect(fig.getByTestId('specimen-caption')).toContainText('Illustrative sample, not from your account.');
  await expect(fig.getByTestId('specimen-caption')).toContainText('Scan the code to open the free KaamSolv QR generator.');
  expect(await fig.evaluate((e) => e.tagName.toLowerCase())).toBe('figure');
  expect(await fig.locator('svg').evaluateAll((els) => els.every((e) => !!e.closest('[aria-hidden="true"]')))).toBe(true);
  // The three breakdown cards use the real analytics titles.
  for (const t of ['Where (country)', 'Device type', 'Referring site']) await expect(fig.getByText(t, { exact: true })).toBeVisible();
});

test('a QR Pro account sees the subscribed view: no sales page, no specimen, no billing request, links to its pages', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => r.url().includes('/api/billing/status') && asked.push(r.url()));
  await open(page, 'qrpro-qrpage');
  await expect(prod(page)).toHaveAttribute('data-state', 'subscribed');
  await expect(prod(page).getByText('You have QR Pro')).toBeVisible();
  await expect(prod(page).getByRole('link', { name: 'Open QR codes' })).toHaveAttribute('href', '/app/qr');
  await expect(prod(page).getByRole('link', { name: 'Campaigns' })).toHaveAttribute('href', '/app/qr/campaigns');
  await expect(prod(page).getByRole('link', { name: 'Scan analytics' })).toHaveAttribute('href', '/app/qr/analytics');
  await expect(prod(page).getByRole('link', { name: 'Reports & exports' })).toHaveAttribute('href', '/app/qr/exports');
  await expect(prod(page).getByTestId('qr-specimen')).toHaveCount(0);
  await expect(prod(page).getByTestId('subscribe')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(asked, 'no billing status request for an account that already has the plan').toEqual([]);
});

test('Invoice Pro bundle cross-sell is unchanged on the Invoices page and absent from the QR page', async ({ page }) => {
  await signIn(page, email('free-bundle'));
  await page.goto('/app/products/invoices');
  const inv = prod(page);
  await expect(inv.getByText('Invoice Pro and QR Pro are also sold together as a bundle.')).toBeVisible();
  await expect(inv.getByRole('link', { name: 'See Plans and billing' })).toHaveAttribute('href', '/app/billing');
  // Its other content is the generic page, as before.
  await expect(inv.getByText('You get with Invoice Pro')).toBeVisible();
  await expect(inv.getByTestId('subscribe')).toHaveAttribute('href', '/app/billing#plan-invoice_pro');

  await page.goto('/app/products/qr');
  await expect(prod(page)).toHaveAttribute('data-product', 'qr');
  expect((await prod(page).innerText()).toLowerCase()).not.toContain('bundle');

  // Invoice Pro holders don't get the cross-sell line (existing behaviour: shown only when not subscribed).
  await page.context().clearCookies();
  await signIn(page, email('pro-bundle'));
  await page.goto('/app/products/invoices');
  await expect(prod(page).getByText('You have Invoice Pro')).toBeVisible();
  await expect(prod(page).getByText('also sold together as a bundle')).toHaveCount(0);
});

test('keyboard: the free link and Subscribe come before the specimen, show a focus ring, and are at least 44px tall', async ({ page }) => {
  await stub(page, status());
  await open(page);
  await expect(prod(page)).toHaveAttribute('data-state', 'available');
  const order = await page.evaluate(() => {
    const pos = (id: string) => document.querySelector(`[data-testid="${id}"]`)!;
    const spec = pos('qr-specimen');
    return ['subscribe', 'free-link'].map((id) => !!(pos(id).compareDocumentPosition(spec) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(order).toEqual([true, true]);
  for (const id of ['subscribe', 'free-link', 'free-new']) {
    const box = await prod(page).getByTestId(id).boundingBox();
    expect(box!.height, id).toBeGreaterThanOrEqual(43.5);
  }
  // Tab to the free link and check that the focus ring (a box-shadow) is drawn.
  let focused = false;
  for (let i = 0; i < 40 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'free-link');
  }
  expect(focused, 'the free link is reachable with Tab').toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow)).not.toBe('none');
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1440, 768, 375, 320]) {
    test(`${width}px ${scheme}: QR Pro page fits in every state; screenshots`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      await signIn(page, email('free-qrshots'));
      const states: [string, () => Promise<void>][] = [
        ['unavailable', async () => undefined],
        ['available', async () => stub(page, status())],
        ['error', async () => stub(page, { ok: false }, 500)],
      ];
      for (const [name, setup] of states) {
        await page.unroute('**/api/billing/status').catch(() => undefined);
        await setup();
        await page.goto('/app/products/qr');
        await expect(prod(page)).toHaveAttribute('data-state', name);
        await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no sideways scroll`).toBe(true);
        const free = await prod(page).getByTestId('free-link').boundingBox();
        expect(free!.height).toBeGreaterThanOrEqual(43.5);
        expect(free!.x + free!.width, 'free link stays on screen').toBeLessThanOrEqual(width + 0.5);
        // The sample QR stays big enough to scan, the 90-day chart gets real width.
        const qr = await prod(page).getByTestId('qr-specimen').locator('svg').first().boundingBox();
        expect(qr!.width).toBeGreaterThanOrEqual(120);
        const chart = await prod(page).getByTestId('qr-specimen').locator('svg').nth(1).boundingBox();
        expect(chart!.width).toBeGreaterThanOrEqual(width <= 375 ? 200 : 300);
        await page.screenshot({ path: `${SHOTS}/qr-pro-${name}-${width}-${scheme}.png`, fullPage: true });
      }
    });
  }
}
