import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseCsv } from '../../app/lib/invoice/csv';

/**
 * Reports & exports (Stage F) on the throwaway e2e database. "pro-…" emails get a test-only Invoice Pro grant;
 * "free-…" ones are free accounts, which must get nothing from the page or the API. Every download is a real file
 * that is read back and compared with Payments & Collections, the customer API and the filtered invoice list.
 *
 * Seeded (T = today in the browser, range "Last 6 months", INR unless noted):
 *   A  20,000 issued 2 months ago, due T−30  (Acme Traders)  paid 5,000 last month         → owes 15,000, overdue
 *   B  10,000 issued last month,  due T+10                   paid 10,000 this month        → paid
 *   C   8,000 issued 3 months ago, due T−70                  nothing                       → owes 8,000, overdue
 *   E   1,000 issued this month,  due T+5, client "=HYPERLINK(…)"  a mistaken 200 payment, voided → owes 1,000
 *   D   $100  issued this month,  due T−5                    paid $25 this month           → owes $75
 * INR: invoiced 39,000 · received 15,000 · outstanding 24,000 · overdue 23,000.   USD: 100 · 25 · 75 · 75.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const HOSTILE_CLIENT = '=HYPERLINK("http://evil.test","click")';
const HOSTILE_REFERENCE = '+1+cmd|\' /C calc\'!A0';

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return ymd(d);
};
const monthDay = (back: number, day: number) => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() - back, day));
};

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}

function doc(n: string, rate: string, issue: string, due: string, over: Record<string, unknown> = {}) {
  return {
    number: n, issueDate: issue, dueDate: due, currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: `${n} Client`, address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate }],
    discountType: 'percent', discountValue: '', taxLabel: '', taxRate: '', notes: '',
    ...over,
  };
}
async function save(page: Page, d: ReturnType<typeof doc>): Promise<string> {
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: d } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
async function paid(page: Page, id: string, amount: string, paidOn: string, reference = ''): Promise<string> {
  const res = await page.request.post(`/api/invoices/${id}/payments`, {
    headers: ORIGIN,
    data: { amount, paidOn, method: 'bank', reference, note: '', clientKey: randomUUID(), today: localDay() },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { payment?: { id: string }; id?: string };
  return body.payment?.id ?? body.id ?? '';
}

type Seed = { customer: string; ids: Record<string, string> };
async function seed(page: Page): Promise<Seed> {
  const c = await page.request.post('/api/customers', { headers: ORIGIN, data: { name: 'Acme Traders' } });
  const customer = ((await c.json()) as { id: string }).id;
  const ids: Record<string, string> = {};
  ids.A = await save(page, doc('A', '20000', monthDay(2, 3), localDay(-30), { customerId: customer }));
  ids.B = await save(page, doc('B', '10000', monthDay(1, 2), localDay(10)));
  ids.C = await save(page, doc('C', '8000', monthDay(3, 8), localDay(-70)));
  ids.E = await save(page, doc('E', '1000', monthDay(0, 1), localDay(5), { client: { name: HOSTILE_CLIENT, address: '', email: '' } }));
  ids.D = await save(page, doc('D', '100', monthDay(0, 1), localDay(-5), { currency: 'USD' }));
  await paid(page, ids.A, '5000', monthDay(1, 5), HOSTILE_REFERENCE);
  await paid(page, ids.B, '10000', monthDay(0, 1));
  await paid(page, ids.D, '25', monthDay(0, 1));
  const mistake = await paid(page, ids.E, '200', monthDay(0, 1));
  const voided = await page.request.post(`/api/invoices/${ids.E}/payments/${mistake}/void`, { headers: ORIGIN, data: { reason: 'Entered twice' } });
  expect(voided.status()).toBe(200);
  return { customer, ids };
}

const choose = async (radio: Locator) => {
  await radio.locator('xpath=..').click();
  await expect(radio).toBeChecked();
};
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const query = () => new URLSearchParams({ from: monthDay(5, 1), to: localDay(), today: localDay() }).toString();

async function openReports(page: Page, kind: 'register' | 'payments' | 'outstanding' | 'ageing') {
  await page.goto('/app/invoices/reports');
  await expect(page.getByRole('heading', { name: 'Reports & exports', level: 1 })).toBeVisible();
  await choose(page.getByTestId(`rep-kind-${kind}`));
  if (kind === 'register' || kind === 'payments') await page.getByLabel('Period', { exact: true }).selectOption('6m');
  await expect(page.getByTestId('rep-summary')).not.toContainText('Checking');
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rep-download').click()]);
  const bytes = await readFile((await dl.path())!);
  const text = bytes.toString('utf8').replace(/^﻿/, '');
  return { name: dl.suggestedFilename(), bytes, text, table: parseCsv(text) };
}
const colOf = (table: string[][], label: string) => {
  const i = table[0].indexOf(label);
  expect(i, `column ${label} in ${table[0].join(' | ')}`).toBeGreaterThanOrEqual(0);
  return i;
};
const sum = (table: string[][], label: string, only?: (row: string[]) => boolean) =>
  Math.round(table.slice(1).filter((r) => !only || only(r)).reduce((n, r) => n + Math.round(Number(r[colOf(table, label)]) * 100), 0)) / 100;

test('free accounts get nothing: no nav link, the page sends them to All invoices, every report request is refused with no data — and the old export is unchanged', async ({ page, browser }) => {
  await signIn(page, email('free'));
  await save(page, doc('F1', '1000', localDay(-5), localDay(5)));
  await page.goto('/app/invoices');
  await expect(page.getByRole('link', { name: 'Reports & exports' })).toHaveCount(0);
  await page.goto('/app/invoices/reports');
  await expect(page).toHaveURL(/\/app\/invoices$/);

  for (const report of ['meta', 'register', 'payments', 'outstanding', 'ageing']) {
    const r = await page.request.get(`/api/invoices/reports?report=${report}&currency=INR&today=${localDay()}&from=${monthDay(5, 1)}&to=${localDay()}`);
    expect(r.status(), report).toBe(403);
    expect(Object.keys((await r.json()) as object).sort(), `${report}: no figures at all`).toEqual(['error', 'message', 'ok']);
  }
  expect((await page.request.get('/api/invoices/export')).status(), 'the existing export is still Pro-only').toBe(403);

  const anon = await browser.newContext({ baseURL: BASE });
  expect((await (await anon.newPage()).request.get('/api/invoices/reports?report=meta')).status()).toBe(401);
  await anon.close();
});

test('Pro: the API validates every request (nothing silently ignored), and the old export endpoint behaves as before', async ({ page }) => {
  await signIn(page, email('pro-api'));
  await save(page, doc('P1', '1000', monthDay(0, 1), localDay(5)));
  const get = (q: string) => page.request.get(`/api/invoices/reports?${q}`);
  const ok = `report=register&currency=INR&today=${localDay()}&from=${monthDay(5, 1)}&to=${localDay()}`;
  expect((await get(ok)).status()).toBe(200);
  const bad = [
    `report=nope&currency=INR&today=${localDay()}`,
    `report=register&today=${localDay()}&from=${monthDay(5, 1)}&to=${localDay()}`,
    `report=register&currency=INR&from=${monthDay(5, 1)}&to=${localDay()}`,
    `report=register&currency=INR&today=${localDay(5)}&from=${monthDay(5, 1)}&to=${localDay()}`,
    `report=register&currency=INR&today=${localDay()}`,
    `report=outstanding&currency=INR&today=${localDay()}&from=${monthDay(5, 1)}&to=${localDay()}`,
    `${ok}&includeVoided=1`,
    `${ok}&method=upi`,
    `${ok}&bucket=d1_30`,
    `${ok}&customer=not-a-uuid`,
    `${ok}&pageSize=101`,
    `${ok}&page=0`,
    `report=payments&currency=INR&today=${localDay()}&from=${monthDay(5, 1)}&to=${localDay()}&state=unpaid`,
  ];
  for (const q of bad) expect((await get(q)).status(), q).toBe(400);
  const one = (await (await get(ok)).json()) as { rows: string[][]; totals: { count: number }; cap: number; pageSize: number };
  expect([one.rows.length, one.totals.count, one.cap, one.pageSize]).toEqual([1, 1, 10000, 100]);
  expect((await get(ok)).headers()['cache-control']).toBe('private, no-store');

  // The earlier endpoint: same Pro check, same CSV header, same file name pattern.
  const old = await page.request.get('/api/invoices/export');
  expect(old.status()).toBe(200);
  expect(old.headers()['content-disposition']).toContain('kaamsolv-invoices');
  expect((await old.text()).replace(/^﻿/, '').split('\r\n')[0]).toBe('Number,Type,Issue date,Due / valid until,Status,Paid on,Client,Client GSTIN,Place of supply,Currency,Subtotal,Discount,Taxable value,CGST,SGST / UTGST,IGST,Total');
});

test('Pro: the register downloads as a real CSV that adds up to Payments & Collections, the customer page and the filtered list', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-reg'));
  const { customer } = await seed(page);
  await openReports(page, 'register');
  await expect(page.getByTestId('rep-note')).toContainText('not GST returns, tax filings or audited statements');
  await expect(page.getByTestId('rep-count')).toContainText('4 invoices');
  await expect(page.getByTestId('rep-total')).toHaveText('₹39,000.00');
  await expect(page.getByTestId('rep-received')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('rep-balance')).toHaveText('₹24,000.00');
  await page.screenshot({ path: `${SHOTS}/reports-desktop.png`, fullPage: true });

  const file = await download(page);
  expect(file.name).toMatch(/^kaamsolv-invoice-register-INR-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...file.bytes.subarray(0, 3)], 'UTF-8 byte-order mark').toEqual([0xef, 0xbb, 0xbf]);
  expect(file.text).toContain('\r\n');
  expect(file.table.length).toBe(5);
  expect(file.table.slice(1).map((r) => r[0]).sort()).toEqual(['A', 'B', 'C', 'E']);
  const currencyCol = colOf(file.table, 'Currency');
  expect(new Set(file.table.slice(1).map((r) => r[currencyCol]))).toEqual(new Set(['INR']));

  // The file against the numbers the rest of the app shows.
  const collections = (await (await page.request.get(`/api/invoices/collections?${query()}&currency=INR`)).json()) as {
    summary: { invoiced: { amount: number; count: number }; received: { amount: number }; outstanding: { amount: number }; overdue: { amount: number } };
  };
  expect(sum(file.table, 'Invoice total')).toBe(collections.summary.invoiced.amount);
  expect(file.table.length - 1).toBe(collections.summary.invoiced.count);
  expect(sum(file.table, 'Balance')).toBe(collections.summary.outstanding.amount);
  const listed = (await (await page.request.get(`/api/invoices?currency=INR&issuedFrom=${monthDay(5, 1)}&issuedTo=${localDay()}&today=${localDay()}`)).json()) as { totals: { total: number; balance: number }[] };
  expect([sum(file.table, 'Invoice total'), sum(file.table, 'Balance')]).toEqual([listed.totals[0].total, listed.totals[0].balance]);
  const acme = (await (await page.request.get(`/api/customers/${customer}/summary?today=${localDay()}`)).json()) as { money: { invoiced: number; received: number; outstanding: number }[] };
  const acmeRows = file.table.slice(1).filter((r) => r[colOf(file.table, 'Saved customer')] === 'Acme Traders');
  expect(acmeRows.length).toBe(1);
  expect([Number(acmeRows[0][colOf(file.table, 'Invoice total')]), Number(acmeRows[0][colOf(file.table, 'Received')]), Number(acmeRows[0][colOf(file.table, 'Balance')])]).toEqual([
    acme.money[0].invoiced, acme.money[0].received, acme.money[0].outstanding,
  ]);

  // A client name that looks like a formula is stored as text.
  const clientCol = colOf(file.table, 'Client');
  const e = file.table.find((r) => r[0] === 'E')!;
  expect(e[clientCol]).toBe(`'${HOSTILE_CLIENT}`);
  for (const r of file.table) for (const cell of r) expect(cell, 'no cell starts with a formula character').not.toMatch(/^[=+@\t\r]/);
  await expect(page.getByTestId('rep-result')).toContainText('Done');
});

test('Pro: payments — voided ones are left out by default, listed (and never counted) on request; the total is Collections’ Received', async ({ page }) => {
  await signIn(page, email('pro-pay'));
  await seed(page);
  await openReports(page, 'payments');
  await expect(page.getByTestId('rep-received')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('rep-voided')).toHaveCount(0);

  const plain = await download(page);
  expect(plain.name).toMatch(/^kaamsolv-payments-received-INR-/);
  expect(plain.table.length - 1).toBe(2);
  expect(sum(plain.table, 'Amount')).toBe(15000);
  expect(plain.table.slice(1).every((r) => r[colOf(plain.table, 'Status')] === 'Recorded')).toBe(true);
  const collections = (await (await page.request.get(`/api/invoices/collections?${query()}&currency=INR`)).json()) as { summary: { received: { amount: number; count: number } } };
  expect([sum(plain.table, 'Amount'), plain.table.length - 1]).toEqual([collections.summary.received.amount, collections.summary.received.count]);
  const reference = plain.table.find((r) => r[0] !== undefined && r[colOf(plain.table, 'Invoice no.')] === 'A')![colOf(plain.table, 'Reference')];
  expect(reference, 'a reference that starts with + is stored as text').toBe(`'${HOSTILE_REFERENCE}`);

  await page.getByLabel('Include voided payments').check();
  await expect(page.getByTestId('rep-voided')).toHaveText('₹200.00');
  await expect(page.getByTestId('rep-received')).toHaveText('₹15,000.00');
  const withVoided = await download(page);
  expect(withVoided.name).toMatch(/-with-voided\.csv$/);
  expect(withVoided.table.length - 1).toBe(3);
  const status = colOf(withVoided.table, 'Status');
  const counted = colOf(withVoided.table, 'Counted in totals');
  const voided = withVoided.table.filter((r) => r[status] === 'Voided');
  expect(voided.length).toBe(1);
  expect([voided[0][counted], voided[0][colOf(withVoided.table, 'Void reason')], voided[0][colOf(withVoided.table, 'Amount')]]).toEqual(['No', 'Entered twice', '200.00']);
  expect(sum(withVoided.table, 'Amount', (r) => r[counted] === 'Yes'), 'the counted total is unchanged').toBe(15000);

  await page.getByLabel('Method').selectOption('bank');
  await expect(page.getByTestId('rep-received')).toHaveText('₹15,000.00');
});

test('Pro: outstanding and ageing reconcile with Collections, and each currency is its own file', async ({ page }) => {
  await signIn(page, email('pro-out'));
  await seed(page);
  await openReports(page, 'outstanding');
  await expect(page.getByTestId('rep-balance')).toHaveText('₹24,000.00');
  await expect(page.getByTestId('rep-overdue')).toHaveText('₹23,000.00');
  const out = await download(page);
  expect(out.name).toBe(`kaamsolv-outstanding-invoices-INR-as-of-${localDay()}.csv`);
  expect(out.table.slice(1).map((r) => r[0])).toEqual(['C', 'A', 'E'].sort((x, y) => ['C', 'A', 'E'].indexOf(x) - ['C', 'A', 'E'].indexOf(y)));
  const collections = (await (await page.request.get(`/api/invoices/collections?${query()}&currency=INR`)).json()) as {
    summary: { outstanding: { amount: number; count: number } };
    ageing: { bucket: string; amount: number; count: number }[];
  };
  expect([sum(out.table, 'Balance'), out.table.length - 1]).toEqual([collections.summary.outstanding.amount, collections.summary.outstanding.count]);

  await choose(page.getByTestId('rep-kind-ageing'));
  await expect(page.getByTestId('rep-balance')).toHaveText('₹24,000.00');
  const age = await download(page);
  expect(age.table.length - 1, 'five age groups, always').toBe(5);
  expect(age.table.slice(1).map((r) => [Number(r[colOf(age.table, 'Balance')]), Number(r[colOf(age.table, 'Invoices')])])).toEqual(collections.ageing.map((b) => [b.amount, b.count]));

  // USD is a separate file; nothing is converted or added to the INR one.
  await choose(page.getByTestId('rep-kind-outstanding'));
  await page.getByText('USD', { exact: true }).click();
  await expect(page.getByTestId('rep-balance')).toHaveText('$75.00');
  const usd = await download(page);
  expect(usd.name).toContain('-USD-');
  expect(usd.table.slice(1).map((r) => [r[0], r[colOf(usd.table, 'Currency')], r[colOf(usd.table, 'Balance')]])).toEqual([['D', 'USD', '75.00']]);
});

test('Pro: a long export reads page after page with progress, Cancel stops it, a dropped request is retried, and a page that doesn’t add up is refused', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, email('pro-long'));
  const N = 230;
  for (let start = 0; start < N; start += 10) {
    await Promise.all(Array.from({ length: Math.min(10, N - start) }, (_, k) => save(page, doc(`L${String(start + k + 1).padStart(3, '0')}`, String(100 + start + k), monthDay(0, 1), localDay(5)))));
  }
  const expectedTotal = Array.from({ length: N }, (_, i) => 100 + i).reduce((a, b) => a + b, 0);

  // Whole export: three pages, all rows, the right total.
  await openReports(page, 'register');
  await expect(page.getByTestId('rep-count')).toContainText('230 invoices');
  const whole = await download(page);
  expect(whole.table.length - 1).toBe(N);
  expect(sum(whole.table, 'Invoice total')).toBe(expectedTotal);
  expect(new Set(whole.table.slice(1).map((r) => r[0])).size, 'no row twice').toBe(N);

  // Cancel while page 2 is slow: no file, no page 3.
  const requested: string[] = [];
  await page.route('**/api/invoices/reports?*', async (route) => {
    const url = route.request().url();
    requested.push(url);
    if (/[?&]page=2(&|$)/.test(url) && !/pageSize=1(&|$)/.test(url)) await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => undefined);
  });
  let downloaded = 0;
  page.on('download', () => downloaded++);
  await page.getByTestId('rep-download').click();
  await expect(page.getByTestId('rep-progress')).toContainText('page 1 of 3');
  await page.getByTestId('rep-cancel').click();
  await expect(page.getByTestId('rep-result')).toContainText('Cancelled');
  await page.waitForTimeout(3000);
  expect(downloaded, 'nothing downloaded after Cancel').toBe(0);
  expect(requested.some((u) => /[?&]page=3(&|$)/.test(u)), 'no request after the cancel').toBe(false);
  await page.unroute('**/api/invoices/reports?*');

  // A dropped request on page 2 is retried and the file is still complete.
  let dropped = false;
  await page.route('**/api/invoices/reports?*', async (route) => {
    if (!dropped && /[?&]page=2(&|$)/.test(route.request().url()) && !/pageSize=1(&|$)/.test(route.request().url())) {
      dropped = true;
      await route.abort('connectionreset');
      return;
    }
    await route.continue();
  });
  const retried = await download(page);
  expect(dropped).toBe(true);
  expect(retried.table.length - 1).toBe(N);
  await page.unroute('**/api/invoices/reports?*');

  // A page that loses a row on the way is caught by the check — no file.
  await page.route('**/api/invoices/reports?*', async (route) => {
    const url = route.request().url();
    if (/[?&]page=2(&|$)/.test(url) && !/pageSize=1(&|$)/.test(url)) {
      const real = await route.fetch();
      const body = (await real.json()) as { rows: string[][] };
      body.rows = body.rows.slice(1);
      await route.fulfill({ response: real, json: body });
      return;
    }
    await route.continue();
  });
  downloaded = 0;
  await page.getByTestId('rep-download').click();
  await expect(page.getByTestId('rep-result')).toContainText(/came back wrong|doesn’t match|Run it again/);
  expect(downloaded).toBe(0);
  await page.unroute('**/api/invoices/reports?*');

  // The data changing between pages stops the export too.
  await page.route('**/api/invoices/reports?*', async (route) => {
    const url = route.request().url();
    if (/[?&]page=3(&|$)/.test(url) && !/pageSize=1(&|$)/.test(url)) {
      const real = await route.fetch();
      const body = (await real.json()) as { totals: { total: number } };
      body.totals.total += 1;
      await route.fulfill({ response: real, json: body });
      return;
    }
    await route.continue();
  });
  await page.getByTestId('rep-download').click();
  await expect(page.getByTestId('rep-result')).toContainText('changed while exporting');
  expect(downloaded).toBe(0);
});

test('phone and dark: no sideways scroll, readable controls', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-mobile'));
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openReports(page, 'register');
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/reports-mobile.png`, fullPage: true });
  await choose(page.getByTestId('rep-kind-payments'));
  await page.getByLabel('Include voided payments').check();
  expect(await noSidewaysScroll(page)).toBe(true);
  const box = await page.getByTestId('rep-download').boundingBox();
  expect(box!.height, 'a comfortable touch target').toBeGreaterThanOrEqual(40);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/app/invoices/reports');
  await expect(page.getByTestId('rep-note')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/reports-dark.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('Pro: the nav and the Collections page lead to Reports', async ({ page }) => {
  await signIn(page, email('pro-nav'));
  await save(page, doc('N1', '500', monthDay(0, 1), localDay(5)));
  await page.goto('/app/invoices/collections');
  await page.getByRole('link', { name: 'Reports & exports' }).first().click();
  await expect(page).toHaveURL(/\/app\/invoices\/reports$/);
  await expect(page.getByRole('link', { name: 'Reports & exports' }).first()).toHaveAttribute('aria-current', 'page');
});
