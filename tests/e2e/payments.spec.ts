import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Payments (Stage C) on the throwaway e2e database. Recording and viewing payments is open to every signed-in
 * account, so the main flow runs as a FREE account ("free-…" email); the Pro Overview check uses a "pro-…" one.
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

/** A plain ₹20,000 invoice (no tax) due in 10 days. */
function invoiceDoc(over: Record<string, unknown> = {}) {
  return {
    number: 'INV-0001', issueDate: localDay(-2), dueDate: localDay(10), currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: 'Acme Traders Pvt Ltd', address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Brand identity', qty: '1', rate: '20000' }],
    discountType: 'percent', discountValue: '', taxLabel: '', taxRate: '', notes: '',
    ...over,
  };
}
async function save(page: Page, over: Record<string, unknown> = {}): Promise<string> {
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: invoiceDoc(over) } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
const body = (amount: string, over: Record<string, unknown> = {}) => ({
  amount, paidOn: localDay(-1), method: 'upi', reference: '', note: '', clientKey: randomUUID(), today: localDay(), ...over,
});
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('a free account records partial payments, sees the balance and progress, voids a mistake, and the editor protects the total', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('free'));
  const id = await save(page);

  // The list: unpaid, with a way in.
  await page.goto('/app/invoices');
  const row = page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem').first();
  await expect(row).toContainText('INV-0001');
  await expect(row).toContainText('Unpaid');
  await expect(row.getByRole('button', { name: /Mark/ })).toHaveCount(0);
  await row.getByRole('link', { name: 'Record a payment for INV-0001' }).click();
  await page.waitForURL(new RegExp(`/app/invoices/${id}`));

  // The payments page opens ready to type, the amount prefilled with what is owed.
  await expect(page.getByTestId('pay-total')).toHaveText('₹20,000.00');
  await expect(page.getByTestId('pay-outstanding')).toHaveText('₹20,000.00');
  await expect(page.getByLabel('Amount received (INR)')).toHaveValue('20000.00');

  // ₹5,000 by keyboard: type, Enter to review, confirm.
  const amount = page.getByLabel('Amount received (INR)');
  await amount.fill('5,000');
  await page.getByLabel('Reference').fill('UTR12345');
  await page.getByLabel('Note').fill('advance');
  await amount.press('Enter');
  await expect(page.getByTestId('pay-review')).toContainText('₹5,000.00');
  await expect(page.getByTestId('pay-review')).toContainText('₹15,000.00 will still be outstanding');
  await page.screenshot({ path: `${SHOTS}/payments-review.png`, fullPage: true });
  await page.getByRole('button', { name: 'Confirm and record' }).click();

  await expect(page.getByText('Recorded. ₹15,000.00 still outstanding.')).toBeVisible();
  await expect(page.getByTestId('pay-received')).toHaveText('₹5,000.00');
  await expect(page.getByTestId('pay-outstanding')).toHaveText('₹15,000.00');
  await expect(page.getByText('Partially paid', { exact: true })).toBeVisible();
  const bar = page.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow', '25');
  await expect(bar).toHaveAccessibleName('25% received');
  await expect(page.getByText(/· 25%/)).toBeVisible();
  const history = page.getByRole('list', { name: 'Payments' });
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await expect(history.getByRole('listitem').first()).toContainText('Ref UTR12345');
  await expect(history.getByRole('listitem').first()).toContainText('advance');
  await page.screenshot({ path: `${SHOTS}/payments-partial-desktop.png`, fullPage: true });

  // More than is owed: refused with the real balance, nothing recorded.
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByLabel('Amount received (INR)').fill('15000.01');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('only ₹15,000.00 is outstanding');
  await page.getByLabel('Amount received (INR)').fill('0');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('more than zero');
  await page.getByLabel('Amount received (INR)').fill('15000');

  // Double click on Confirm: one payment, not two.
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm and record' }).dblclick();
  await expect(page.getByText('Recorded. INV-0001 is paid in full.')).toBeVisible();
  await expect(page.getByTestId('pay-outstanding')).toHaveText('₹0.00');
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);

  // Void the first payment: the amount goes back, the entry stays, struck through.
  await page.getByRole('button', { name: 'Void the ₹5,000.00 payment' }).click();
  await page.getByLabel('Reason').fill('wrong invoice');
  await page.getByRole('button', { name: 'Void payment' }).click();
  await expect(page.getByTestId('pay-received')).toHaveText('₹15,000.00');
  await expect(page.getByTestId('pay-outstanding')).toHaveText('₹5,000.00');
  await expect(page.getByText('Partially paid', { exact: true })).toBeVisible();
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history.locator('[data-voided="true"]')).toContainText('wrong invoice');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  await page.screenshot({ path: `${SHOTS}/payments-voided-desktop.png`, fullPage: true });

  // The list shows the same numbers.
  await page.goto('/app/invoices');
  const listRow = page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem').first();
  await expect(listRow).toContainText('Partially paid');
  await expect(listRow).toContainText('₹5,000.00 outstanding');
  await expect(listRow.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  await page.screenshot({ path: `${SHOTS}/payments-list-desktop.png`, fullPage: true });

  // The editor points at the payments page, fixes the currency, and won't let the total drop below what was received.
  await page.goto(`/invoice-generator?id=${id}`);
  await expect(page.getByRole('link', { name: '₹15,000.00 received' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Currency' }).first()).toBeDisabled();
  await page.getByLabel('Item 1 rate').fill('1000');
  await expect(page.getByText(/₹15,000\.00 has been received on this invoice, so its total can’t go below that/)).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Item 1 rate').fill('20000');
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

test('the payments API: signed-out 401, other people’s invoices 404, over-payment 409, a repeat is recognised, no marking paid by hand', async ({ page, browser }) => {
  await signIn(page, email('free'));
  const id = await save(page);

  // Signed out (a clean context).
  const anon = await browser.newContext({ baseURL: BASE });
  const anonPage = await anon.newPage();
  expect((await anonPage.request.get(`/api/invoices/${id}/payments`)).status()).toBe(401);
  expect((await anonPage.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: body('100') })).status()).toBe(401);
  await anon.close();

  // Someone else's invoice is simply not there.
  const other = await browser.newContext({ baseURL: BASE });
  const otherPage = await other.newPage();
  await signIn(otherPage, email('free'));
  expect((await otherPage.request.get(`/api/invoices/${id}/payments`)).status()).toBe(404);
  expect((await otherPage.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: body('100') })).status()).toBe(404);
  await other.close();

  // Cross-site posts are refused; junk is a 400.
  expect((await page.request.post(`/api/invoices/${id}/payments`, { headers: { origin: 'https://evil.example' }, data: body('100') })).status()).toBe(403);
  for (const bad of [body('0'), body('-5'), body('12.345'), body('abc'), body('100', { method: 'bitcoin' }), body('100', { clientKey: 'nope' }), body('100', { paidOn: localDay(3) }), body('100', { today: '2001-01-01' })]) {
    expect((await page.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: bad })).status(), JSON.stringify(bad)).toBe(400);
  }
  expect((await page.request.get('/api/invoices/not-a-uuid/payments')).status()).toBe(404);

  // A real payment; the same body again is a recognised repeat (200, same payment), not a second payment.
  const first = body('5000', { reference: 'UTR1' });
  const one = await page.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: first });
  expect(one.status(), await one.text()).toBe(201);
  const repeat = await page.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: first });
  expect(repeat.status()).toBe(200);
  const repeated = (await repeat.json()) as { duplicate: boolean; payments: unknown[]; invoice: { amountPaid: number; status: string } };
  expect(repeated.duplicate).toBe(true);
  expect(repeated.payments).toHaveLength(1);
  expect(repeated.invoice).toMatchObject({ amountPaid: 5000, status: 'unpaid' });
  // The same key for a different amount is not silently accepted.
  expect((await page.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: { ...first, amount: '6000' } })).status()).toBe(409);

  // Over-payment is a 409 with the real balance; and the full balance is fine.
  const over = await page.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: body('15000.01') });
  expect(over.status()).toBe(409);
  expect(((await over.json()) as { error: string; message: string }).message).toContain('₹15,000.00');

  // Nobody can mark an invoice paid by hand any more.
  const mark = await page.request.put(`/api/invoices/${id}/status`, { headers: ORIGIN, data: { status: 'paid' } });
  expect(mark.status()).toBe(409);
  expect(((await mark.json()) as { error: string }).error).toBe('record_payment');
  const unmark = await page.request.put(`/api/invoices/${id}/status`, { headers: ORIGIN, data: { status: 'unpaid' } });
  expect(unmark.status()).toBe(409); // it has payments: void them instead
  expect(((await unmark.json()) as { error: string }).error).toBe('has_payments');

  // Saving the invoice with a lower total, or another currency, is refused with a plain message.
  const lower = await page.request.put(`/api/invoices/${id}`, { headers: ORIGIN, data: { invoice: invoiceDoc({ items: [{ id: 'i1', description: 'x', qty: '1', rate: '4999' }] }) } });
  expect(lower.status()).toBe(409);
  expect(((await lower.json()) as { error: string }).error).toBe('below_paid');
  const usd = await page.request.put(`/api/invoices/${id}`, { headers: ORIGIN, data: { invoice: invoiceDoc({ currency: 'USD' }) } });
  expect(usd.status()).toBe(409);
  expect(((await usd.json()) as { error: string }).error).toBe('has_payments');

  // Edit the note; void; voiding twice is harmless; a voided payment can't be edited.
  const list = (await (await page.request.get(`/api/invoices/${id}/payments`)).json()) as { payments: { id: string }[] };
  const pid = list.payments[0].id;
  const edit = await page.request.patch(`/api/invoices/${id}/payments/${pid}`, { headers: ORIGIN, data: { reference: 'UTR1-fixed', note: 'ok' } });
  expect(edit.status()).toBe(200);
  expect(((await edit.json()) as { payments: { reference: string }[] }).payments[0].reference).toBe('UTR1-fixed');
  expect((await page.request.patch(`/api/invoices/${id}/payments/${pid}`, { headers: ORIGIN, data: { reference: 'x'.repeat(101), note: '' } })).status()).toBe(400);
  expect((await page.request.post(`/api/invoices/${id}/payments/${pid}/void`, { headers: ORIGIN, data: { reason: 'oops' } })).status()).toBe(200);
  expect((await page.request.post(`/api/invoices/${id}/payments/${pid}/void`, { headers: ORIGIN, data: {} })).status()).toBe(200);
  expect((await page.request.patch(`/api/invoices/${id}/payments/${pid}`, { headers: ORIGIN, data: { reference: 'late', note: '' } })).status()).toBe(409);
  // Another user's payment id on my invoice id is also nothing.
  expect((await page.request.post(`/api/invoices/${id}/payments/${randomUUID()}/void`, { headers: ORIGIN, data: {} })).status()).toBe(404);
});

test('the payments page works on a phone and in dark mode; no sideways scrolling', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('free'));
  const id = await save(page, { dueDate: localDay(-5) }); // overdue
  const r = await page.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: body('7500', { method: 'cheque', reference: '000123', note: 'second half to follow' }) });
  expect(r.status()).toBe(201);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`/app/invoices/${id}`);
  await expect(page.getByTestId('pay-outstanding')).toHaveText('₹12,500.00');
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await expect(page.getByText('5 days overdue')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/payments-mobile-light.png`, fullPage: true });

  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByLabel('Amount received (INR)')).toBeFocused();
  expect(await noHorizontalScroll(page)).toBe(true);
  const box = await page.getByRole('button', { name: 'Review' }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: `${SHOTS}/payments-mobile-form.png`, fullPage: true });

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.getByTestId('pay-outstanding')).toHaveText('₹12,500.00');
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/payments-mobile-dark.png`, fullPage: true });

  await page.goto('/app/invoices');
  expect(await noHorizontalScroll(page)).toBe(true);
  await expect(page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem').first()).toContainText('₹12,500.00 outstanding');
  await page.screenshot({ path: `${SHOTS}/payments-list-mobile-dark.png`, fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/app/invoices/${id}`);
  await page.screenshot({ path: `${SHOTS}/payments-desktop-dark.png`, fullPage: true });
});

test('a quotation, a missing invoice and someone else’s invoice show a calm "not here" page', async ({ page }) => {
  await signIn(page, email('pro-quote'));
  const quote = await save(page, { kind: 'quote', number: 'QT-0001' });
  await page.goto(`/app/invoices/${quote}`);
  await expect(page.getByText('That invoice isn’t here')).toBeVisible();
  await page.goto(`/app/invoices/${randomUUID()}`);
  await expect(page.getByText('That invoice isn’t here')).toBeVisible();
  await page.goto('/app/invoices/not-a-real-id');
  await expect(page.getByText('That invoice isn’t here')).toBeVisible();
});

test('Pro Overview owes the remaining balance, not the whole invoice', async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('pro-over'));
  const id = await save(page);
  await save(page, { number: 'INV-0002', items: [{ id: 'i1', description: 'x', qty: '1', rate: '2000' }] });
  const r = await page.request.post(`/api/invoices/${id}/payments`, { headers: ORIGIN, data: body('5000') });
  expect(r.status()).toBe(201);

  await page.goto('/app/invoices/overview');
  const inr = page.getByRole('region', { name: 'Totals in INR' });
  // ₹20,000 − ₹5,000 + ₹2,000 = ₹17,000 still owed; nothing is overdue.
  await expect(inr.getByText('Unpaid', { exact: true })).toBeVisible();
  await expect(inr).toContainText('₹17,000.00');
  await expect(inr).toContainText('Nothing past due');
  await page.screenshot({ path: `${SHOTS}/payments-overview.png`, fullPage: true });
});
