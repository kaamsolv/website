import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Stage E — the invoice list: search, type, sort, pages and filters, all in the URL. "pro-…" accounts have Pro
 * (quotations, ZIP selection); a free account is checked separately. The seed (T = today):
 *   28 invoices INV-0001…INV-0028, ₹ n×100 each, client "Client {n mod 7}" (n=5 is "Half 50% Ltd"),
 *   due T+10−n (so n ≥ 11 are overdue), every 5th half paid; plus quotations QT-0001 and QT-0002 (created last).
 *   Outstanding: 40,600 − 3,750 = ₹36,850.00 on all 28. Overdue (n = 11…28): 35,100 − 3,000 = ₹32,100.00 on 18.
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
function doc(number: string, client: string, rate: number, issue: string, due: string, extra: Record<string, unknown> = {}) {
  return {
    number, issueDate: issue, dueDate: due, currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: client, address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate: String(rate) }],
    discountType: 'percent', discountValue: '', taxLabel: '', taxRate: '', notes: '', ...extra,
  };
}
async function seed(page: Page) {
  for (let n = 1; n <= 28; n++) {
    const res = await page.request.post('/api/invoices', {
      headers: ORIGIN,
      data: { invoice: doc(`INV-${String(n).padStart(4, '0')}`, n === 5 ? 'Half 50% Ltd' : `Client ${n % 7}`, n * 100, localDay(-n), localDay(10 - n)) },
    });
    expect(res.status(), await res.text()).toBe(201);
    if (n % 5 === 0) {
      const { id } = (await res.json()) as { id: string };
      const pay = await page.request.post(`/api/invoices/${id}/payments`, {
        headers: ORIGIN,
        data: { amount: String(n * 50), paidOn: localDay(-1), method: 'bank', reference: '', note: '', clientKey: randomUUID(), today: localDay() },
      });
      expect(pay.status(), await pay.text()).toBe(201);
    }
  }
  for (const n of [1, 2]) {
    const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc(`QT-000${n}`, 'Quote Client', 5000, localDay(-n), localDay(30), { kind: 'quote' }) } });
    expect(res.status(), await res.text()).toBe(201);
  }
}

const rows = (page: Page) => page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem');
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const choose = async (radio: ReturnType<Page['getByRole']>) => {
  await radio.locator('xpath=..').click();
  await expect(radio).toBeChecked();
};

test('pages: 25 at a time without reloading, Back and Forward, a live range, and a page past the end shows the last', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-list'));
  await seed(page);
  await page.goto('/app/invoices');
  await expect(rows(page)).toHaveCount(25);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–25 of 30');
  await expect(rows(page).first()).toContainText('QT-0002'); // most recently changed first, as before
  await page.screenshot({ path: `${SHOTS}/list-page1-desktop.png`, fullPage: true });

  // Next: the page changes in place (a marker set on window survives), the URL follows.
  await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
  const nav = page.getByRole('navigation', { name: 'Invoice pages' });
  await expect(nav.getByRole('link', { name: 'Page 1, current page' })).toHaveCount(0); // the current page is not a link…
  await expect(nav.getByText('1', { exact: true }).first()).toHaveAttribute('aria-current', 'page'); // …it is marked as current
  await nav.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 26–30 of 30');
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Your invoices, page 2 of 2' })).toBeFocused();

  await page.goBack();
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–25 of 30');
  await page.goForward();
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 26–30 of 30');
  await page.reload();
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 26–30 of 30');

  // A page past the end is the last page, and the address bar says so.
  await page.goto('/app/invoices?page=99');
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 26–30 of 30');
  await expect(page).toHaveURL(/page=2/);
  // A smaller page size from the URL.
  await page.goto('/app/invoices?pageSize=10');
  await expect(rows(page)).toHaveCount(10);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–10 of 30');
});

test('search: by number or client, any case, % and _ are ordinary characters, chips to remove it, and it survives a reload', async ({ page }) => {
  await signIn(page, email('pro-search'));
  await seed(page);
  await page.goto('/app/invoices');
  const search = page.getByRole('searchbox', { name: 'Search' });

  await search.fill('inv-0012');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=inv-0012/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('INV-0012');
  await expect(page.getByRole('link', { name: 'Remove filter: Search: “inv-0012”' })).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue('inv-0012');
  await expect(rows(page)).toHaveCount(1);

  await search.fill('client 3');
  await search.press('Enter');
  await expect(rows(page)).toHaveCount(4); // n = 3, 10, 17, 24
  await expect(page.getByTestId('filter-totals')).toContainText('4 invoices');

  await search.fill('50%');
  await search.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Half 50% Ltd');
  await search.fill('%');
  await search.press('Enter');
  await expect(rows(page)).toHaveCount(1); // a % is a %, not “anything”

  await search.fill('nothing like this');
  await search.press('Enter');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('No invoices match these filters.')).toBeVisible();
  await page.getByRole('link', { name: 'Remove filter: Search: “nothing like this”' }).click();
  await expect(rows(page)).toHaveCount(25);
  await expect(page).not.toHaveURL(/q=/);
});

test('sort and type: the order changes on the server, quotations come and go, and Pro’s ticks survive moving between pages', async ({ page }) => {
  await signIn(page, email('pro-sort'));
  await seed(page);
  await page.goto('/app/invoices');
  const sort = page.getByLabel('Sort by');

  await sort.selectOption('total');
  await expect(page).toHaveURL(/sort=total/);
  await expect(rows(page).nth(0)).toContainText('QT-'); // the two ₹5,000 quotations are the largest…
  await expect(rows(page).nth(1)).toContainText('QT-');
  await expect(rows(page).nth(2)).toContainText('INV-0028'); // …then the biggest invoice
  await sort.selectOption('number');
  await expect(rows(page).first()).toContainText('INV-0001');
  await sort.selectOption('due');
  await expect(rows(page).first()).toContainText('INV-0028'); // due the longest ago
  await sort.selectOption('updated');
  await expect(page).not.toHaveURL(/sort=/);

  // Type: invoices only / quotations only / all.
  await choose(page.getByRole('radio', { name: 'Quotations' }));
  await expect(page).toHaveURL(/kind=quote/);
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Saved invoices' })).not.toContainText('INV-');
  await choose(page.getByRole('radio', { name: 'Invoices', exact: true }));
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–25 of 28');
  await choose(page.getByRole('radio', { name: 'All', exact: true }));
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–25 of 30');

  // Ticks: one on each page, still there coming back, and the ZIP button counts both.
  await page.getByLabel('Select QT-0002').check();
  await page.getByRole('navigation', { name: 'Invoice pages' }).getByRole('link', { name: 'Next page' }).click();
  await page.getByLabel('Select INV-0001').check();
  await expect(page.getByRole('button', { name: 'Download 2 as ZIP' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Select QT-0002')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Download 2 as ZIP' })).toBeVisible();
});

test('drill-down lists page too: the filter totals cover every match, and the filters, search and pages combine', async ({ page }) => {
  await signIn(page, email('pro-drill2'));
  await seed(page);
  await page.goto('/app/invoices?state=outstanding&currency=INR&pageSize=10');
  await expect(rows(page)).toHaveCount(10);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–10 of 28');
  const totals = page.getByTestId('filter-totals');
  await expect(totals).toContainText('28 invoices');
  await expect(totals).toContainText('₹36,850.00 outstanding');
  await page.getByRole('navigation', { name: 'Invoice pages' }).getByRole('link', { name: 'Page 3' }).click();
  await expect(rows(page)).toHaveCount(8);
  await expect(totals).toContainText('₹36,850.00 outstanding'); // the same total on every page
  await expect(page).toHaveURL(/state=outstanding/);
  await expect(page).toHaveURL(/pageSize=10/);

  await page.goto('/app/invoices?state=overdue&currency=INR');
  await expect(totals).toContainText('18 invoices');
  await expect(totals).toContainText('₹32,100.00 outstanding');
  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.fill('client 3');
  await search.press('Enter');
  await expect(page).toHaveURL(/state=overdue/);
  await expect(page).toHaveURL(/q=client\+3|q=client%203/);
  await expect(rows(page)).toHaveCount(2); // “Client 3” is n = 3, 10, 17, 24; only 17 and 24 are overdue (10 is due today)
  await expect(page.getByRole('link', { name: 'Remove filter: Overdue' })).toBeVisible();
  await page.getByRole('link', { name: 'Remove filter: Overdue' }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'Remove filter: Search: “client 3”' })).toBeVisible();
});

test('bad requests are refused calmly, the unfiltered API is exactly what it was, and nobody sees anyone else’s invoices', async ({ page, browser }) => {
  await signIn(page, email('pro-api'));
  await seed(page);

  // The original answer: everything, summary columns only, no paging fields.
  const plain = (await (await page.request.get('/api/invoices')).json()) as { ok: boolean; invoices: Record<string, unknown>[]; paged?: boolean };
  expect(plain.paged).toBeUndefined();
  expect(plain.invoices).toHaveLength(30);
  expect(Object.keys(plain.invoices[0]).sort()).toEqual(['amountPaid', 'clientName', 'currency', 'dueDate', 'id', 'issueDate', 'kind', 'number', 'recurEvery', 'recurNext', 'status', 'total', 'updatedAt']);

  const paged = (await (await page.request.get('/api/invoices?page=2&pageSize=7')).json()) as { paged: boolean; invoices: unknown[]; matched: number; pages: number; page: number; totals: { count: number }[] };
  expect([paged.paged, paged.invoices.length, paged.matched, paged.pages, paged.page]).toEqual([true, 7, 30, 5, 2]);
  expect(paged.totals[0].count).toBe(28);

  for (const bad of ['page=0', 'page=abc', 'pageSize=101', 'pageSize=0', 'kind=bogus', 'sort=random', 'ids=nope', `q=${'x'.repeat(81)}`, 'kind=quote&state=paid', 'state=overdue']) {
    expect((await page.request.get(`/api/invoices?${bad}`)).status(), bad).toBe(400);
  }
  const ok = await page.request.get(`/api/invoices?state=overdue&today=${localDay()}&page=1`);
  expect(ok.status()).toBe(200);

  // Someone else asking for this account's invoices by id gets nothing.
  const mine = plain.invoices.slice(0, 3).map((r) => r.id as string);
  const other = await browser.newContext({ baseURL: BASE });
  const otherPage = await other.newPage();
  await signIn(otherPage, email('pro-other'));
  const theirs = (await (await otherPage.request.get(`/api/invoices?ids=${mine.join(',')}`)).json()) as { matched: number; invoices: unknown[] };
  expect([theirs.matched, theirs.invoices.length]).toEqual([0, 0]);
  const theirSearch = (await (await otherPage.request.get('/api/invoices?q=INV-00')).json()) as { matched: number };
  expect(theirSearch.matched).toBe(0);
  await other.close();

  const anon = await browser.newContext({ baseURL: BASE });
  expect((await (await anon.newPage()).request.get('/api/invoices?page=1')).status()).toBe(401);
  await anon.close();

  // The page itself shows a bad URL without breaking.
  await page.goto('/app/invoices?page=0');
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('aren’t valid');
  await page.getByRole('link', { name: 'Clear the filters' }).click();
  await expect(rows(page)).toHaveCount(25);
});

test('free accounts search and page their own invoices too; phone and dark mode do not scroll sideways', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('free-list'));
  for (const n of [1, 2, 3]) {
    const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc(`F-000${n}`, `Free ${n}`, n * 100, localDay(-n), localDay(10)) } });
    expect(res.status(), await res.text()).toBe(201);
  }
  await page.goto('/app/invoices');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Quotations' })).toHaveCount(0); // quotations are Pro
  await expect(page.getByRole('checkbox', { name: /^Select/ })).toHaveCount(0); // so is ZIP selection
  await page.getByRole('searchbox', { name: 'Search' }).fill('free 2');
  await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–1 of 1');

  await page.goto('/app/invoices');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(rows(page)).toHaveCount(3);
  expect(await noSideways(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/list-mobile-light.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  expect(await noSideways(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/list-mobile-dark.png`, fullPage: true });
});
