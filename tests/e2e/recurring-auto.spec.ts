import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/** Automatic recurring invoices in the browser. The rules (month ends, duplicates, limits) are tested in test/recurring-auto.test.mts. */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const CRON = process.env.CRON_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
async function save(page: Page, number: string): Promise<string> {
  const doc = {
    number, issueDate: localDay(-20), dueDate: localDay(-10), currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: 'Acme Traders', address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Retainer', qty: '1', rate: '2000' }],
    discountType: 'percent', discountValue: '', taxLabel: '', taxRate: '', notes: '',
  };
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
const drain = (page: Page) => page.request.post('/api/billing/drain', { headers: { 'x-cron-secret': CRON } });

test('set a schedule, turn on automatic creation with a confirmation, let the cron run it once, pause, and turn off', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro'));
  const id = await save(page, 'AUTO-1');
  await page.goto(`/app/invoices/${id}`);
  const card = page.getByTestId('recurring-card');
  await card.getByLabel('Next one on').fill(localDay(-1));
  await page.getByTestId('recurring-save').click();
  await expect(page.getByTestId('recurring-state')).toContainText('Off');

  await page.getByTestId('recurring-auto-on').click();
  await expect(page.getByTestId('recurring-confirm')).toContainText('without asking');
  await page.screenshot({ path: `${SHOTS}/recurring-confirm.png`, fullPage: true });
  await page.getByTestId('recurring-confirm-yes').click();
  await expect(page.getByTestId('recurring-state')).toHaveText('On');

  expect((await drain(page)).status()).toBe(200);
  expect((await drain(page)).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('recurring-runs')).toContainText('Made');
  await expect(page.getByTestId('recurring-runs').locator('li')).toHaveCount(1);
  const list = await page.request.get('/api/invoices');
  const rows = ((await list.json()) as { invoices: { number: string }[] }).invoices;
  expect(rows).toHaveLength(2);
  await page.screenshot({ path: `${SHOTS}/recurring-runs.png`, fullPage: true });

  await page.getByTestId('recurring-pause').click();
  await expect(page.getByTestId('recurring-state')).toHaveText('Paused');
  await page.getByTestId('recurring-pause').click();
  await expect(page.getByTestId('recurring-state')).toHaveText('On');
  await page.getByTestId('recurring-auto-off').click();
  await expect(page.getByTestId('recurring-state')).toContainText('Off');
});

test('a free account sees what Pro adds and the server refuses to turn it on; another account gets a 404', async ({ page, browser }) => {
  await signIn(page, email('free'));
  const id = await save(page, 'AUTO-2');
  await page.goto(`/app/invoices/${id}`);
  await expect(page.getByTestId('recurring-upgrade')).toContainText('part of Pro');
  const res = await page.request.put(`/api/invoices/${id}/automation`, { headers: ORIGIN, data: { autoCreate: true } });
  expect([403, 409]).toContain(res.status());

  const ctx = await browser.newContext({ baseURL: BASE });
  const other = await ctx.newPage();
  await signIn(other, email('pro'));
  expect((await other.request.get(`/api/invoices/${id}/automation`)).status()).toBe(404);
  expect((await other.request.put(`/api/invoices/${id}/automation`, { headers: ORIGIN, data: { autoCreate: false } })).status()).toBe(404);
  await ctx.close();
});

test('the card fits a 320px phone', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro'));
  const id = await save(page, 'AUTO-3');
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(`/app/invoices/${id}`);
  await page.getByTestId('recurring-card').getByLabel('Next one on').fill(localDay(5));
  await page.getByTestId('recurring-save').click();
  await expect(page.getByTestId('recurring-auto')).toBeVisible();
  await page.getByTestId('recurring-auto-on').click();
  const wide = await page.evaluate(() => [...document.querySelectorAll('[data-testid=recurring-card] *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => `${e.tagName}.${String(e.className).slice(0, 60)} ${Math.round(e.getBoundingClientRect().right)}`).slice(0, 8));
  expect(wide).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/recurring-320.png`, fullPage: true });
});
