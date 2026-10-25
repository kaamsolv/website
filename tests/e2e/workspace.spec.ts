import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
// Dev-only: read the text inside the downloaded PDF.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Stage 2A on the throwaway e2e database (tests/e2e/start-server.mts): GST
 * rate dropdown, Settings, saved customers (free: 3) and items, payment details
 * and UPI QR on the PDF, the Pro dashboard and paid/unpaid. Emails starting
 * "pro-" get a test-only manual Pro grant in that database.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const VALID_GSTIN = '27AAPFU0939F1ZV';

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}

async function pdfText(path: string): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(await readFile(path)), disableFontFace: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    text += (await (await doc.getPage(p)).getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  return text.replace(/\s+/g, ' ');
}

async function downloadPdf(page: Page): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).first().click()]);
  return pdfText(await download.path());
}

test('GST rate dropdown: post-22 Sept 2025 slabs, Other… box, note on screen only', async ({ page }) => {
  await page.goto('/invoice-generator');
  await page.getByLabel('Item 1 description').fill('Design');
  await page.getByLabel('Item 1 rate').fill('1000');

  const rate = page.getByLabel('GST rate', { exact: true });
  await expect(rate.locator('option')).toHaveText(['Choose rate', '0%', '0.25%', '3%', '5%', '18%', '40%', 'Other…']);
  await expect(page.getByText('GST rates follow the changes from 22 September 2025.')).toBeVisible();
  await rate.selectOption('18');
  await expect(page.getByTestId('invoice-total')).toHaveText('₹1,180.00');

  await rate.selectOption('other');
  await page.getByLabel('Tax rate in percent').fill('28');
  await expect(page.getByTestId('invoice-total')).toHaveText('₹1,280.00');

  await page.getByLabel('Tax type').selectOption('none');
  await expect(page.getByTestId('invoice-total')).toHaveText('₹1,000.00');
  await page.getByLabel('Tax type').selectOption('GST');
  await page.getByLabel('GST rate', { exact: true }).selectOption('5');

  const text = await downloadPdf(page);
  expect(text).toContain('GST (5%)');
  expect(text).not.toContain('22 September');
});

test('Settings: inline errors, then every new invoice starts from them — and the PDF shows GSTIN, payment details and the UPI QR', async ({ page }) => {
  await signIn(page, email('settings'));
  // The old Settings URL now lands on the shared Business profile.
  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/app\/business$/);
  await page.getByLabel('Business name').fill('Sharma Design Studio');
  await page.getByLabel('State').selectOption('27');
  await page.getByLabel('GSTIN').fill('27AAPFU0939F1ZX');
  await page.getByLabel('IFSC').fill('HDFC1');
  await page.getByRole('button', { name: 'Save business profile' }).click();
  await expect(page.getByText('That GSTIN has a typo')).toBeVisible();
  await expect(page.getByText('An IFSC looks like')).toBeVisible();

  await page.getByLabel('GSTIN').fill(VALID_GSTIN);
  await page.getByLabel('Account name').fill('Sharma Design Studio');
  await page.getByLabel('Account number').fill('50100123456789');
  await page.getByLabel('IFSC').fill('hdfc0001234');
  await page.getByLabel('Bank name').fill('HDFC Bank');
  await page.getByLabel('UPI ID').fill('sharma@okhdfc');
  await page.getByLabel('Show a “Scan to pay” UPI QR on rupee invoices').check();
  await page.getByRole('button', { name: 'Save business profile' }).click();
  await expect(page.getByText('Saved. Your invoices will use these details.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/workspace-business-desktop-light.png`, fullPage: true });

  // Invoice numbering and defaults live under Invoices — and saving them keeps the business profile.
  await page.goto('/app/invoices/settings');
  await expect(page.getByLabel('Business name')).toHaveCount(0);
  await page.getByLabel('Number prefix').fill('KS-');
  await page.getByLabel('Next number').fill('7');
  await page.getByLabel('Rate').selectOption('18');
  await page.getByLabel('Days to pay').fill('30');
  await expect(page.getByText('Next invoice: KS-0007')).toBeVisible();
  await page.getByRole('button', { name: 'Save invoice settings' }).click();
  await expect(page.getByText('Saved. New invoices will use these.')).toBeVisible();
  await page.goto('/app/business');
  await expect(page.getByLabel('GSTIN')).toHaveValue(VALID_GSTIN);
  await expect(page.getByLabel('UPI ID')).toHaveValue('sharma@okhdfc');

  await page.goto('/invoice-generator');
  await expect(page.getByLabel('Invoice number')).toHaveValue('KS-0007');
  await expect(page.getByLabel('Your business name')).toHaveValue('Sharma Design Studio');
  await expect(page.getByLabel('Your GSTIN')).toHaveValue(VALID_GSTIN);
  await expect(page.getByLabel('GST rate', { exact: true })).toHaveValue('18');
  await expect(page.getByLabel('IFSC')).toHaveValue('HDFC0001234');
  await page.getByLabel('Client name').fill('Acme Traders');
  await page.getByLabel('Client GSTIN').fill('29AAGCB7383J1Z4');
  await page.getByLabel('Item 1 description').fill('Logo design');
  await page.getByLabel('Item 1 rate').fill('25000');

  const text = await downloadPdf(page);
  for (const s of [`GSTIN ${VALID_GSTIN}`, 'GSTIN 29AAGCB7383J1Z4', 'PAYMENT DETAILS', 'A/c no.: 50100123456789', 'IFSC: HDFC0001234', 'UPI: sharma@okhdfc', 'Scan to pay with any UPI app', 'TAX INVOICE', 'IGST ₹4,500.00', '₹29,500.00']) {
    expect(text, s).toContain(s);
  }
});

test('customers: free account saves 3, then a clear limit; pick one on the invoice; save a new one from the invoice', async ({ page }) => {
  await signIn(page, email('cust'));
  await page.goto('/app/customers'); // old URL → /app/business/customers
  await expect(page).toHaveURL(/\/app\/business\/customers$/);
  for (const [i, name] of ['Alpha Foods', 'Beta Labs', 'Gamma Retail'].entries()) {
    await page.getByRole('button', { name: '+ Add customer' }).click();
    await page.getByLabel('Business or person').fill(name);
    if (i === 0) await page.getByLabel('GSTIN').fill('29AAGCB7383J1Z4');
    await page.getByRole('button', { name: 'Save customer' }).click();
    await expect(page.getByText(`Saved ${name}.`)).toBeVisible();
  }
  await expect(page.getByText('3 of 3 saved — the free limit. Saving more than 3 customers is part of Pro — coming soon.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add customer' })).toBeDisabled();
  const over = await page.request.post('/api/customers', { headers: ORIGIN, data: { name: 'Delta' } });
  expect(over.status()).toBe(403);
  await page.screenshot({ path: `${SHOTS}/workspace-customers-desktop-light.png`, fullPage: true });

  await page.goto('/invoice-generator');
  await page.getByLabel('Client name').fill('Alpha Foods');
  await expect(page.getByLabel('Client GSTIN')).toHaveValue('29AAGCB7383J1Z4');
  await page.getByLabel('Client name').fill('Someone New');
  await expect(page.getByText('You’ve saved 3 customers — the free limit.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save as customer' })).toHaveCount(0);
});

test('items: save one, then picking it on the invoice fills the rate', async ({ page }) => {
  await signIn(page, email('items'));
  await page.goto('/app/items'); // old URL → /app/business/items
  await expect(page).toHaveURL(/\/app\/business\/items$/);
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByLabel('Name (as printed on the invoice)').fill('Logo design package');
  await page.getByLabel('HSN / SAC code').fill('12345');
  await page.getByLabel('Rate (₹)').fill('15000');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByText('HSN/SAC codes are 4, 6 or 8 digits.')).toBeVisible();
  await page.getByLabel('HSN / SAC code').fill('998391');
  await page.getByLabel('GST rate', { exact: true }).selectOption('18');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByText('HSN/SAC 998391 · ₹15000 · GST 18%')).toBeVisible();

  await page.goto('/invoice-generator');
  await page.getByLabel('Item 1 description').fill('Logo design package');
  await expect(page.getByLabel('Item 1 rate')).toHaveValue('15000');
});

test('another user’s customers and items are a 404; lists never mix', async ({ page, browser }) => {
  await signIn(page, email('owner'));
  const c = (await (await page.request.post('/api/customers', { headers: ORIGIN, data: { name: 'Secret Customer' } })).json()) as { id: string };
  const i = (await (await page.request.post('/api/items', { headers: ORIGIN, data: { name: 'Secret Item' } })).json()) as { id: string };

  const other = await browser.newContext({ baseURL: BASE });
  const p2 = await other.newPage();
  await signIn(p2, email('intruder'));
  for (const path of [`/api/customers/${c.id}`, `/api/items/${i.id}`]) {
    expect((await p2.request.get(path)).status()).toBe(404);
    expect((await p2.request.put(path, { headers: ORIGIN, data: { name: 'x' } })).status()).toBe(404);
    expect((await p2.request.delete(path, { headers: ORIGIN })).status()).toBe(404);
  }
  expect(JSON.stringify(await (await p2.request.get('/api/customers')).json())).not.toContain('Secret');
  expect(JSON.stringify(await (await p2.request.get('/api/items')).json())).not.toContain('Secret');
  await other.close();
});

test('hub for a free account: Invoices card says Free and x of 20; no Overview, no paid tracking, no billing yet', async ({ page }) => {
  await signIn(page, email('free'));
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Your KaamSolv', level: 1 })).toBeVisible();
  const cards = page.getByRole('list', { name: 'Your tools' }).getByRole('listitem');
  await expect(cards).toHaveCount(2); // Invoices, QR codes
  const card = cards.filter({ has: page.getByRole('heading', { name: 'Invoices', exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Free');
  await expect(card).toContainText('0 of 3 saved'); // test-only save limit 3
  const qr = cards.filter({ has: page.getByRole('heading', { name: 'QR codes', exact: true }) });
  await expect(qr).toContainText('Free');
  await expect(qr).toContainText('0 of 3 tracked');
  await expect(page.getByText('Plans and billing')).toHaveCount(0);
  await expect(page.getByText('Dashboard')).toHaveCount(0);
  await page.goto('/app/invoices/overview');
  await expect(page).toHaveURL(/\/app\/invoices$/);
  await expect(page.getByRole('navigation', { name: 'Your workspace' }).getByRole('link', { name: 'Overview' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Account menu for/ }).click();
  await expect(page.getByRole('menu')).not.toContainText('Dashboard');
  expect((await page.request.get('/api/dashboard')).status()).toBe(403);
  await expect(page.getByRole('button', { name: /^Mark .* as paid$/ })).toHaveCount(0);
});

test('Pro: dashboard totals, overdue, and marking paid', async ({ page }) => {
  await signIn(page, email('pro'));
  const mk = async (number: string, issueDate: string, dueDate: string, rate: string) =>
    ((await (
      await page.request.post('/api/invoices', {
        headers: ORIGIN,
        data: { invoice: { number, issueDate, dueDate, currency: 'INR', seller: {}, client: { name: `${number} Client` }, items: [{ id: '1', description: 'Work', qty: '1', rate }], taxLabel: '', taxRate: '' } },
      })
    ).json()) as { id: string }).id;
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAgo = (n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
  await mk('P-1', iso(today), daysAgo(-10), '1000');
  await mk('P-2', daysAgo(60), daysAgo(45), '500'); // overdue

  await page.goto('/app');
  const card = page.getByRole('list', { name: 'Your tools' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Invoices', exact: true }) });
  await expect(card).toContainText('Pro');
  await expect(card).toContainText('₹1,500.00 unpaid');
  await card.getByRole('link', { name: /Open invoices/ }).click();
  await expect(page).toHaveURL(/\/app\/invoices\/overview$/);
  await expect(page.getByRole('heading', { name: 'Invoices overview' })).toBeVisible();
  await expect(page.getByText('Billed this month')).toBeVisible();
  await expect(page.getByText('1 invoice past due')).toBeVisible();
  await expect(page.getByText('Overdue', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/workspace-dashboard-desktop-light.png`, fullPage: true });

  await page.goto('/app/invoices');
  await expect(page.getByRole('list', { name: 'Saved invoices' })).toBeVisible(); // the page is interactive once the list is drawn
  await page.getByRole('button', { name: 'Mark P-2 as paid' }).click();
  await expect(page.getByText('P-2 marked paid.')).toBeVisible();
  await page.goto('/app/invoices/overview');
  await expect(page.getByText('Nothing past due')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, width, height] of [['desktop', 1280, 900], ['phone', 375, 812]] as const) {
    test(`screenshots ${label} ${scheme}: settings, customers, items, dashboard, editor`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await signIn(page, email(`pro-shot-${label}-${scheme}`));
      await page.request.post('/api/customers', { headers: ORIGIN, data: { name: 'Acme Traders Pvt Ltd', gstin: '29AAGCB7383J1Z4' } });
      await page.request.post('/api/items', { headers: ORIGIN, data: { name: 'Logo design', hsnSac: '998391', unit: 'pcs', rate: '25000', gstRate: '18' } });
      await page.request.put('/api/settings', {
        headers: ORIGIN,
        data: { name: 'Sharma Design Studio', stateCode: '27', gstin: VALID_GSTIN, bankAccountName: 'Sharma Design Studio', bankAccountNumber: '50100123456789', bankIfsc: 'HDFC0001234', bankName: 'HDFC Bank', upiId: 'sharma@okhdfc', showUpiQr: true, invoicePrefix: 'INV-', nextSequence: 1, defaultCurrency: 'INR', defaultTaxLabel: 'GST', defaultTaxRate: '18', defaultDueDays: 14, defaultNotes: '' },
      });

      for (const path of ['/app', '/app/business', '/app/business/customers', '/app/business/items', '/app/invoices/overview', '/app/invoices/settings']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} sideways scroll`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${SHOTS}/workspace-${path.slice(1).replace(/\//g, '-')}-${label}-${scheme}.png`, fullPage: true });
      }

      await page.goto('/invoice-generator');
      await page.getByLabel('Client name').fill('Acme Traders Pvt Ltd');
      await page.getByLabel('Item 1 description').fill('Logo design');
      await expect(page.getByLabel('Item 1 rate')).toHaveValue('25000');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.setViewportSize({ width, height: 2600 });
      await page.locator('article[aria-label="Invoice"]').screenshot({ path: `${SHOTS}/workspace-editor-${label}-${scheme}.png` });
    });
  }
}
