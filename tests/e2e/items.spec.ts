import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Stage E — saved items and customers on the invoice: the fill rule never overwrites what was typed and never leaves
 * a stale value behind; two items with one name fill nothing; a long directory (more than the 200 that load
 * outright) is still reachable through server-side suggestions; the items list pages and warns about a repeated name.
 * HSN/SAC, unit and GST rate show on a GST tax invoice, so the account is given a GSTIN first.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const GSTIN = '27AAPFU0939F1ZV';

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
async function gstAccount(page: Page) {
  const res = await page.request.put('/api/settings', {
    headers: ORIGIN,
    data: {
      name: 'Sharma Design Studio', address: '12 MG Road\nPune 411001', stateCode: '27', gstin: GSTIN, upiId: '', bankAccountName: '', showUpiQr: false,
      invoicePrefix: 'INV-', nextSequence: 1, defaultCurrency: 'INR', defaultTaxLabel: 'GST', defaultTaxRate: '18', defaultDueDays: 14, defaultNotes: '',
    },
  });
  expect(res.status(), await res.text()).toBe(200);
}
async function item(page: Page, data: Record<string, string>) {
  const res = await page.request.post('/api/items', { headers: ORIGIN, data });
  expect(res.status(), await res.text()).toBe(201);
}

test('filling a line from a saved item: blanks and untouched values only; switching clears stale ones; duplicates fill nothing', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('items'));
  await gstAccount(page);
  await item(page, { name: 'Logo design', hsnSac: '998391', unit: 'pcs', rate: '15000', gstRate: '18' });
  await item(page, { name: 'Hosting', rate: '2500' });
  await item(page, { name: 'Consulting', rate: '1000' });
  await item(page, { name: 'consulting', rate: '2000' }); // the same name in another case

  await page.goto('/invoice-generator');
  const desc = (n: number) => page.getByLabel(`Item ${n} description`);
  const rate = (n: number) => page.getByLabel(`Item ${n} rate`);
  const hsn = (n: number) => page.getByLabel(`Item ${n} HSN or SAC code`);
  const unit = (n: number) => page.getByLabel(`Item ${n} unit`);
  const gst = (n: number) => page.getByLabel(`Item ${n} GST rate`);
  const hint = page.getByTestId('item-hint');

  // A blank line takes everything the item has.
  await desc(1).fill('Logo design');
  await expect(rate(1)).toHaveValue('15000');
  await expect(hsn(1)).toHaveValue('998391');
  await expect(unit(1)).toHaveValue('pcs');
  await expect(gst(1)).toHaveValue('18');
  await expect(hint).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/items-fill.png`, fullPage: true });

  // The person raises the rate; typing the name again does not undo it, and says so.
  await rate(1).fill('18000');
  await desc(1).fill('Logo design v2');
  await desc(1).fill('Logo design');
  await expect(rate(1)).toHaveValue('18000');
  await expect(hsn(1)).toHaveValue('998391');
  await expect(hint).toContainText('Kept the rate you typed');

  // Switching to another item: their rate stays, the first item's HSN/SAC, unit and GST rate don't linger.
  await desc(1).fill('Hosting');
  await expect(rate(1)).toHaveValue('18000');
  await expect(hsn(1)).toHaveValue('');
  await expect(unit(1)).toHaveValue('');
  await expect(gst(1)).toHaveValue('');

  // A new line: the plain case with fewer details.
  await page.getByRole('button', { name: /Add item/ }).click();
  await desc(2).fill('Hosting');
  await expect(rate(2)).toHaveValue('2500');
  await expect(hsn(2)).toHaveValue('');
  await expect(hint).toHaveCount(1); // still only line 1's note — nothing new was needed for line 2
  await expect(hint).toContainText('Kept the rate you typed');

  // Two saved items with one name: nothing is filled, and the person is told.
  await page.getByRole('button', { name: /Add item/ }).click();
  await desc(3).fill('Consulting');
  await expect(rate(3)).toHaveValue('');
  await expect(hint).toContainText('2 saved items are called');
  await page.screenshot({ path: `${SHOTS}/items-duplicate-hint.png`, fullPage: true });
});

test('a long directory is still reachable: suggestions come from the server past the 200 that load outright', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, email('pro-long'));
  await gstAccount(page);
  for (let n = 1; n <= 205; n++) {
    const c = await page.request.post('/api/customers', {
      headers: ORIGIN,
      data: n === 205 ? { name: 'Cust 205', email: 'late@example.test', address: '9 Late Road' } : { name: `Cust ${String(n).padStart(3, '0')}` },
    });
    expect(c.status(), await c.text()).toBe(201);
    const i = await page.request.post('/api/items', { headers: ORIGIN, data: { name: `Thing ${String(n).padStart(3, '0')}`, rate: n === 205 ? '777' : '1' } });
    expect(i.status(), await i.text()).toBe(201);
  }
  // Only 200 of each come back from the plain list…
  expect(((await (await page.request.get('/api/customers')).json()) as { rows: { name: string }[] }).rows.some((r) => r.name === 'Cust 205')).toBe(false);

  await page.goto('/invoice-generator');
  // …yet typing the 205th customer's name fills "Bill to", connects the invoice, and finds the 205th item.
  await page.getByLabel('Client name').fill('Cust 205');
  await expect(page.getByLabel('Client email')).toHaveValue('late@example.test');
  await expect(page.getByRole('button', { name: 'Save as customer' }), 'it is connected to the saved customer').toHaveCount(0);
  await page.getByLabel('Item 1 description').fill('Thing 205');
  await expect(page.getByLabel('Item 1 rate')).toHaveValue('777');
  // A name that isn't saved is still just typed.
  await page.getByLabel('Client name').fill('Cust 999');
  await expect(page.getByRole('button', { name: 'Save as customer' })).toBeVisible();
});

test('the items list: a neutral “Default rate”, 25 to a page with server search, and a warning before saving a name twice', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, email('items-list'));
  for (let n = 1; n <= 30; n++) await item(page, { name: `Widget ${String(n).padStart(2, '0')}`, rate: String(n * 10), unit: 'pcs' });
  expect(((await (await page.request.get('/api/items')).json()) as { rows: unknown[] }).rows).toHaveLength(30); // the plain answer is unchanged

  await page.goto('/app/business/items');
  const list = page.getByRole('list', { name: 'Saved items' }).getByRole('listitem');
  await expect(list).toHaveCount(25);
  await expect(page.getByTestId('pager-range')).toHaveText('Showing 1–25 of 30');
  await page.getByRole('navigation', { name: 'Item pages' }).getByRole('link', { name: 'Next page' }).click();
  await expect(list).toHaveCount(5);
  await page.getByRole('searchbox', { name: 'Search items' }).fill('widget 17');
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Rate 170 / pcs');
  await expect(list.first()).not.toContainText('₹');

  await page.getByRole('button', { name: '+ Add item' }).click();
  await expect(page.getByLabel('Default rate')).toBeVisible();
  await expect(page.getByLabel('Rate (₹)')).toHaveCount(0);
  await expect(page.getByText('Items don’t carry a currency')).toBeVisible();
  await page.getByLabel('Name (as printed on the invoice)').fill('WIDGET 17');
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.dismiss(); // "no": don't save a second one
  });
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect.poll(() => asked).toContain('You already have a item called “WIDGET 17”');
  expect(((await (await page.request.get('/api/items?page=1&pageSize=100')).json()) as { total: number }).total).toBe(30);
});
