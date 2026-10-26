import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Stage E — the customer workspace. A customer's page counts only the invoices *connected* to them (picked from
 * the saved list); invoices typed in with the same name are only ever suggested, and connected when the owner
 * ticks them and confirms. "pro-…" has Pro (unlimited customers); a free account is checked too.
 *
 * Seed (T = today), customer "Acme Traders":
 *   I1 ₹20,000 due T−30, ₹5,000 received · I2 ₹10,000 paid in full · I3 $100 due T+20 · all three connected
 *   T1 ₹1,000 and T2 (a quotation) typed in as "Acme Traders" / "ACME TRADERS", not connected · X1 typed as "Acme Traders Ltd" (not an exact match)
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
function doc(number: string, client: string, rate: number, due: string, extra: Record<string, unknown> = {}) {
  return {
    number, issueDate: localDay(-40), dueDate: due, currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: client, address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate: String(rate) }],
    discountType: 'percent', discountValue: '', taxLabel: '', taxRate: '', notes: '', ...extra,
  };
}
async function invoice(page: Page, d: ReturnType<typeof doc>) {
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: d } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
async function paid(page: Page, id: string, amount: string) {
  const res = await page.request.post(`/api/invoices/${id}/payments`, {
    headers: ORIGIN,
    data: { amount, paidOn: localDay(-1), method: 'bank', reference: '', note: '', clientKey: randomUUID(), today: localDay() },
  });
  expect(res.status(), await res.text()).toBe(201);
}
async function customer(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/customers', { headers: ORIGIN, data: { name } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
async function seed(page: Page) {
  const acme = await customer(page, 'Acme Traders');
  const i1 = await invoice(page, doc('I1', 'Acme Traders', 20000, localDay(-30), { customerId: acme }));
  const i2 = await invoice(page, doc('I2', 'Acme Traders', 10000, localDay(-10), { customerId: acme }));
  const i3 = await invoice(page, doc('I3', 'Acme Traders', 100, localDay(20), { customerId: acme, currency: 'USD' }));
  await paid(page, i1, '5000');
  await paid(page, i2, '10000');
  const t1 = await invoice(page, doc('T1', 'Acme Traders', 1000, localDay(-5)));
  const t2 = await invoice(page, doc('T2', 'ACME TRADERS', 2000, localDay(30), { kind: 'quote' }));
  const x1 = await invoice(page, doc('X1', 'Acme Traders Ltd', 3000, localDay(-3)));
  return { acme, i1, i2, i3, t1, t2, x1 };
}
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const acceptNextDialog = (page: Page, seen?: (message: string) => void) =>
  page.once('dialog', (d) => {
    seen?.(d.message());
    void d.accept();
  });

test('a customer’s page: totals per currency from connected invoices only, matching the invoice list; typed-in names are only suggested', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-cust'));
  const s = await seed(page);

  // The list of customers shows what each owes, and links through.
  await page.goto('/app/business/customers');
  await expect(page.getByTestId(`cust-stat-${s.acme}`)).toContainText('3 invoices');
  await expect(page.getByTestId(`cust-stat-${s.acme}`)).toContainText('₹15,000.00 outstanding (₹15,000.00 overdue)');
  await expect(page.getByTestId(`cust-stat-${s.acme}`)).toContainText('$100.00 outstanding');
  await page.getByRole('link', { name: 'Acme Traders' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/business/customers/${s.acme}$`));
  await expect(page.getByTestId('cust-name')).toHaveText('Acme Traders');
  await expect(page.getByRole('link', { name: 'Customers', exact: true })).toHaveAttribute('aria-current', 'page');

  // Rupees: I1 + I2 only. Dollars on their own. Nothing from the typed-in invoices.
  await expect(page.getByTestId('cust-invoiced-INR')).toHaveText('₹30,000.00');
  await expect(page.getByTestId('cust-received-INR')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('cust-outstanding-INR')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('cust-overdue-INR')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('cust-invoiced-USD')).toHaveText('$100.00');
  await expect(page.getByTestId('cust-outstanding-USD')).toHaveText('$100.00');
  await expect(page.getByTestId('cust-overdue-USD')).toHaveText('$0.00');
  await expect(page.getByRole('list', { name: 'Connected invoices' }).getByRole('listitem')).toHaveCount(3);
  await page.screenshot({ path: `${SHOTS}/customer-desktop.png`, fullPage: true });

  // The same number as the invoice list for this customer.
  await page.getByRole('link', { name: 'View invoices behind Outstanding' }).first().click();
  await expect(page).toHaveURL(/customer=/);
  await expect(page).toHaveURL(/state=outstanding/);
  await expect(page.getByTestId('filter-totals')).toContainText('1 invoice');
  await expect(page.getByTestId('filter-totals')).toContainText('₹15,000.00 outstanding');
  await expect(page.getByRole('link', { name: 'Remove filter: Customer: Acme Traders' })).toBeVisible();
  await page.goBack();

  // Typed-in invoices are suggested, never connected: two exact-name matches (one a quotation); "Ltd" is not one.
  const review = page.getByTestId('link-review');
  await expect(review).toContainText('Typed in with this name, but not connected');
  await expect(review.getByRole('listitem')).toHaveCount(2);
  await expect(review.getByText('X1')).toHaveCount(0);
  await expect(review.getByRole('checkbox', { name: 'Select T1' })).not.toBeChecked();
  await expect(review.getByRole('checkbox', { name: 'Select T2' })).not.toBeChecked();
  await expect(review.getByRole('button', { name: 'Connect selected' })).toBeDisabled();
  expect(((await (await page.request.get(`/api/customers/${s.acme}/summary?today=${localDay()}`)).json()) as { invoiceCount: number }).invoiceCount).toBe(3);
  await page.screenshot({ path: `${SHOTS}/customer-review.png`, fullPage: true });

  // Connect only T1, after confirming. It then counts (₹31,000); T2 is still waiting.
  await review.getByRole('checkbox', { name: 'Select T1' }).check();
  let asked = '';
  acceptNextDialog(page, (m) => (asked = m));
  await review.getByRole('button', { name: 'Connect 1 selected' }).click();
  await expect(page.getByText('Connected 1.')).toBeVisible();
  expect(asked).toContain('Connect 1 invoice to Acme Traders');
  expect(asked).toContain('stays exactly as it was typed');
  await expect(page.getByTestId('cust-invoiced-INR')).toHaveText('₹31,000.00');
  await expect(page.getByTestId('cust-outstanding-INR')).toHaveText('₹16,000.00');
  await expect(page.getByRole('list', { name: 'Connected invoices' }).getByRole('listitem')).toHaveCount(4);
  await expect(review.getByRole('listitem')).toHaveCount(1);
  expect(((await (await page.request.get(`/api/invoices/${s.t2}`)).json()) as { invoice: { client: { name: string } } }).invoice.client.name).toBe('ACME TRADERS');

  // And it can be undone: disconnect T1; what's printed on it was never touched.
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Disconnect T1 from Acme Traders' }).click();
  await expect(page.getByText('Disconnected T1.')).toBeVisible();
  await expect(page.getByTestId('cust-invoiced-INR')).toHaveText('₹30,000.00');
  await expect(review.getByRole('listitem')).toHaveCount(2);
  const t1 = (await (await page.request.get(`/api/invoices/${s.t1}`)).json()) as { invoice: { client: { name: string }; items: { rate: string }[] } };
  expect([t1.invoice.client.name, t1.invoice.items[0].rate]).toEqual(['Acme Traders', '1000']);
});

test('a second customer with the same name is a different customer: warned, allowed, never merged', async ({ page }) => {
  await signIn(page, email('pro-dup'));
  const s = await seed(page);
  await page.goto('/app/business/customers');
  await page.getByRole('button', { name: '+ Add customer' }).click();
  await page.getByLabel('Business or person').fill('acme traders');
  let asked = '';
  acceptNextDialog(page, (m) => (asked = m));
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('Saved acme traders.')).toBeVisible();
  expect(asked).toContain('You already have a customer called “acme traders”');
  await expect(page.getByRole('list', { name: 'Saved customers' }).getByRole('listitem')).toHaveCount(2);

  // The new one starts empty; the old one keeps its invoices; both are offered the same typed-in suggestions.
  const list = (await (await page.request.get('/api/customers')).json()) as { rows: { id: string; name: string }[] };
  const second = list.rows.find((r) => r.id !== s.acme && r.name === 'acme traders')!;
  await page.goto(`/app/business/customers/${second.id}`);
  await expect(page.getByTestId('cust-empty')).toBeVisible();
  await expect(page.getByTestId('link-review').getByRole('listitem')).toHaveCount(2);
  expect(((await (await page.request.get(`/api/customers/${s.acme}/summary?today=${localDay()}`)).json()) as { invoiceCount: number }).invoiceCount).toBe(3);
  expect(((await (await page.request.get(`/api/invoices/${s.t1}`)).json()) as { invoice: { customerId: string | null } }).invoice.customerId).toBeNull();
});

test('the customer APIs: connect and disconnect need an explicit list, only touch your own, and never leak across accounts', async ({ page, browser }) => {
  await signIn(page, email('pro-api'));
  const s = await seed(page);
  const today = localDay();

  // Reading never connects anything.
  for (let i = 0; i < 2; i++) {
    expect((await page.request.get(`/api/customers/${s.acme}/unlinked`)).status()).toBe(200);
    expect((await page.request.get(`/api/customers/${s.acme}/summary?today=${today}`)).status()).toBe(200);
  }
  const unlinked = (await (await page.request.get(`/api/customers/${s.acme}/unlinked`)).json()) as { candidates: { id: string; number: string }[] };
  expect(unlinked.candidates.map((c) => c.number).sort()).toEqual(['T1', 'T2']);

  // Validation.
  const links = (data: unknown, origin = BASE) => page.request.post(`/api/customers/${s.acme}/links`, { headers: { origin }, data });
  expect((await links({ action: 'connect', invoiceIds: [s.t1] }, 'https://evil.example')).status()).toBe(403);
  expect((await links({ action: 'everything', invoiceIds: [s.t1] })).status()).toBe(400);
  expect((await links({ action: 'connect', invoiceIds: [] })).status()).toBe(400);
  expect((await links({ action: 'connect', invoiceIds: ['nope'] })).status()).toBe(400);
  expect((await links({ action: 'connect', invoiceIds: Array.from({ length: 51 }, () => randomUUID()) })).status()).toBe(400);
  expect((await page.request.get(`/api/customers/${s.acme}/summary`)).status(), 'today is required').toBe(400);
  expect((await page.request.get(`/api/customers/not-a-uuid/summary?today=${today}`)).status()).toBe(404);

  // Already-connected and missing ids are skipped, not moved.
  const other = await customer(page, 'Bright Co');
  const r = (await (await page.request.post(`/api/customers/${other}/links`, { headers: ORIGIN, data: { action: 'connect', invoiceIds: [s.i1, randomUUID()] } })).json()) as { changed: number; skipped: number };
  expect([r.changed, r.skipped]).toEqual([0, 2]);

  // Another account: nothing found, nothing connected, nothing leaked.
  const intruder = await browser.newContext({ baseURL: BASE });
  const ip = await intruder.newPage();
  await signIn(ip, email('pro-intruder'));
  const theirs = await customer(ip, 'Their Customer');
  expect((await ip.request.get(`/api/customers/${s.acme}/summary?today=${today}`)).status()).toBe(404);
  expect((await ip.request.get(`/api/customers/${s.acme}/unlinked`)).status()).toBe(404);
  expect((await ip.request.post(`/api/customers/${s.acme}/links`, { headers: ORIGIN, data: { action: 'connect', invoiceIds: [s.t1] } })).status()).toBe(404);
  const cross = (await (await ip.request.post(`/api/customers/${theirs}/links`, { headers: ORIGIN, data: { action: 'connect', invoiceIds: [s.t1, s.x1] } })).json()) as { changed: number };
  expect(cross.changed, 'their customer, my invoices: nothing').toBe(0);
  expect(((await (await page.request.get(`/api/customers/${s.acme}/unlinked`)).json()) as { candidates: unknown[] }).candidates).toHaveLength(2);
  await intruder.close();

  const anon = await browser.newContext({ baseURL: BASE });
  const ap = await anon.newPage();
  for (const path of [`/api/customers/${s.acme}/summary?today=${today}`, `/api/customers/${s.acme}/unlinked`]) expect((await ap.request.get(path)).status()).toBe(401);
  await anon.close();
});

test('free accounts have the customer page too; the customer link shows on invoices that have one', async ({ page }) => {
  await signIn(page, email('free-cust'));
  const acme = await customer(page, 'Acme Traders');
  const linked = await invoice(page, doc('L1', 'Acme Traders', 5000, localDay(-3), { customerId: acme }));
  await invoice(page, doc('N1', 'Typed Only', 700, localDay(10)));

  await page.goto(`/app/business/customers/${acme}`);
  await expect(page.getByTestId('cust-invoiced-INR')).toHaveText('₹5,000.00');
  await expect(page.getByTestId('cust-outstanding-INR')).toHaveText('₹5,000.00');

  await page.goto('/app/invoices');
  const rows = page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'L1' }).getByRole('link', { name: /Open the saved customer/ })).toHaveAttribute('href', `/app/business/customers/${acme}`);
  await expect(rows.filter({ hasText: 'N1' }).getByRole('link', { name: /Open the saved customer/ })).toHaveCount(0);

  await page.goto(`/app/invoices/${linked}`);
  await expect(page.getByRole('link', { name: 'Saved customer: Acme Traders' })).toHaveAttribute('href', `/app/business/customers/${acme}`);
});

test('directories page on the server: 205 customers are all reachable (the old list stopped at 200), search finds one, items page too', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, email('pro-many'));
  for (let n = 1; n <= 205; n++) await customer(page, `Customer ${String(n).padStart(3, '0')}`);
  for (let n = 1; n <= 30; n++) {
    const res = await page.request.post('/api/items', { headers: ORIGIN, data: { name: `Item ${String(n).padStart(2, '0')}`, rate: String(n * 10) } });
    expect(res.status()).toBe(201);
  }
  // The original answer is unchanged — and still cut at 200, which is why the page uses the paged one.
  expect(((await (await page.request.get('/api/customers')).json()) as { rows: unknown[] }).rows).toHaveLength(200);
  const paged = (await (await page.request.get(`/api/customers?page=9&pageSize=25`)).json()) as { rows: { name: string }[]; total: number; pages: number };
  expect([paged.total, paged.pages, paged.rows.length, paged.rows.at(-1)?.name]).toEqual([205, 9, 5, 'Customer 205']);
  expect((await page.request.get('/api/customers?page=0')).status()).toBe(400);
  expect((await page.request.get('/api/customers?page=1&pageSize=1000')).status()).toBe(400);
  expect((await page.request.get('/api/customers?page=1&stats=1')).status(), 'stats needs today').toBe(400);

  await page.goto('/app/business/customers');
  const list = page.getByRole('list', { name: 'Saved customers' }).getByRole('listitem');
  await expect(list).toHaveCount(25);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–25 of 205');
  await page.getByRole('navigation', { name: 'Customer pages' }).getByRole('link', { name: 'Page 9' }).click();
  await expect(list).toHaveCount(5);
  await expect(list.last()).toContainText('Customer 205'); // beyond the old 200 cut-off
  await page.getByRole('searchbox', { name: 'Search customers' }).fill('Customer 150');
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Customer 150');
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–1 of 1');
  await page.getByRole('searchbox', { name: 'Search customers' }).fill('zzzz');
  await expect(page.getByText('Nothing matches “zzzz”.')).toBeVisible();

  await page.goto('/app/business/items');
  await expect(page.getByRole('list', { name: 'Saved items' }).getByRole('listitem')).toHaveCount(25);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–25 of 30');
});

test('every link in the workspace nav opens a real page, for a free and a Pro account', async ({ page, browser }) => {
  const walk = async (p: Page, expected: string[], absent: string[]) => {
    await p.goto('/app/invoices');
    await p.waitForLoadState('networkidle'); // the nav shows Pro pages once the account's plan has loaded
    if (expected.includes('Overview')) await expect(p.getByRole('navigation', { name: 'Your workspace' }).getByRole('link', { name: 'Overview' })).toBeVisible();
    const labels = await p.getByRole('navigation', { name: 'Your workspace' }).getByRole('link').evaluateAll((as) => as.map((a) => ({ text: (a.textContent ?? '').trim(), href: (a as HTMLAnchorElement).getAttribute('href') ?? '' })));
    for (const want of expected) expect(labels.map((l) => l.text), want).toContain(want);
    for (const no of absent) expect(labels.map((l) => l.text), no).not.toContain(no);
    for (const l of labels) {
      const res = await p.goto(l.href);
      expect(res?.status(), `${l.text} → ${l.href}`).toBeLessThan(400);
      await expect(p.getByRole('heading', { level: 1 }).first(), `${l.text} has a heading`).toBeVisible();
      await expect(p.getByText('This page could not be found'), `${l.text} is not a 404`).toHaveCount(0);
      expect(new URL(p.url()).pathname, `${l.text} stayed signed in`).not.toBe('/login');
    }
  };
  await signIn(page, email('pro-nav'));
  await walk(page, ['Overview', 'Payments & collections', 'All invoices', 'Invoice settings', 'Customers', 'Items'], []);
  const free = await browser.newContext({ baseURL: BASE });
  const fp = await free.newPage();
  await signIn(fp, email('free-nav'));
  await walk(fp, ['All invoices', 'Invoice settings', 'Customers', 'Items'], ['Overview', 'Payments & collections', 'From a CSV']);
  await free.close();
});

test('phone and dark mode: the customer page and the customers list do not scroll sideways', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-cust-mobile'));
  const s = await seed(page);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/app/business/customers/${s.acme}`);
    await expect(page.getByTestId('cust-invoiced-INR')).toBeVisible();
    expect(await noSideways(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/customer-mobile-${scheme}.png`, fullPage: true });
    await page.goto('/app/business/customers');
    await expect(page.getByTestId(`cust-stat-${s.acme}`)).toBeVisible();
    expect(await noSideways(page)).toBe(true);
  }
});

/**
 * The pager race (found by the release audit): the search box's "a moment after you stop typing" timer also fires once
 * after the list opens, and used to put the list back on page 1 even when the search text had not changed — pulling
 * someone off the page they had just chosen. And an answer for an older page could arrive after a newer one and win.
 */
test('the list stays on the page you chose when the search timer fires', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, email('pro-pager'));
  for (let n = 1; n <= 30; n++) await customer(page, `Customer ${String(n).padStart(2, '0')}`);
  const list = page.getByRole('list', { name: 'Saved customers' }).getByRole('listitem');
  const range = page.getByTestId('pager-range');
  const pages = page.getByRole('navigation', { name: 'Customer pages' });

  // 1. The page's timers are under our control: open the list, choose page 2, and only then let the 250 ms search timer fire.
  await page.clock.install();
  await page.goto('/app/business/customers');
  await expect(list).toHaveCount(25);
  await pages.getByRole('link', { name: 'Page 2' }).click();
  await expect(range).toHaveText('Showing 26–30 of 30');
  await expect(list).toHaveCount(5);
  await page.clock.runFor(2000); // the search timer fires here — with no change to the search text
  await page.waitForTimeout(500); // real time for any request it should not have made
  await expect(range, 'still on page 2').toHaveText('Showing 26–30 of 30');
  await expect(list.last()).toContainText('Customer 30');
  await expect(list).toHaveCount(5);

  // Typing a different search still starts from the first page, as before.
  await page.getByRole('searchbox', { name: 'Search customers' }).fill('Customer 2');
  await page.clock.runFor(2000);
  await expect(range).toHaveText('Showing 1–10 of 10');
});

test('an answer for an older page that arrives late does not replace the page you moved to', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, email('pro-stale'));
  for (let n = 1; n <= 30; n++) await customer(page, `Customer ${String(n).padStart(2, '0')}`);
  const list = page.getByRole('list', { name: 'Saved customers' }).getByRole('listitem');
  const range = page.getByTestId('pager-range');
  const pages = page.getByRole('navigation', { name: 'Customer pages' });

  await page.goto('/app/business/customers');
  await expect(list).toHaveCount(25);
  // Every list request ends (an ignored answer is still read to the end), so the page does go quiet.
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  // The answer for page 2 is held back for 2 seconds; page 1 comes straight away.
  await page.route('**/api/customers?*', async (route) => {
    if (/[?&]page=2(&|$)/.test(route.request().url())) await new Promise((r) => setTimeout(r, 2000));
    await route.continue().catch(() => undefined);
  });
  await pages.getByRole('link', { name: 'Page 2' }).click(); // asks for page 2 (slow)
  await pages.getByRole('link', { name: 'Page 1' }).click(); // changes their mind: page 1 (fast)
  await expect(range).toHaveText('Showing 1–25 of 30');
  await page.waitForTimeout(3000); // the slow page-2 answer arrives now
  await expect(range, 'the late answer was ignored').toHaveText('Showing 1–25 of 30');
  await expect(list).toHaveCount(25);
  await expect(list.first()).toContainText('Customer 01');
});
