import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

/**
 * Invoice Pro payment reminders and promises in the browser. No real email is sent: the dev server writes it to
 * test-results/mail-outbox.jsonl. The rules (eligibility, duplicates, retries) are tested against real Postgres in
 * test/reminders.test.mts.
 */

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
async function save(page: Page, number: string, clientEmail: string): Promise<string> {
  const doc = {
    number, issueDate: localDay(-20), dueDate: localDay(-10), currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: 'Acme Traders', address: 'Bengaluru', email: clientEmail },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate: '2000' }],
    discountType: 'percent', discountValue: '', taxLabel: '', taxRate: '', notes: '',
  };
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
const drain = (page: Page) => page.request.post('/api/billing/drain', { headers: { 'x-cron-secret': CRON } });

test('a Pro account confirms, sends a reminder once, sees it sent, and records and clears a promise', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  const customer = email('customer');
  await signIn(page, email('pro'));
  const id = await save(page, 'REM-1', customer);

  await page.goto(`/app/invoices/${id}`);
  const panel = page.getByTestId('reminder-panel');
  await expect(panel).toBeVisible();
  await page.getByTestId('reminder-open').click();
  const confirm = page.getByTestId('reminder-confirm');
  await expect(confirm).toContainText(customer);
  await expect(confirm).toContainText('₹2,000.00');
  await panel.getByLabel(/Add a line of your own/).fill('Thank you!');
  await page.screenshot({ path: `${SHOTS}/reminder-confirm.png`, fullPage: true });
  await page.getByTestId('reminder-send').click();
  await expect(page.getByTestId('reminder-note')).toContainText('on its way');
  await expect(page.getByTestId('reminder-state').first()).toHaveText('Sending…');

  // The reminder is sent by the queue, not by the click. Run it the way the cron does.
  expect((await drain(page)).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('reminder-state').first()).toHaveText('Sent');
  const mail = (await readFile('test-results/mail-outbox.jsonl', 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { to: string });
  expect(mail.filter((m) => m.to === customer)).toHaveLength(1);

  // Sending again the same day is the same reminder: no second one goes out.
  await page.getByTestId('reminder-open').click();
  await page.getByTestId('reminder-send').click();
  await expect(page.getByTestId('reminder-note')).toContainText('already on its way');
  await drain(page);
  const after = (await readFile('test-results/mail-outbox.jsonl', 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { to: string });
  expect(after.filter((m) => m.to === customer)).toHaveLength(1);

  // A promise: saved, shown on the invoice and in Payments & collections, then cleared.
  await page.getByLabel('Promised date').fill(localDay(5));
  await page.getByLabel(/^Note/).fill('Will pay by UPI');
  await page.getByTestId('promise-save').click();
  await expect(page.getByTestId('promise-status')).toContainText('Promised');
  await page.goto('/app/invoices/collections');
  await expect(page.getByTestId('promise-row')).toContainText('REM-1');
  await page.screenshot({ path: `${SHOTS}/promises-card.png`, fullPage: true });
  await page.goto(`/app/invoices/${id}`);
  await page.getByTestId('promise-clear').click();
  await expect(page.getByTestId('promise-status')).toHaveCount(0);
});

test('an invoice with no customer email says what to fix instead of offering to send', async ({ page }) => {
  await signIn(page, email('pro'));
  const id = await save(page, 'REM-2', '');
  await page.goto(`/app/invoices/${id}`);
  await expect(page.getByTestId('reminder-why')).toContainText('Add your customer’s email');
  await expect(page.getByTestId('reminder-open')).toHaveCount(0);
});

test('a free account sees what Pro adds, and the server refuses a reminder anyway', async ({ page }) => {
  await signIn(page, email('free'));
  const id = await save(page, 'REM-3', 'someone@example.test');
  await page.goto(`/app/invoices/${id}`);
  await expect(page.getByTestId('reminder-upgrade')).toContainText('part of Pro');
  const res = await page.request.post(`/api/invoices/${id}/reminders`, { headers: ORIGIN, data: {} });
  expect(res.status()).toBe(403);
});

test('another account cannot read, send or promise on my invoice', async ({ page, browser }) => {
  await signIn(page, email('pro'));
  const id = await save(page, 'REM-4', 'someone@example.test');
  const ctx = await browser.newContext({ baseURL: BASE });
  const other = await ctx.newPage();
  await signIn(other, email('pro'));
  expect((await other.request.get(`/api/invoices/${id}/reminders`)).status()).toBe(404);
  expect((await other.request.post(`/api/invoices/${id}/reminders`, { headers: ORIGIN, data: {} })).status()).toBe(404);
  expect((await other.request.put(`/api/invoices/${id}/followup`, { headers: ORIGIN, data: { promisedOn: localDay(3) } })).status()).toBe(404);
  await ctx.close();
});

test('the settings card turns scheduled reminders on and off, and works at phone width', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro'));
  await save(page, 'REM-5', 'someone@example.test');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/app/invoices/collections');
  const card = page.getByTestId('reminder-settings');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('reminders-state')).toHaveText('Off');
  await page.getByTestId('reminders-on').click();
  await expect(page.getByTestId('reminders-state')).toHaveText('On');
  await page.screenshot({ path: `${SHOTS}/reminder-settings-360.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await card.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByTestId('reminders-state')).toHaveText('Off');
});
