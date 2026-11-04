import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

/**
 * Accountant Connect in the browser. No real email is sent: the dev server writes each message to
 * test-results/mail-outbox.jsonl. Month ranges, schedules, retries and the ZIP contents are tested against real
 * Postgres in test/accountant.test.mts.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const CRON = process.env.CRON_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const pad = (n: number) => String(n).padStart(2, '0');
const lastMonthDay = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-05`;
};

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
async function save(page: Page, number: string, issue: string): Promise<string> {
  const doc = {
    number, issueDate: issue, dueDate: issue, currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: 'Acme Traders', address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate: '2000' }],
    discountType: 'percent', discountValue: '', taxLabel: 'GST', taxRate: '18', notes: '',
  };
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
async function mailTo(address: string): Promise<{ to: string; link: string }[]> {
  const text = await readFile('test-results/mail-outbox.jsonl', 'utf8').catch(() => '');
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { to: string; link: string }).filter((m) => m.to === address);
}
const drain = (page: Page) => page.request.post('/api/billing/drain', { headers: { 'x-cron-secret': CRON } });

test('connect an accountant, they confirm, the monthly pack is sent once, and the emailed link downloads a ZIP without signing in', async ({ page, browser }) => {
  await mkdir(SHOTS, { recursive: true });
  const ca = email('ca');
  await signIn(page, email('pro'));
  await save(page, 'ACC-1', lastMonthDay());

  await page.goto('/app/invoices/accountant');
  await expect(page.getByTestId('ac-empty')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('CA Mehta');
  await page.getByLabel('Email', { exact: true }).fill(ca);
  await page.getByLabel('Day of month').selectOption('1');
  await page.getByLabel('Time').selectOption('0');
  await expect(page.getByTestId('ac-enabled')).toBeDisabled();
  await page.getByTestId('ac-save').click();
  await expect(page.getByTestId('ac-msg')).toContainText('Confirm this email');
  await page.getByTestId('ac-verify').click();
  await expect(page.getByTestId('ac-msg')).toContainText('Sent');

  // Nothing goes out to an unconfirmed address, even when the cron runs.
  await drain(page);
  expect((await mailTo(ca)).filter((m) => m.link.includes('/api/accountant/download'))).toHaveLength(0);

  // The accountant opens the link (no account), sees who asks, and confirms by pressing the button.
  const confirmLink = (await mailTo(ca)).find((m) => m.link.includes('/accountant/confirm/'))!.link;
  const ctx = await browser.newContext({ baseURL: BASE });
  const acct = await ctx.newPage();
  await acct.goto(confirmLink);
  await expect(acct.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await acct.screenshot({ path: `${SHOTS}/accountant-confirm.png`, fullPage: true });
  await acct.getByTestId('confirm-accountant').click();
  await expect(acct.getByTestId('confirmed')).toBeVisible();
  const again = await acct.goto(confirmLink);
  expect(again?.status()).toBe(404);

  await page.reload();
  await expect(page.getByTestId('ac-confirmed')).toContainText('confirmed by your accountant');
  await page.getByTestId('ac-enabled').check();
  await page.getByTestId('ac-save').click();
  await expect(page.getByTestId('ac-msg')).toHaveText('Saved.');
  await expect(page.getByTestId('ac-next')).toContainText('next run');

  // Safe test: preview and download, no email.
  await page.getByTestId('ac-preview').click();
  await expect(page.getByTestId('ac-preview-result')).toContainText('invoice-register-INR');
  const zipRes = await page.request.get('/api/accountant/pack');
  expect(zipRes.status()).toBe(200);
  expect(zipRes.headers()['content-type']).toBe('application/zip');
  expect((await mailTo(ca)).filter((m) => m.link.includes('/api/accountant/download'))).toHaveLength(0);

  // The cron sends it, once.
  expect((await drain(page)).status()).toBe(200);
  expect((await drain(page)).status()).toBe(200);
  const packMails = (await mailTo(ca)).filter((m) => m.link.includes('/api/accountant/download'));
  expect(packMails).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId('ac-history')).toContainText('Sent');
  await page.screenshot({ path: `${SHOTS}/accountant-connect.png`, fullPage: true });

  // The accountant downloads with the emailed link and no sign-in; a changed token does not work.
  const dl = await acct.request.get(packMails[0].link);
  expect(dl.status()).toBe(200);
  expect(dl.headers()['content-type']).toBe('application/zip');
  expect((await dl.body()).subarray(0, 2).toString()).toBe('PK');
  expect((await acct.request.get(packMails[0].link.slice(0, -2) + 'xx')).status()).toBe(404);

  // The owner ends the links; the same link stops working at once.
  await page.getByTestId('ac-revoke').click();
  await page.getByTestId('ac-revoke-confirm').getByRole('button', { name: 'End the links' }).click();
  await expect(page.getByTestId('ac-msg')).toContainText('no longer work');
  expect((await acct.request.get(packMails[0].link)).status()).toBe(404);
  await ctx.close();
});

test('a free account is told what Pro adds (not sent away) and the server refuses its requests; a visitor with no account gets nothing', async ({ page, browser }) => {
  await signIn(page, email('free'));
  await page.goto('/app/invoices/accountant');
  await expect(page).toHaveURL(/\/app\/invoices\/accountant$/);
  await expect(page.getByTestId('ac-upgrade')).toContainText('part of Pro');
  await expect(page.getByTestId('ac-upgrade').getByRole('link', { name: 'See Pro' })).toHaveAttribute('href', '/app/billing');
  await expect(page.getByTestId('ac-save')).toBeVisible();
  await expect(page.getByTestId('ac-preview')).toBeDisabled();
  await expect(page.getByTestId('access-upgrade')).toBeVisible();
  for (const path of ['/api/accountant/preview', '/api/accountant/pack']) expect((await page.request.get(path)).status()).toBe(403);
  const put = await page.request.put('/api/accountant', { headers: ORIGIN, data: { name: 'x', email: 'a@b.test', enabled: true, day: 5, hour: 10, sections: ['register'] } });
  expect(put.status()).toBe(403);

  const ctx = await browser.newContext({ baseURL: BASE });
  const anon = await ctx.newPage();
  expect((await anon.request.get('/api/accountant')).status()).toBe(401);
  expect((await anon.request.get('/api/accountant/pack')).status()).toBe(401);
  expect((await anon.request.get('/api/accountant/download?t=' + 'a'.repeat(22))).status()).toBe(404);
  await ctx.close();
});

test('the page fits a 320px phone', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro'));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/app/invoices/accountant');
  await expect(page.getByTestId('accountant-connect')).toBeVisible();
  await page.getByTestId('ac-preview').click();
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid=accountant-connect] *')]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`)
      .slice(0, 6),
  );
  expect(wide).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/accountant-320.png`, fullPage: true });
});
