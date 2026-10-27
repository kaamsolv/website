import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

/**
 * Billing M1 over HTTP and in the browser. The Razorpay API keys are not set here, so nothing can reach
 * Razorpay: these tests cover the webhook's front door (signature, headers, shape), the signed-out and
 * unconfigured states, and the page. What a verified event does to payments and plans is covered, against
 * real Postgres, in test/billing.test.mts.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
const SHOTS = 'test-results/screenshots';

const sign = (body: string) => createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
const body = JSON.stringify({ event: 'payment.authorized', payload: {} });

test.describe('the webhook front door', () => {
  test('a missing, wrong or tampered signature is refused with 400', async ({ request }) => {
    const none = await request.post('/api/billing/webhook', { data: body, headers: { 'content-type': 'application/json', 'x-razorpay-event-id': 'evt_e2e_1' } });
    expect(none.status()).toBe(400);
    const wrong = await request.post('/api/billing/webhook', { data: body, headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'a'.repeat(64), 'x-razorpay-event-id': 'evt_e2e_1' } });
    expect(wrong.status()).toBe(400);
    const tampered = await request.post('/api/billing/webhook', { data: body + ' ', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(body), 'x-razorpay-event-id': 'evt_e2e_1' } });
    expect(tampered.status()).toBe(400);
    expect(await tampered.text()).not.toContain(WEBHOOK_SECRET);
  });

  test('a correctly signed event is accepted, and the same event again is a no-op', async ({ request }) => {
    const id = `evt_e2e_${Date.now()}`;
    const headers = { 'content-type': 'application/json', 'x-razorpay-signature': sign(body), 'x-razorpay-event-id': id };
    const first = await request.post('/api/billing/webhook', { data: body, headers });
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, result: 'ignored' });
    const again = await request.post('/api/billing/webhook', { data: body, headers });
    expect(again.status()).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, result: 'duplicate' });
  });

  test('a signed body without an event id, or that is not Razorpay JSON, is refused', async ({ request }) => {
    const noId = await request.post('/api/billing/webhook', { data: body, headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(body) } });
    expect(noId.status()).toBe(400);
    const junk = 'not json at all';
    const bad = await request.post('/api/billing/webhook', { data: junk, headers: { 'content-type': 'text/plain', 'x-razorpay-signature': sign(junk), 'x-razorpay-event-id': 'evt_e2e_junk' } });
    expect(bad.status()).toBe(400);
  });

  test('a payment for an order that does not exist grants nothing', async ({ request }) => {
    const captured = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_e2e', order_id: 'order_e2e_none', amount: 14900, currency: 'INR' } } } });
    const res = await request.post('/api/billing/webhook', {
      data: captured,
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(captured), 'x-razorpay-event-id': `evt_e2e_cap_${Date.now()}` },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ result: 'ignored' });
  });
});

test.describe('checkout and status', () => {
  test('signed out: the status and checkout routes say sign in', async ({ request }) => {
    expect((await request.get('/api/billing/status')).status()).toBe(401);
    const res = await request.post('/api/billing/checkout', { data: { planKey: 'invoice_pro', period: 'month' }, headers: { origin: BASE } });
    expect([401, 503]).toContain(res.status());
  });

  test('a cross-site checkout request is refused', async ({ request }) => {
    const res = await request.post('/api/billing/checkout', { data: { planKey: 'invoice_pro', period: 'month' }, headers: { origin: 'https://evil.example' } });
    expect(res.status()).toBe(403);
  });

  test('signed in, with payments not switched on: the page says so, plainly, and checkout is refused', async ({ page }) => {
    const email = `billing-${Date.now()}@example.test`;
    const signIn = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email, name: 'Pat Example' } });
    expect(signIn.status()).toBe(200);

    const status = await page.request.get('/api/billing/status');
    expect(status.status()).toBe(200);
    const data = (await status.json()) as { configured: boolean; prices: { planKey: string; period: string; amountPaise: number }[]; subscriptions: unknown[]; payments: unknown[] };
    expect(data.configured).toBe(false);
    expect(data.prices.find((p) => p.planKey === 'invoice_pro' && p.period === 'month')?.amountPaise).toBe(14900);
    expect(data.subscriptions).toEqual([]);

    const checkout = await page.request.post('/api/billing/checkout', { data: { planKey: 'invoice_pro', period: 'month' }, headers: { origin: BASE } });
    expect(checkout.status()).toBe(503);

    await page.goto('/app/billing');
    await expect(page.getByRole('heading', { level: 1, name: 'Plans and billing' })).toBeVisible();
    await expect(page.getByTestId('billing-free')).toContainText('free account');
    await expect(page.getByTestId('billing-off')).toContainText('Payments aren’t switched on yet');
    await expect(page.getByTestId('buy-invoice_pro')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/billing-off.png`, fullPage: true });
  });

  test('the billing page needs a sign-in', async ({ page }) => {
    await page.goto('/app/billing');
    await expect(page).toHaveURL(/\/login/);
  });
});

test('the account that issues KaamSolv invoices can not be deleted; any other account can', async ({ page }) => {
  const seller = process.env.BILLING_SELLER_EMAIL ?? '';
  expect(seller).toContain('@');
  const signIn = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: seller, name: 'Seller' } });
  expect(signIn.status()).toBe(200);
  const refused = await page.request.delete('/api/me', { headers: { origin: BASE }, data: { confirm: 'DELETE' } });
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { error: string }).error).toBe('billing_account');
  expect((await page.request.get('/api/me')).status(), 'still signed in, account still there').toBe(200);

  const other = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: `plain-${Date.now()}@example.test`, name: 'Plain' } });
  expect(other.status()).toBe(200);
  const gone = await page.request.delete('/api/me', { headers: { origin: BASE }, data: { confirm: 'DELETE' } });
  expect(gone.status()).toBe(200);
});
