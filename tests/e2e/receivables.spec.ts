import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Billing M3 in the browser: "Where things stand" on Payments & collections, the WhatsApp/copy summary, and the
 * opt-in email schedule. The figures themselves are checked by hand against real Postgres in test/receivables.test.mts.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
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
async function save(page: Page, number: string, rate: string, due: string): Promise<string> {
  const doc = {
    number, issueDate: localDay(-3), dueDate: due, currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: 'Acme Traders', address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate }],
    discountType: 'percent', discountValue: '', taxLabel: '', taxRate: '', notes: '',
  };
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('a Pro account sees where things stand, can copy or share the summary, and sets an email schedule', async ({ page, context }) => {
  await mkdir(SHOTS, { recursive: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await signIn(page, email('pro'));
  await save(page, 'R-TODAY', '5000', localDay(0));
  await save(page, 'R-SOON', '3000', localDay(3));
  const late = await save(page, 'R-LATE', '2000', localDay(-10));
  await page.request.post(`/api/invoices/${late}/payments`, {
    headers: ORIGIN,
    data: { amount: '500', paidOn: localDay(-1), method: 'upi', reference: '', note: '', clientKey: crypto.randomUUID(), today: localDay() },
  });

  await page.goto('/app/invoices/collections');
  const card = page.getByTestId('receivables-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('rc-outstanding')).toHaveText('₹9,500.00'); // 5,000 + 3,000 + 1,500
  await expect(page.getByTestId('rc-overdue')).toHaveText('₹1,500.00');
  await expect(page.getByTestId('rc-due-today')).toHaveText('₹5,000.00');
  await expect(page.getByTestId('rc-due7')).toHaveText('₹3,000.00');
  await expect(page.getByTestId('rc-due30')).toHaveText('₹3,000.00');
  await expect(page.getByTestId('rc-partly')).toContainText('1 invoice partly paid, ₹1,500.00 still owed');
  await expect(page.getByTestId('rc-upcoming')).toContainText('R-TODAY');
  await expect(page.getByTestId('rc-recent')).toContainText('R-LATE');

  // The message, WhatsApp and copy.
  const message = page.getByTestId('rc-message');
  await expect(message).toContainText('Outstanding: ₹9,500.00 (3 invoices)');
  await expect(message).toContainText('View receivables:');
  const href = (await page.getByTestId('rc-whatsapp').getAttribute('href')) ?? '';
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  expect(decodeURIComponent(href.split('?text=')[1])).toBe(((await message.textContent()) ?? '').trim());
  await page.getByTestId('rc-copy').click();
  await expect(page.getByTestId('rc-note')).toHaveText('Copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Overdue: ₹1,500.00 (1 invoice)');

  // The email schedule: saved on change, remembered.
  const select = page.getByTestId('rc-cadence');
  await expect(select).toHaveValue('off');
  await select.selectOption('weekly');
  await expect(page.getByTestId('rc-note')).toContainText('every Monday');
  expect(((await (await page.request.get('/api/notifications/prefs')).json()) as { summaryCadence: string }).summaryCadence).toBe('weekly');
  await page.reload();
  await expect(page.getByTestId('rc-cadence')).toHaveValue('weekly');
  await page.getByTestId('rc-cadence').selectOption('off');
  await expect(page.getByTestId('rc-note')).toContainText('No summary emails');
  await page.screenshot({ path: `${SHOTS}/receivables-desktop.png`, fullPage: true });
});

test('the card works on a phone in light and dark, with no sideways scroll', async ({ page, browser }) => {
  await signIn(page, email('pro'));
  await save(page, 'R-1', '5000', localDay(0));
  for (const scheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: scheme });
    const p = await ctx.newPage();
    await signIn(p, email('pro'));
    await save(p, 'R-1', '5000', localDay(0));
    await save(p, 'R-2', '3000', localDay(5));
    await p.goto('/app/invoices/collections');
    await expect(p.getByTestId('receivables-card')).toBeVisible();
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await p.getByTestId('receivables-card').screenshot({ path: `${SHOTS}/receivables-phone-${scheme}.png` });
    await ctx.close();
  }
});

test('summary email settings: signed out is refused, a free account can turn it off but not on, nothing is sent by default', async ({ page, request }) => {
  expect((await request.get('/api/notifications/prefs')).status()).toBe(401);
  expect((await request.get(`/api/invoices/receivables?today=${localDay()}`)).status()).toBe(401);

  await signIn(page, email('free'));
  const prefs = (await (await page.request.get('/api/notifications/prefs')).json()) as { summaryCadence: string; available: boolean };
  expect(prefs).toMatchObject({ summaryCadence: 'off', available: false });
  expect((await page.request.put('/api/notifications/prefs', { headers: ORIGIN, data: { summaryCadence: 'weekly' } })).status()).toBe(403);
  expect((await page.request.put('/api/notifications/prefs', { headers: ORIGIN, data: { summaryCadence: 'off' } })).status()).toBe(200);
  expect((await page.request.put('/api/notifications/prefs', { headers: ORIGIN, data: { summaryCadence: 'daily' } })).status()).toBe(400);
  expect((await page.request.put('/api/notifications/prefs', { headers: { origin: 'https://evil.example' }, data: { summaryCadence: 'off' } })).status()).toBe(403);
  expect((await page.request.get(`/api/invoices/receivables?today=${localDay()}`)).status(), 'Pro feature').toBe(403);

  await signIn(page, email('pro'));
  expect((await page.request.get('/api/invoices/receivables')).status(), 'today is required').toBe(400);
  expect((await page.request.get('/api/invoices/receivables?today=2001-01-01')).status(), 'a far-off date is refused').toBe(400);
  expect((await page.request.get(`/api/invoices/receivables?today=${localDay()}&currency=XXX`)).status()).toBe(400);
  const ok = await page.request.get(`/api/invoices/receivables?today=${localDay()}`);
  expect(ok.status()).toBe(200);
  expect(ok.headers()['cache-control']).toContain('no-store');
});
