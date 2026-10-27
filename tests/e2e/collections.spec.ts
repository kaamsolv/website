import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Payments & Collections (Stage D) on the throwaway e2e database. "pro-…" emails get a test-only Invoice Pro grant;
 * "free-…" ones are free accounts, which must get nothing from the page or the API.
 *
 * Seeded data (T = today in the browser; all amounts INR unless noted; payments are month-aligned so the chart
 * assertions can't flake on the calendar), range "Last 6 months":
 *   A  20,000  issued 2 months ago, due T−30   paid 5,000 last month        → owes 15,000, 30 days overdue
 *   B  10,000  issued last month,  due T+10    paid 10,000 this month        → paid
 *   C   8,000  issued 3 months ago, due T−70   nothing                       → owes 8,000, 70 days overdue
 *   D   $100   issued this month,  due T−5     paid $25 this month           → owes $75, 5 days overdue
 * INR: invoiced 38,000 · received 15,000 · outstanding 23,000 · overdue 23,000 · collection 15,000 / 38,000 = 39%.
 * USD: invoiced 100 · received 25 · outstanding 75 · overdue 75 · collection 25%.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return ymd(d);
};
/** Day `day` (1–28) of the month `back` months before this one, in the browser's calendar. */
const monthDay = (back: number, day: number) => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() - back, day));
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthText = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

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
async function paid(page: Page, id: string, amount: string, paidOn: string) {
  const res = await page.request.post(`/api/invoices/${id}/payments`, {
    headers: ORIGIN,
    data: { amount, paidOn, method: 'bank', reference: '', note: '', clientKey: randomUUID(), today: localDay() },
  });
  expect(res.status(), await res.text()).toBe(201);
}

type Seed = { A: string; B: string; C: string; D: string; customer: string };
async function seed(page: Page): Promise<Seed> {
  const c = await page.request.post('/api/customers', { headers: ORIGIN, data: { name: 'Acme Traders' } });
  const customer = ((await c.json()) as { id: string }).id;
  const A = await save(page, doc('A', '20000', monthDay(2, 3), localDay(-30), { customerId: customer }));
  const B = await save(page, doc('B', '10000', monthDay(1, 2), localDay(10)));
  const C = await save(page, doc('C', '8000', monthDay(3, 8), localDay(-70)));
  const D = await save(page, doc('D', '100', monthDay(0, 1), localDay(-5), { currency: 'USD' }));
  await paid(page, A, '5000', monthDay(1, 5));
  await paid(page, B, '10000', monthDay(0, 1));
  await paid(page, D, '25', monthDay(0, 1));
  return { A, B, C, D, customer };
}

const choose = async (radio: Locator) => {
  await radio.locator('xpath=..').click();
  await expect(radio).toBeChecked();
};
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const query = (extra: Record<string, string> = {}) =>
  new URLSearchParams({ from: monthDay(5, 1), to: localDay(), today: localDay(), ...extra }).toString();
const sixMonths = async (page: Page) => {
  await page.getByLabel('Period', { exact: true }).selectOption('6m');
  await expect(page.getByTestId('col-invoiced')).toHaveText('₹38,000.00');
};

test('free accounts get nothing: no nav link, the page sends them to All invoices, the API says no — but list filters still work on their own invoices', async ({ page, browser }) => {
  await signIn(page, email('free'));
  const id = await save(page, doc('F1', '1000', localDay(-5), localDay(5)));
  await page.goto('/app/invoices');
  await expect(page.getByRole('link', { name: 'Payments & collections' })).toHaveCount(0);
  await page.goto('/app/invoices/collections');
  await expect(page).toHaveURL(/\/app\/invoices$/);

  const r = await page.request.get(`/api/invoices/collections?${query()}`);
  expect(r.status()).toBe(403);
  expect(Object.keys((await r.json()) as object).sort(), 'no figures at all, not even empty ones').toEqual(['error', 'message', 'ok']);

  const anon = await browser.newContext({ baseURL: BASE });
  expect((await (await anon.newPage()).request.get(`/api/invoices/collections?${query()}`)).status()).toBe(401);
  await anon.close();

  // Filtering one's own invoices is plain list functionality: open to everyone.
  const f = await page.request.get(`/api/invoices?state=outstanding&currency=INR&today=${localDay()}`);
  expect(f.status()).toBe(200);
  const body = (await f.json()) as { invoices: { id: string }[]; totals: { balance: number }[]; filtered: boolean };
  expect(body.filtered).toBe(true);
  expect(body.invoices.map((i) => i.id)).toEqual([id]);
  expect(body.totals[0].balance).toBe(1000);
});

test('Pro: the figures, the labels that keep cash and cohort apart, currency switching, and the monthly and ageing views', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-coll'));
  await seed(page);

  await page.goto('/app/invoices');
  await page.getByRole('link', { name: 'Payments & collections' }).click(); // from the nav
  await expect(page).toHaveURL(/\/app\/invoices\/collections$/);
  await expect(page.getByRole('heading', { name: 'Payments & collections', level: 1 })).toBeVisible();
  // Default period is the current Indian financial year.
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('fy');
  await expect(page.getByTestId('col-basis')).toContainText('Financial year');
  await sixMonths(page);

  await expect(page.getByTestId('col-received')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('col-outstanding')).toHaveText('₹23,000.00');
  await expect(page.getByTestId('col-overdue')).toHaveText('₹23,000.00');
  await expect(page.getByTestId('col-rate')).toHaveText('39%');
  // The two measures are labelled so they can't be mistaken for each other.
  await expect(page.getByText('Collection rate (invoices issued in this period)')).toBeVisible();
  await expect(page.getByText('Cash that arrived in this period')).toBeVisible();
  await expect(page.getByTestId('col-explain')).toContainText('won’t match');
  await expect(page.getByText('Still owed, as of today')).toBeVisible();

  // Ageing: balances in four buckets that add up to Outstanding.
  await expect(page.getByTestId('age-not_due')).toHaveText('₹0.00');
  await expect(page.getByTestId('age-d1_30')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('age-d31_60')).toHaveText('₹0.00');
  await expect(page.getByTestId('age-d60_plus')).toHaveText('₹8,000.00');

  // Needs chasing: C (70 days) then A (30 days).
  const chase = page.getByRole('list', { name: 'Invoices longest past due' }).getByRole('listitem');
  await expect(chase).toHaveCount(2);
  await expect(chase.first()).toContainText('C');
  await expect(chase.first()).toContainText('70 days overdue');
  await expect(chase.nth(1)).toContainText('30 days overdue');

  // Chart summary, and the same numbers as a table.
  await expect(page.getByText('Invoiced ₹38,000.00 and received ₹15,000.00 across 6 months.').first()).toBeVisible();
  await page.getByText('View as a table').click();
  const table = page.getByRole('table', { name: /Invoiced and received by month/ });
  await expect(table.getByRole('row')).toHaveCount(7); // header + 6 months
  await expect(table.getByRole('row', { name: new RegExp(monthText(monthDay(1, 5))) })).toContainText('₹5,000.00');
  await page.screenshot({ path: `${SHOTS}/collections-inr-desktop.png`, fullPage: true });

  // Currency: dollars have their own figures; rupees are untouched; nothing is converted.
  await choose(page.getByRole('radio', { name: 'USD', exact: true }));
  await expect(page.getByTestId('col-invoiced')).toHaveText('$100.00');
  await expect(page.getByTestId('col-received')).toHaveText('$25.00');
  await expect(page.getByTestId('col-outstanding')).toHaveText('$75.00');
  await expect(page.getByTestId('col-rate')).toHaveText('25%');
  await expect(page.getByTestId('col-basis')).toContainText('never added to another');
  await expect(page.getByText('₹')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/collections-usd-desktop.png`, fullPage: true });
  await choose(page.getByRole('radio', { name: 'INR', exact: true }));
  await expect(page.getByTestId('col-outstanding')).toHaveText('₹23,000.00');
});

test('Pro: every card, bar and bucket opens the invoices behind it, and they add up to what was clicked', async ({ page }) => {
  await signIn(page, email('pro-drill'));
  await seed(page);
  await page.goto('/app/invoices/collections');
  await sixMonths(page);
  const rows = page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem');
  const totals = page.getByTestId('filter-totals');
  const back = async () => {
    await page.goto('/app/invoices/collections');
    await sixMonths(page);
  };

  // Ageing bucket 1–30 days → invoice A only, owing 15,000.
  await page.getByRole('link', { name: /1–30 days overdue: ₹15,000\.00 on 1 invoice/ }).click();
  await expect(page).toHaveURL(/bucket=d1_30/);
  await expect(page).toHaveURL(/currency=INR/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('A Client');
  await expect(totals).toContainText('1 invoice');
  await expect(totals).toContainText('₹15,000.00 outstanding');
  await expect(page.getByRole('link', { name: 'Remove filter: Age: 1–30 days overdue' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/collections-drill-ageing.png`, fullPage: true });

  // Outstanding card → A and C, 23,000 — the same as the card.
  await back();
  await page.getByRole('link', { name: 'View invoices behind Outstanding' }).click();
  await expect(rows).toHaveCount(2);
  await expect(totals).toContainText('2 invoices');
  await expect(totals).toContainText('₹23,000.00 outstanding');
  // Removing a chip keeps the others; Clear filters gives back the normal list (all four invoices, no filter bar).
  await page.getByRole('link', { name: 'Remove filter: Outstanding (unpaid + partially paid)' }).click();
  await expect(page).toHaveURL(/currency=INR/);
  await expect(rows).toHaveCount(3);
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('filter-totals')).toHaveCount(0);
  await expect(rows).toHaveCount(4);

  // Overdue card.
  await back();
  await page.getByRole('link', { name: 'View invoices behind Overdue' }).click();
  await expect(totals).toContainText('₹23,000.00 outstanding');

  // Received card → the invoices that took payments in the period, with what came in; the amounts add up to the card.
  await back();
  await page.getByRole('link', { name: 'View invoices behind Received' }).click();
  await expect(rows).toHaveCount(2);
  await expect(totals).toContainText('₹15,000.00 received in this period');
  await expect(rows.filter({ hasText: 'A Client' })).toContainText('₹5,000.00 received in this period');
  await expect(rows.filter({ hasText: 'B Client' })).toContainText('₹10,000.00 received in this period');

  // Invoiced card → invoices issued in the period.
  await back();
  await page.getByRole('link', { name: 'View invoices behind Invoiced' }).click();
  await expect(rows).toHaveCount(3);
  await expect(totals).toContainText('₹38,000.00 invoiced');

  // A single month's bars: received last month, invoiced three months ago.
  await back();
  await page.getByRole('link', { name: /received ₹5,000\.00 in 1 payment/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('A Client');
  await expect(totals).toContainText('₹5,000.00 received in this period');
  await back();
  await page.getByRole('link', { name: /invoiced ₹8,000\.00 on 1 invoice/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('C Client');

  // Bad filters fail calmly.
  await page.goto('/app/invoices?state=sideways');
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('Those filters aren’t valid');
  await page.getByRole('link', { name: 'Clear the filters' }).click();
  await expect(rows).toHaveCount(4);
});

test('Pro: the customer filter limits every figure to one saved customer', async ({ page }) => {
  await signIn(page, email('pro-cust'));
  await seed(page);
  await page.goto('/app/invoices/collections');
  await sixMonths(page);
  await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Acme Traders' });
  await expect(page.getByTestId('col-invoiced')).toHaveText('₹20,000.00');
  await expect(page.getByTestId('col-received')).toHaveText('₹5,000.00');
  await expect(page.getByTestId('col-outstanding')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('col-basis')).toContainText('one saved customer');
  await page.getByRole('link', { name: 'View invoices behind Outstanding' }).click();
  await expect(page.getByTestId('filter-totals')).toContainText('1 invoice');
  await expect(page.getByRole('link', { name: 'Remove filter: Customer: Acme Traders' })).toBeVisible();
});

test('empty states: a new account, no payments yet, everything paid, a quiet period, and a bad date range', async ({ page }) => {
  await signIn(page, email('pro-empty'));
  await page.goto('/app/invoices/collections');
  await expect(page.getByText('Nothing to measure yet')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/collections-empty.png`, fullPage: true });

  // One invoice, no payments: the chart says nothing has come in yet; the ageing shows the balance.
  const unpaid = await save(page, doc('U1', '1000', monthDay(0, 1), localDay(20)));
  await page.reload();
  await expect(page.getByTestId('col-no-payments')).toBeVisible();
  await expect(page.getByTestId('age-not_due')).toHaveText('₹1,000.00');

  // Paid in full: "Nothing outstanding. Sorted."
  await paid(page, unpaid, '1000', monthDay(0, 1));
  await page.reload();
  await expect(page.getByTestId('col-sorted')).toBeVisible();
  await expect(page.getByTestId('col-outstanding')).toHaveText('₹0.00');
  await expect(page.getByText('Nothing overdue.')).toBeVisible();

  // A period with nothing in it.
  await page.getByLabel('Period', { exact: true }).selectOption('custom');
  await page.getByLabel('From', { exact: true }).fill('2023-04-01');
  await page.getByLabel('To', { exact: true }).fill('2023-04-30');
  await expect(page.getByTestId('col-empty-period')).toBeVisible();
  await expect(page.getByTestId('col-rate')).toHaveText('—');

  // A backwards range is explained, not sent.
  await page.getByLabel('From', { exact: true }).fill('2023-05-01');
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('on or before');
});

test('the API: validation, the date rules, isolation, and an unchanged /api/dashboard', async ({ page, browser }) => {
  await signIn(page, email('pro-api'));
  await seed(page);
  const get = (q: string) => page.request.get(`/api/invoices/collections?${q}`);

  const ok = await get(query({ currency: 'INR' }));
  expect(ok.status()).toBe(200);
  const body = (await ok.json()) as { currency: string; summary: { outstanding: { amount: number }; collection: { percent: number } }; monthly: unknown[]; ageing: unknown[] };
  expect(body.currency).toBe('INR');
  expect(body.summary.outstanding.amount).toBe(23000);
  expect(body.summary.collection.percent).toBe(39);
  expect(body.monthly).toHaveLength(6);
  expect(body.ageing).toHaveLength(4);

  expect((await get(`from=${monthDay(5, 1)}&to=${localDay()}`)).status(), 'no today: no fallback to the server clock').toBe(400);
  expect((await get(query({ today: localDay(-5) }))).status(), 'a today that is days off').toBe(400);
  expect((await get(query({ currency: 'BTC' }))).status()).toBe(400);
  expect((await get(query({ customer: 'nope' }))).status()).toBe(400);
  expect((await get(query({ from: '2020-01-01' }))).status(), 'more than 24 months').toBe(400);
  expect((await get(query({ from: localDay(5) }))).status(), 'backwards').toBe(400);
  expect((await get(`from=2026-02-30&to=2026-03-01&today=${localDay()}`)).status()).toBe(400);
  expect((await get(query({ today: 'yesterday' }))).status()).toBe(400);

  // Someone else's customer id gives zeros, never data.
  const other = await browser.newContext({ baseURL: BASE });
  const otherPage = await other.newPage();
  await signIn(otherPage, email('pro-other'));
  const foreign = await otherPage.request.get(`/api/invoices/collections?${query({ currency: 'INR' })}`);
  expect(((await foreign.json()) as { summary: { invoiced: { amount: number } } }).summary.invoiced.amount).toBe(0);
  const theirs = await save(otherPage, doc('X1', '99999', monthDay(0, 1), localDay(-3)));
  const mine = await get(query({ currency: 'INR' }));
  expect(((await mine.json()) as { summary: { invoiced: { amount: number } } }).summary.invoiced.amount).toBe(38000);
  const bad = await page.request.get(`/api/invoices?state=overdue&today=${localDay()}`);
  expect(((await bad.json()) as { invoices: { id: string }[] }).invoices.map((i) => i.id)).not.toContain(theirs);
  await other.close();

  // The old dashboard endpoint keeps its shape and its numbers (now on the remaining balance, from Stage C).
  const dash = await page.request.get(`/api/dashboard?today=${localDay()}`);
  expect(dash.status()).toBe(200);
  const d = (await dash.json()) as { ok: boolean; today: string; totals: { currency: string; unpaid: number; overdue: number; overdueCount: number }[]; recent: unknown[] };
  expect(Object.keys(d).sort()).toEqual(['ok', 'recent', 'today', 'totals']);
  const inr = d.totals.find((t) => t.currency === 'INR')!;
  expect([inr.unpaid, inr.overdue, inr.overdueCount]).toEqual([23000, 23000, 2]);
});

async function inTimeZone(browser: Browser, timezoneId: string, email: string) {
  const ctx = await browser.newContext({ baseURL: BASE, timezoneId });
  const page = await ctx.newPage();
  await signIn(page, email);
  return { ctx, page };
}

test('a visitor far ahead of or behind UTC still gets their own calendar date accepted', async ({ browser }) => {
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata']) {
    const { ctx, page } = await inTimeZone(browser, tz, email('pro-tz'));
    await page.goto('/app/invoices/collections');
    await expect(page.getByText('Nothing to measure yet')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
    await ctx.close();
  }
});

test('phone and dark mode: no sideways scrolling of the page, the chart scrolls itself, links work from the keyboard', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-mobile'));
  await seed(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/app/invoices/collections');
  await sixMonths(page);
  expect(await noSidewaysScroll(page)).toBe(true);
  await expect(page.getByRole('region', { name: /Monthly chart/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/collections-mobile-light.png`, fullPage: true });

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await sixMonths(page);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/collections-mobile-dark.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${SHOTS}/collections-desktop-dark.png`, fullPage: true });

  // Keyboard: focus a bucket link and press Enter.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('link', { name: /1–30 days overdue: ₹15,000\.00/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/bucket=d1_30/);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/collections-drill-mobile.png`, fullPage: true });
});
