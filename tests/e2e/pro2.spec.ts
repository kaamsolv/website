import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
// Dev-only: read the text inside a PDF.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Stage 2C-2 (Invoice Pro) on the throwaway e2e database: recurring reminders,
 * CSV export, batch from a CSV (with a ZIP of PDFs), and currency reference
 * rates. Emails starting "pro-" get a test-only manual Pro grant; anything else
 * is a free account, which must see none of it. The rates API is mocked: tests
 * never call Frankfurter.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const GSTIN = '27AAPFU0939F1ZV';
const KA = '29AAGCB7383J1Z4';

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const pad = (n: number) => String(n).padStart(2, '0');
/** The browser's own calendar date — the same rule the app uses. */
const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}

const SETTINGS = {
  name: 'Sharma Design Studio', address: '12 MG Road\nPune 411001', stateCode: '27', gstin: GSTIN,
  upiId: 'sharma@okhdfc', bankAccountName: 'Sharma Design Studio', showUpiQr: false,
  invoicePrefix: 'INV-', nextSequence: 1, defaultCurrency: 'INR', defaultTaxLabel: 'GST', defaultTaxRate: '18', defaultDueDays: 14, defaultNotes: '',
};

function invoiceDoc(over: Record<string, unknown> = {}) {
  return {
    number: 'INV-0001', issueDate: '2026-10-22', dueDate: '2026-11-05', currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '', state: '27', gstin: GSTIN },
    client: { name: 'Acme Traders Pvt Ltd', address: 'Bengaluru', email: '', gstin: KA },
    items: [{ id: 'i1', description: 'Logo design', qty: '1', rate: '10000', hsn: '998391', unit: 'pcs' }],
    discountType: 'percent', discountValue: '', taxLabel: 'GST', taxRate: '18', notes: '',
    ...over,
  };
}

async function save(page: Page, over: Record<string, unknown> = {}): Promise<string> {
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: invoiceDoc(over) } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes, disableFontFace: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  return text.replace(/\s+/g, ' ');
}

/** The file box is disabled until Settings have loaded, so wait for it like a person would. */
async function upload(page: Page, name: string, csv: string) {
  const box = page.getByLabel('Choose a CSV file');
  await expect(box).toBeEnabled();
  await box.setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
}

const mockFx = (page: Page) =>
  page.route('**/api/fx', (route) =>
    route.fulfill({ json: { ok: true, rates: { USD: { rate: 90, date: '2026-10-23' }, EUR: { rate: 100, date: '2026-10-23' }, GBP: { rate: 115, date: '2026-10-23' }, AED: { rate: 24.5, date: '2026-10-23' } } } }),
  );

test('free account: none of it shows, and every route says no', async ({ page }) => {
  await signIn(page, email('free-2c2'));
  const id = await save(page);
  await page.goto('/app/invoices');
  await expect(page.getByRole('list', { name: 'Saved invoices' })).toBeVisible();
  for (const name of ['Export CSV', 'Make from a CSV', 'Select all']) {
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'Due to repeat' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'From a CSV' })).toHaveCount(0);

  await page.goto(`/invoice-generator?id=${id}`);
  await expect(page.getByLabel('Item 1 description')).toHaveValue('Logo design');
  await expect(page.getByRole('button', { name: /Repeat/ })).toHaveCount(0);
  await expect(page.getByLabel('Currency rate')).toHaveCount(0);

  await page.goto('/app/invoices/batch');
  await expect(page).toHaveURL(/\/app\/invoices$/);

  const today = localDay();
  const calls = [
    await page.request.get('/api/invoices/export'),
    await page.request.get(`/api/invoices/due?today=${today}`),
    await page.request.get('/api/fx'),
    await page.request.put(`/api/invoices/${id}/recurring`, { headers: ORIGIN, data: { every: 'month', next: today } }),
    await page.request.post(`/api/invoices/${id}/recur`, { headers: ORIGIN, data: { action: 'create', today } }),
    await page.request.post('/api/invoices/batch', { headers: ORIGIN, data: { invoices: [invoiceDoc()] } }),
  ];
  expect(calls.map((c) => c.status())).toEqual([403, 403, 403, 403, 403, 403]);
});

test('Pro recurring: schedule it, reminder appears when due, Create makes the next invoice, Skip makes nothing', async ({ page }) => {
  await signIn(page, email('pro-recur'));
  await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
  const id = await save(page, { client: { name: 'Acme Traders Pvt Ltd', address: 'Bengaluru', email: '' } });

  await page.goto(`/invoice-generator?id=${id}`);
  await page.getByRole('button', { name: 'Repeat…' }).click();
  await page.getByLabel('How often').selectOption('month');
  await page.getByLabel('Next one').fill(localDay(-1));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Done — it repeats every month.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Monthly · next/ })).toBeVisible();

  await page.goto('/app/invoices');
  await expect(page.getByRole('heading', { name: 'Due to repeat' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Saved invoices' }).getByText(/Monthly · next/)).toBeVisible();
  await page.getByRole('button', { name: 'Create the next invoice from INV-0001' }).click();
  await expect(page.getByText(/Made the next invoice from INV-0001/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Due to repeat' })).toHaveCount(0);

  const rows = page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  const copy = rows.filter({ hasText: 'INV-0002' });
  await expect(copy).toContainText('Acme Traders Pvt Ltd');
  await expect(copy).not.toContainText('Monthly', { useInnerText: true });
  await expect(rows.filter({ hasText: 'INV-0001' })).toContainText('Monthly · next');
  // The copy is today's invoice, with the next number and the same line.
  await page.goto(`/invoice-generator?id=${(await (await page.request.get('/api/invoices')).json()).invoices.find((i: { number: string }) => i.number === 'INV-0002').id}`);
  await expect(page.getByLabel('Invoice date')).toHaveValue(localDay());
  await expect(page.getByLabel('Item 1 description')).toHaveValue('Logo design');

  // Skip: the date moves, nothing is made.
  const id2 = await save(page, { number: 'INV-0009', client: { name: 'Skip Co', address: '', email: '' } });
  expect((await page.request.put(`/api/invoices/${id2}/recurring`, { headers: ORIGIN, data: { every: 'week', next: localDay(-3) } })).status()).toBe(200);
  await page.goto('/app/invoices');
  await page.getByRole('button', { name: 'Skip this one for INV-0009' }).click();
  await expect(page.getByText(/Skipped\. INV-0009 is next due/)).toBeVisible();
  await expect(rows).toHaveCount(3);

  // A date a week off is refused, a second click on a handled reminder is a calm 409.
  const off = await page.request.post(`/api/invoices/${id}/recur`, { headers: ORIGIN, data: { action: 'skip', today: localDay(5) } });
  expect(off.status()).toBe(400);
  const gone = await page.request.post(`/api/invoices/${id2}/recur`, { headers: ORIGIN, data: { action: 'skip', today: localDay() } });
  expect(gone.status()).toBe(409);
  // Stopping works.
  expect((await page.request.put(`/api/invoices/${id}/recurring`, { headers: ORIGIN, data: { every: null } })).status()).toBe(200);
});

test('Pro CSV export: invoices and line items, GST columns, dates, and a safe client name', async ({ page }) => {
  await signIn(page, email('pro-export'));
  await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
  await save(page, { number: 'INV-0001', issueDate: '2026-04-10', client: { name: '=Acme', address: '', email: '', gstin: KA }, items: [
    { id: 'a', description: 'Design', qty: '1', rate: '10000', hsn: '998391', unit: 'pcs' },
    { id: 'b', description: 'Print, A3', qty: '10', rate: '100', hsn: '4911', gstRate: '5' },
  ] });
  await save(page, { number: 'INV-0002', issueDate: '2026-09-10', client: { name: 'Pat Sharma', address: '', email: '' } });

  await page.goto('/app/invoices');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const grab = async (button: string) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
    return { name: dl.suggestedFilename(), text: (await readFile(await dl.path(), 'utf8')) };
  };

  const all = await grab('Invoices (one row each)');
  expect(all.name).toBe('kaamsolv-invoices.csv');
  expect(all.text.charCodeAt(0)).toBe(0xfeff);
  const lines = all.text.slice(1).trim().split('\r\n');
  expect(lines[0]).toBe('Number,Type,Issue date,Due / valid until,Status,Paid on,Client,Client GSTIN,Place of supply,Currency,Subtotal,Discount,Taxable value,CGST,SGST / UTGST,IGST,Total');
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain("INV-0001,Invoice,2026-04-10");
  expect(lines[1]).toContain(`'=Acme,${KA},29,INR,11000,0,11000,0,0,`);
  expect(lines[2]).toContain('Pat Sharma');

  await page.getByLabel('From').fill('2026-06-01');
  const ranged = await grab('Invoices (one row each)');
  expect(ranged.name).toBe('kaamsolv-invoices-from-2026-06-01.csv');
  expect(ranged.text.slice(1).trim().split('\r\n')).toHaveLength(2);

  await page.getByLabel('From').fill('');
  const items = await grab('Line items (HSN / SAC)');
  expect(items.name).toBe('kaamsolv-invoice-lines.csv');
  const rows = items.text.slice(1).trim().split('\r\n');
  expect(rows[0]).toContain('HSN / SAC');
  expect(rows.some((r) => r.includes('998391') && r.includes(',pcs,'))).toBe(true);
  expect(rows.some((r) => r.includes('"Print, A3"') && r.includes(',5,'))).toBe(true);

  await page.request.get('/api/invoices/export?from=nope').then((r) => expect(r.status()).toBe(400));
});

test('Pro batch from a CSV: preview with a bad row, create the good ones, ZIP of PDFs — and the ZIP again from All invoices', async ({ page }) => {
  await signIn(page, email('pro-batch'));
  await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
  const csv = [
    'group,client_name,client_email,client_gstin,client_address,state_code,description,qty,rate,gst_rate,hsn,unit,issue_date,due_date,notes',
    'A1,Acme Traders Pvt Ltd,,29AAGCB7383J1Z4,Bengaluru,29,Website redesign,1,40000,18,998314,pcs,,,Thank you',
    'A1,,,,,,Hosting,1,6000,18,998315,,,,',
    'B2,Pat Sharma,,,Pune,27,Logo design,1,15000,18,998391,,,,',
    'C3,Bad Co,,27AAPFU0939F1ZX,,,Work,1,500,18,,,,,',
  ].join('\n');

  await page.goto('/app/invoices');
  await page.getByRole('link', { name: 'From a CSV' }).first().click();
  await expect(page.getByRole('heading', { name: 'Invoices from a CSV' })).toBeVisible();
  const [tpl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download template' }).click()]);
  expect(tpl.suggestedFilename()).toBe('kaamsolv-invoice-template.csv');

  await upload(page, 'clients.csv', csv);
  await expect(page.getByText('clients.csv: 2 ready, 1 with problems (left out).')).toBeVisible();
  const preview = page.getByRole('list', { name: 'Invoices from your file' });
  await expect(preview.locator(':scope > li')).toHaveCount(3);
  await expect(preview.locator(':scope > li').filter({ hasText: 'Acme Traders' })).toContainText('₹54,280.00');
  await expect(preview.locator(':scope > li').filter({ hasText: 'Bad Co' })).toContainText('Line 5: client_gstin');
  await page.screenshot({ path: `${SHOTS}/pro2-batch-preview-desktop.png`, fullPage: true });

  await page.getByRole('button', { name: 'Create 2 invoices' }).click();
  await expect(page.getByRole('heading', { name: '2 invoices made.' })).toBeVisible();
  await expect(page.getByText('INV-0001, INV-0002')).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all as ZIP' }).click()]);
  const zip = unzipSync(new Uint8Array(await readFile(await dl.path())));
  expect(Object.keys(zip).sort()).toEqual(['INV-0001.pdf', 'INV-0002.pdf']);
  const first = await pdfText(zip['INV-0001.pdf']);
  for (const s of ['TAX INVOICE', 'Acme Traders Pvt Ltd', 'Website redesign', 'Hosting', 'Total ₹54,280.00', 'Thank you']) expect(first, s).toContain(s);
  expect(await pdfText(zip['INV-0002.pdf'])).toContain('Pat Sharma');
  await expect(page.getByText('Done — 2 PDFs in your ZIP.')).toBeVisible();

  // Closed the tab before the ZIP? Everything is saved: tick them in All invoices and ZIP again.
  await page.getByRole('link', { name: 'See them in All invoices' }).click();
  await expect(page.getByRole('button', { name: 'Download 2 as ZIP' })).toBeVisible();
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download 2 as ZIP' }).click()]);
  expect(Object.keys(unzipSync(new Uint8Array(await readFile(await dl2.path())))).sort()).toEqual(['INV-0001.pdf', 'INV-0002.pdf']);
  await expect(page.getByText('Done — 2 PDFs in your ZIP.')).toBeVisible();

  // The same file again is flagged, and numbering carries on.
  await page.goto('/app/invoices/batch');
  await upload(page, 'clients.csv', csv);
  await expect(page.getByText(/Looks like INV-000[12], made in the last 24 hours/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Create 2 invoices' }).click();
  await expect(page.getByText('INV-0003, INV-0004')).toBeVisible();

  // Wrong file shapes are explained, and the server holds the line at 50.
  await page.goto('/app/invoices/batch');
  await upload(page, 'x.csv', ['name,amount', 'Acme,10'].join(String.fromCharCode(10)));
  await expect(page.getByRole('alert').filter({ hasText: 'needs these columns: client_name, description, rate' })).toBeVisible();
  const big = await page.request.post('/api/invoices/batch', { headers: ORIGIN, data: { invoices: Array.from({ length: 51 }, () => invoiceDoc()) } });
  expect(big.status()).toBe(400);
});

test('Pro currency rates: ₹ equivalent in the editor and on Overview; it hides itself when rates are down', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await signIn(page, email('pro-fx'));
  await mockFx(page);
  await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
  await save(page, { currency: 'USD', taxLabel: '', taxRate: '', items: [{ id: 'a', description: 'Consulting', qty: '1', rate: '1000' }] });

  await page.goto('/invoice-generator');
  await page.getByLabel('Item 1 description').fill('Work');
  await page.getByLabel('Item 1 rate').fill('2000');
  await expect(page.getByLabel('See this total in')).toBeVisible();
  await page.getByLabel('See this total in').selectOption('USD');
  await expect(page.getByTestId('fx-line')).toContainText('≈ $26.22'); // ₹2,360 incl. 18% GST at 90
  await page.getByLabel('Currency', { exact: true }).first().selectOption('USD');
  await page.getByLabel('Tax type').selectOption('none');
  await expect(page.getByTestId('fx-line')).toContainText('≈ ₹1,80,000.00');
  await expect(page.getByTestId('fx-line')).toContainText('1 USD = ₹90.00 · rate of 23 Oct 2026 · Frankfurter');
  await expect(page.getByText('Shown here only — it isn’t on the PDF.')).toBeVisible();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('≈ ₹1,80,000.00');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).first().click()]);
  expect(await pdfText(new Uint8Array(await readFile(await dl.path())))).not.toContain('Frankfurter');
  await page.screenshot({ path: `${SHOTS}/pro2-fx-editor-desktop.png` });

  await page.goto('/app/invoices/overview');
  await expect(page.getByTestId('fx-USD')).toContainText('₹90,000.00');
  await expect(page.getByTestId('fx-USD')).toContainText('Frankfurter');

  await page.unroute('**/api/fx');
  await page.route('**/api/fx', (route) => route.fulfill({ status: 502, json: { ok: false, error: 'unavailable', message: 'Rates aren’t available right now.' } }));
  await page.goto('/app/invoices/overview');
  await expect(page.getByText('Billed this month').first()).toBeVisible();
  await expect(page.getByTestId('fx-USD')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, width, height] of [['desktop', 1280, 900], ['phone', 375, 812]] as const) {
    test(`screenshots ${label} ${scheme}: due card, repeat panel, export panel, batch, rates`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await signIn(page, email(`pro-2c2-shot-${label}-${scheme}`));
      await mockFx(page);
      await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
      const id = await save(page);
      await page.request.put(`/api/invoices/${id}/recurring`, { headers: ORIGIN, data: { every: 'month', next: localDay(-1) } });
      await save(page, { number: 'INV-0005', currency: 'USD', taxLabel: '', taxRate: '', client: { name: 'Globex Inc', address: '', email: '' } });
      const noSideways = async (what: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${what} sideways scroll`).toBeLessThanOrEqual(0);
      };

      await page.goto('/app/invoices');
      await expect(page.getByRole('heading', { name: 'Due to repeat' })).toBeVisible();
      await page.getByRole('button', { name: 'Export CSV' }).click();
      await expect(page.getByLabel('Export to CSV')).toBeVisible();
      await noSideways('list');
      await page.screenshot({ path: `${SHOTS}/pro2-list-${label}-${scheme}.png`, fullPage: true });

      await page.goto(`/invoice-generator?id=${id}`);
      await page.getByRole('button', { name: /^Monthly · next/ }).click();
      await expect(page.getByRole('heading', { name: 'Repeat this invoice' })).toBeVisible();
      await noSideways('editor');
      await page.locator('#repeat-panel').screenshot({ path: `${SHOTS}/pro2-repeat-panel-${label}-${scheme}.png` });

      await page.goto('/app/invoices/batch');
      await upload(page, 'clients.csv', ['group,client_name,description,qty,rate,gst_rate', 'A,Acme Pvt Ltd,Website,1,40000,18', 'B,Bad Co,Work,1,abc,18'].join(String.fromCharCode(10)));
      await expect(page.getByText(/1 ready, 1 with problems/)).toBeVisible();
      await noSideways('batch');
      await page.screenshot({ path: `${SHOTS}/pro2-batch-${label}-${scheme}.png`, fullPage: true });

      await page.goto('/app/invoices/overview');
      await expect(page.getByTestId('fx-USD')).toBeVisible();
      await noSideways('overview');
      await page.screenshot({ path: `${SHOTS}/pro2-overview-${label}-${scheme}.png`, fullPage: true });
    });
  }
}
