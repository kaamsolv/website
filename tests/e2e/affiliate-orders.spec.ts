import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

/**
 * WooCommerce orders credited by coupon code (Phase 3B), end to end on the dev server with SYNTHETIC signed deliveries:
 * the business connects a store and gives affiliates coupon codes, signed order webhooks arrive, and both sides see
 * recorded orders and sales. The rules and the database behaviour are in test/affiliate-orders*.test.mts and
 * test/affiliate-woo-webhook.test.mts. Nothing here touches a real store.
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const origin = { origin: BASE };
const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const slug = `ord-${tag}`;
let ipCounter = 40;

async function person(browser: Browser, address: string, width = 1280, scheme: 'light' | 'dark' = 'light'): Promise<Page> {
  const ip = `10.9.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;
  const ctx = await browser.newContext({ baseURL: BASE, colorScheme: scheme, extraHTTPHeaders: { 'x-forwarded-for': ip }, viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
  return page;
}
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const gmt = (offsetSeconds = 5) => new Date(Date.now() + offsetSeconds * 1000).toISOString().slice(0, 19);
function order(over: { id: number; coupons: string[]; status?: string; refunds?: string[]; lines?: string[]; created?: string; modified?: string }) {
  const lines = over.lines ?? ['1000.00', '500.00'];
  const created = over.created ?? gmt();
  return {
    id: over.id,
    number: `WT-${over.id}`,
    status: over.status ?? 'processing',
    currency: 'INR',
    date_created_gmt: created,
    date_modified_gmt: over.modified ?? created,
    total: '1650.00',
    total_tax: '100.00',
    shipping_total: '50.00',
    billing: { first_name: 'Test', email: 'buyer@example.test' },
    line_items: lines.map((t, i) => ({ id: i + 1, total: t })),
    coupon_lines: over.coupons.map((c, i) => ({ id: i + 1, code: c.toLowerCase() })),
    refunds: (over.refunds ?? []).map((t, i) => ({ id: i + 1, total: `-${t}` })),
  };
}
const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64');

type StoreView = { configured: boolean; connection: { webhookUrl: string; secret: string; ordersRecorded: number; ambiguousOrders: number; lastReceivedAt: string | null } | null };

test.describe.serial('WooCommerce orders', () => {
  let biz: Page;
  let riya: Page;
  let ravi: Page;
  let riyaApp = '';
  let raviApp = '';
  let hookPath = '';
  let secret = '';

  async function deliver(body: unknown, opts: { secret?: string; topic?: string; path?: string } = {}) {
    const text = JSON.stringify(body);
    return biz.request.post(opts.path ?? hookPath, {
      headers: { 'content-type': 'application/json', 'x-wc-webhook-topic': opts.topic ?? 'order.created', 'x-wc-webhook-signature': sign(opts.secret ?? secret, text), origin: BASE },
      data: text,
    });
  }

  test.beforeAll(async ({ browser }) => {
    await mkdir(SHOTS, { recursive: true });
    biz = await person(browser, `affpro-orders-${tag}@example.test`);
    riya = await person(browser, `free-orders-riya-${tag}@example.test`);
    ravi = await person(browser, `free-orders-ravi-${tag}@example.test`);
  });

  test('the business connects a store: address, hidden secret, plain steps, and it says it is waiting', async () => {
    expect((await biz.request.put('/api/affiliate/merchant', { headers: origin, data: { name: 'Orders Shop', slug, programmeName: 'Orders Partners' } })).status()).toBe(200);
    expect((await biz.request.put('/api/affiliate/programme', { headers: origin, data: { status: 'open' } })).status()).toBe(200);
    await biz.goto('/app/affiliate/portal');
    const card = biz.getByTestId('store-connection');
    await expect(card.getByRole('heading', { name: 'Store connection' })).toBeVisible();
    await card.getByRole('button', { name: 'Connect my store' }).click();

    await expect(biz.getByTestId('store-status')).toHaveText('Waiting for the first order from your store.');
    const url = biz.getByLabel('Webhook address');
    await expect(url).toHaveValue(/\/api\/affiliate\/woo\/[0-9a-f-]{36}$/);
    const secretBox = biz.getByLabel('Secret', { exact: true });
    await expect(secretBox).toHaveAttribute('type', 'password');
    const showBtn = card.getByRole('button', { name: 'Show', exact: true });
    await showBtn.click();
    await expect(secretBox).toHaveAttribute('type', 'text');
    await expect(card.getByRole('button', { name: 'Hide', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(biz.getByTestId('store-steps').getByRole('listitem')).toHaveCount(4);
    await expect(card.getByText('switches a webhook off by itself after 5 failed deliveries')).toBeVisible();
    await expect(card.getByRole('button', { name: 'What does this mean?' }).first()).toBeVisible();
    await biz.screenshot({ path: `${SHOTS}/affiliate-p3b-store-desktop.png`, fullPage: true });

    const view = (await (await biz.request.get('/api/affiliate/store')).json()) as StoreView;
    hookPath = new URL(view.connection!.webhookUrl).pathname;
    secret = view.connection!.secret;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    // Connecting again changes nothing.
    const again = (await (await biz.request.post('/api/affiliate/store', { headers: origin, data: { action: 'connect' } })).json()) as StoreView;
    expect(again.connection!.webhookUrl).toBe(view.connection!.webhookUrl);
  });

  test('two affiliates join; the business gives each a coupon in plain words, and a code can’t go to a second person', async () => {
    for (const [page, name] of [[riya, 'Riya Orders'], [ravi, 'Ravi Orders']] as const) {
      const applied = await page.request.post('/api/affiliate/apply', { headers: origin, data: { slug, displayName: name, openedAt: Date.now() - 9000 } });
      expect(applied.status(), await applied.text()).toBeLessThan(300);
    }
    const list = (await (await biz.request.get('/api/affiliate/applications')).json()) as { applications: { id: string; displayName: string }[] };
    riyaApp = list.applications.find((a) => a.displayName === 'Riya Orders')!.id;
    raviApp = list.applications.find((a) => a.displayName === 'Ravi Orders')!.id;
    for (const id of [riyaApp, raviApp]) expect((await biz.request.post(`/api/affiliate/applications/${id}`, { headers: origin, data: { decision: 'approved', note: '' } })).status()).toBe(200);

    await biz.goto('/app/affiliate/applications?status=approved');
    const row = biz.getByTestId('application').filter({ hasText: 'Riya Orders' });
    const field = row.getByLabel('Their coupon code');
    await field.fill('not valid!');
    await row.getByRole('button', { name: 'Save code' }).click();
    await expect(row.getByRole('alert').filter({ hasText: 'letters or numbers' })).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await field.fill('riya10');
    await row.getByRole('button', { name: 'Save code' }).click();
    await expect(row.getByRole('status').filter({ hasText: 'Orders that use RIYA10 are credited to them from now.' })).toBeVisible();
    await biz.screenshot({ path: `${SHOTS}/affiliate-p3b-coupon-desktop.png`, fullPage: true });

    const taken = await biz.request.put('/api/affiliate/coupon', { headers: origin, data: { applicationId: raviApp, code: 'RIYA10' } });
    expect(taken.status()).toBe(409);
    expect((await taken.json()).message).toContain('belongs to another affiliate');
    expect((await biz.request.put('/api/affiliate/coupon', { headers: origin, data: { applicationId: raviApp, code: 'RAVI10' } })).status()).toBe(200);
    // A replaced code is still never handed to someone else.
    expect((await biz.request.put('/api/affiliate/coupon', { headers: origin, data: { applicationId: riyaApp, code: 'RIYA20' } })).status()).toBe(200);
    expect((await biz.request.put('/api/affiliate/coupon', { headers: origin, data: { applicationId: raviApp, code: 'RIYA10' } })).status()).toBe(409);
    expect((await biz.request.put('/api/affiliate/coupon', { headers: origin, data: { applicationId: riyaApp, code: 'RIYA10' } })).status()).toBe(200);
    // Not your affiliate, and not signed in as the owner.
    expect((await riya.request.put('/api/affiliate/coupon', { headers: origin, data: { applicationId: riyaApp, code: 'SNEAKY1' } })).status()).toBe(404);
  });

  test('deliveries over HTTP: unsigned and wrongly signed are refused, an unknown address is 404, a signed order is recorded once', async () => {
    const o = order({ id: 9001, coupons: ['RIYA10'] });
    expect((await deliver(o, { secret: 'wrong' })).status()).toBe(401);
    expect((await deliver(o, { path: '/api/affiliate/woo/11111111-1111-4111-8111-111111111111' })).status()).toBe(404);
    const unsigned = await biz.request.post(hookPath, { headers: { 'content-type': 'application/json', origin: BASE }, data: JSON.stringify(o) });
    expect(unsigned.status()).toBe(401);
    expect((await (await biz.request.get('/api/affiliate/orders')).json()).orders).toHaveLength(0);

    const first = await deliver(o);
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ ok: true, code: 'recorded' });
    expect(first.headers()['cache-control']).toContain('no-store');
    expect(await (await deliver(o)).json()).toEqual({ ok: true, code: 'unchanged' });

    // A partly refunded, completed update moves the same order on.
    const done = order({ id: 9001, coupons: ['RIYA10'], status: 'completed', refunds: ['200.00'], created: o.date_created_gmt, modified: gmt(30) });
    expect(await (await deliver(done, { topic: 'order.updated' })).json()).toEqual({ ok: true, code: 'updated' });
    // An older "processing" arriving late is ignored.
    expect(await (await deliver(o, { topic: 'order.updated' })).json()).toEqual({ ok: true, code: 'unchanged' });
    // A second order, and an order with no affiliate coupon (not stored).
    expect((await deliver(order({ id: 9002, coupons: ['RIYA10'], lines: ['400.00'], status: 'completed' }))).status()).toBe(200);
    expect(await (await deliver(order({ id: 9003, coupons: ['WELCOME'] }))).json()).toEqual({ ok: true, code: 'not_credited' });
    // Both affiliates' coupons on one order: credited to nobody.
    expect(await (await deliver(order({ id: 9004, coupons: ['RIYA10', 'RAVI10'] }))).json()).toEqual({ ok: true, code: 'ambiguous' });
    // The setup ping WooCommerce sends is a success.
    const pingBody = 'webhook_id=7';
    const ping = await biz.request.post(hookPath, { headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-wc-webhook-signature': sign(secret, pingBody), origin: BASE }, data: pingBody });
    expect(await ping.json()).toEqual({ ok: true, code: 'ping' });
  });

  test('the affiliate sees their coupon, recorded orders and sales (net of the refund), and the latest orders', async () => {
    await riya.goto('/app/affiliate/programmes');
    const card = riya.getByTestId('orders-card');
    await expect(card).toBeVisible();
    await expect(riya.getByTestId('orders-coupon')).toHaveText('RIYA10');
    await expect(riya.getByTestId('orders-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=.*RIYA10/);
    await expect(riya.getByTestId('orders-count-30')).toHaveText('2');
    await expect(riya.getByTestId('orders-count-all')).toHaveText('2');
    // 9001: 1,500 - 200 refunded = 1,300; 9002: 400. In all 1,700.
    await expect(riya.getByTestId('sales-lines')).toContainText('₹1,700');
    const rows = card.getByTestId('order-row');
    await expect(rows).toHaveCount(2);
    const partly = rows.filter({ hasText: 'WT-9001' });
    await expect(partly.getByTestId('order-net')).toHaveText('₹1,300');
    await expect(partly.getByTestId('order-refunded')).toHaveText('₹200 refunded');
    await expect(partly.getByTestId('order-status')).toHaveText('Completed');
    await expect(card.getByText(/Recorded orders/)).toBeVisible();
    await expect(card.getByText(/visitors|unique|commission/i).first()).toBeHidden();
    await expect(card).not.toContainText('buyer@example.test');
    await riya.screenshot({ path: `${SHOTS}/affiliate-p3b-orders-card-desktop.png`, fullPage: true });

    // Ravi has his own code and no orders; he sees none of Riya's.
    await ravi.goto('/app/affiliate/programmes');
    await expect(ravi.getByTestId('orders-coupon')).toHaveText('RAVI10');
    await expect(ravi.getByTestId('orders-count-all')).toHaveText('0');
    await expect(ravi.getByTestId('order-row')).toHaveCount(0);
    await expect(ravi.getByText('No orders recorded yet. When a customer uses your code, it shows up here.')).toBeVisible();
    await expect(ravi.locator('body')).not.toContainText('WT-9001');
  });

  test('the business sees the same numbers per affiliate, the orders page, the connection status and the uncredited count', async () => {
    await biz.goto('/app/affiliate/applications?status=approved');
    const row = biz.getByTestId('application').filter({ hasText: 'Riya Orders' });
    await expect(row.getByTestId('recorded-orders')).toContainText('2');
    await expect(row.getByTestId('sales-lines')).toContainText('₹1,700');
    await expect(biz.getByTestId('application').filter({ hasText: 'Ravi Orders' }).getByTestId('recorded-orders')).toContainText('0');

    await biz.goto('/app/affiliate/orders');
    await expect(biz.getByRole('heading', { name: 'Orders' })).toBeVisible();
    const table = biz.getByTestId('orders-table');
    await expect(table.getByTestId('orders-table-row')).toHaveCount(2);
    await expect(table.getByRole('columnheader', { name: 'Sales' })).toBeVisible();
    await expect(table).toContainText('Riya Orders');
    await expect(table).toContainText('RIYA10');
    await expect(table).not.toContainText('buyer@example.test');
    await biz.screenshot({ path: `${SHOTS}/affiliate-p3b-orders-desktop.png`, fullPage: true });
    await expect(biz.getByTestId('nav-created-orders')).toBeVisible();

    await biz.goto('/app/affiliate/portal');
    await expect(biz.getByTestId('store-status')).toContainText('Last order received');
    await expect(biz.getByTestId('store-status')).toContainText('2 recorded');
    await expect(biz.getByTestId('store-ambiguous')).toContainText('1 order used more than one affiliate’s coupon, so it was credited to nobody.');
  });

  test('changing the secret stops the old one at once; disconnecting stops deliveries; recorded orders stay', async () => {
    await biz.goto('/app/affiliate/portal');
    await biz.getByRole('button', { name: 'Change secret…' }).click();
    await expect(biz.getByRole('alertdialog')).toContainText('The old one stops working straight away');
    await biz.getByRole('button', { name: 'Cancel' }).click();
    await biz.getByRole('button', { name: 'Change secret…' }).click();
    await biz.getByRole('button', { name: 'Change secret', exact: true }).click();
    await expect(biz.getByTestId('store-url')).toBeVisible();
    const fresh = (await (await biz.request.get('/api/affiliate/store')).json()) as StoreView;
    expect(fresh.connection!.secret).not.toBe(secret);
    const o = order({ id: 9010, coupons: ['RIYA10'] });
    expect((await deliver(o)).status(), 'the old secret').toBe(401);
    expect((await deliver(o, { secret: fresh.connection!.secret })).status()).toBe(200);

    await biz.getByRole('button', { name: 'Disconnect…' }).click();
    await biz.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(biz.getByRole('button', { name: 'Connect my store' })).toBeVisible();
    expect((await deliver(o, { secret: fresh.connection!.secret })).status()).toBe(404);
    expect((await (await biz.request.get('/api/affiliate/orders')).json()).orders.length).toBeGreaterThanOrEqual(3);
  });

  test('only the owner reaches the store connection and orders: signed-out and other accounts get nothing', async ({ browser }) => {
    const stranger = await person(browser, `free-orders-stranger-${tag}@example.test`);
    expect((await stranger.request.get('/api/affiliate/store')).status()).toBe(404);
    expect((await stranger.request.get('/api/affiliate/orders')).status()).toBe(404);
    expect((await stranger.request.post('/api/affiliate/store', { headers: origin, data: { action: 'connect' } })).status()).toBe(404);
    const anon = await browser.newContext({ baseURL: BASE });
    expect((await anon.request.get('/api/affiliate/store')).status()).toBe(401);
    expect((await anon.request.get('/api/affiliate/orders')).status()).toBe(401);
    expect((await anon.request.put('/api/affiliate/coupon', { headers: origin, data: { applicationId: riyaApp, code: 'X' } })).status()).toBe(401);
    // Someone else's session can't read a stranger's numbers through the affiliate API.
    const mine = (await (await stranger.request.get('/api/affiliate/me')).json()) as { applications: unknown[] };
    expect(mine.applications).toHaveLength(0);
  });

  for (const [width, scheme] of [[375, 'light'], [360, 'dark'], [320, 'light'], [320, 'dark']] as const) {
    test(`phone width ${width}px, ${scheme}: connection, coupon, orders card and orders list fit with notes open`, async ({ browser }) => {
      const b = await person(browser, `affpro-orders-${tag}@example.test`, width, scheme);
      const r = await person(browser, `free-orders-riya-${tag}@example.test`, width, scheme);
      // The store was disconnected above; connect again to see the whole card.
      await b.request.post('/api/affiliate/store', { headers: origin, data: { action: 'connect' } });

      await b.goto('/app/affiliate/portal');
      await b.getByTestId('store-connection').getByRole('button', { name: 'What does this mean?' }).first().click();
      await b.getByRole('button', { name: 'Show', exact: true }).click();
      await expect(b.getByTestId('store-steps')).toBeVisible();
      expect(await sideways(b), 'store connection').toBeLessThanOrEqual(0);
      await b.screenshot({ path: `${SHOTS}/affiliate-p3b-store-${width}-${scheme}.png`, fullPage: true });

      await b.goto('/app/affiliate/applications?status=approved');
      await b.getByTestId('application').first().getByRole('button', { name: 'What does this mean?' }).first().click();
      expect(await sideways(b), 'applications').toBeLessThanOrEqual(0);
      await b.screenshot({ path: `${SHOTS}/affiliate-p3b-coupon-${width}-${scheme}.png`, fullPage: true });

      await b.goto('/app/affiliate/orders');
      await b.getByRole('button', { name: 'What does this mean?' }).first().click();
      await expect(b.getByTestId('orders-stack')).toBeVisible();
      await expect(b.getByTestId('orders-table')).toBeHidden();
      expect(await sideways(b), 'orders list').toBeLessThanOrEqual(0);
      await b.screenshot({ path: `${SHOTS}/affiliate-p3b-orders-${width}-${scheme}.png`, fullPage: true });

      await r.goto('/app/affiliate/programmes');
      const card = r.getByTestId('orders-card');
      await card.getByRole('button', { name: 'What does this mean?' }).first().click();
      await card.getByRole('button', { name: 'What does this mean?' }).nth(1).click();
      await expect(card.getByTestId('order-row').first()).toBeVisible();
      expect(await sideways(r), 'orders card').toBeLessThanOrEqual(0);
      await r.screenshot({ path: `${SHOTS}/affiliate-p3b-orders-card-${width}-${scheme}.png`, fullPage: true });
    });
  }
});
