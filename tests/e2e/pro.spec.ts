import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
// Dev-only: read the text (and colours) inside the downloaded PDF.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Stage 2C-1 (Invoice Pro) on the throwaway e2e database: no footer,
 * multi-page PDFs, templates, brand colour and quotations. Emails starting
 * "pro-" get a test-only manual Pro grant in that database; anything else is
 * a free account, which must see none of it.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const PDFS = 'test-results/pdfs';
const ORIGIN = { origin: BASE };
const GSTIN = '27AAPFU0939F1ZV';

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}

const SETTINGS = {
  name: 'Sharma Design Studio',
  address: '12 MG Road\nPune 411001',
  stateCode: '27',
  gstin: GSTIN,
  upiId: 'sharma@okhdfc',
  bankAccountName: 'Sharma Design Studio',
  showUpiQr: true,
  invoicePrefix: 'INV-',
  nextSequence: 1,
  defaultCurrency: 'INR',
  defaultTaxLabel: 'GST',
  defaultTaxRate: '18',
  defaultDueDays: 14,
  defaultNotes: '',
};

/** Radios are visually hidden inside their label (choice.tsx, design-panel.tsx): click what a person clicks. */
async function choose(radio: Locator) {
  await radio.locator('xpath=..').click();
  await expect(radio).toBeChecked();
}

/** fills: every fill and stroke colour drawn. */
type Pdf = { text: string; pageTexts: string[]; pages: number; fills: Set<string>; path: string };

async function readPdf(path: string): Promise<Pdf> {
  const doc = await getDocument({ data: new Uint8Array(await readFile(path)), disableFontFace: true }).promise;
  const pageTexts: string[] = [];
  const fills = new Set<string>();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    pageTexts.push((await page.getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').replace(/ ,/g, ','));
    const ops = await page.getOperatorList();
    ops.fnArray.forEach((fn, i) => {
      if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) fills.add(String(ops.argsArray[i][0]).toLowerCase());
    });
  }
  return { text: pageTexts.join(' '), pageTexts, pages: doc.numPages, fills, path };
}

async function downloadPdf(page: Page, keepAs?: string): Promise<Pdf> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).first().click()]);
  const path = await download.path();
  if (keepAs) {
    await mkdir(PDFS, { recursive: true });
    await copyFile(path, `${PDFS}/${keepAs}.pdf`);
  }
  return readPdf(path);
}

const item = (i: number) => ({ id: `i${i}`, description: `Line item ${i}`, qty: '1', rate: '100', hsn: '998391' });
function invoiceDoc(over: Record<string, unknown> = {}) {
  return {
    number: 'INV-0001',
    issueDate: '2026-10-22',
    dueDate: '2026-11-05',
    currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '', state: '27', gstin: GSTIN },
    client: { name: 'Acme Traders Pvt Ltd', address: 'Bengaluru', email: '' },
    items: [item(1)],
    discountType: 'percent',
    discountValue: '',
    taxLabel: 'GST',
    taxRate: '18',
    notes: '',
    ...over,
  };
}

test('free account: no Design, no quotations; the footer stays; the API drops a sneaked-in quote or design', async ({ page }) => {
  await signIn(page, email('free-2c'));
  await page.goto('/invoice-generator');
  await expect(page.getByLabel('Item 1 description')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Quotation', exact: true })).toHaveCount(0);
  await page.getByLabel('Item 1 description').fill('Work');
  await page.getByLabel('Item 1 rate').fill('1000');
  const pdf = await downloadPdf(page);
  expect(pdf.text).toContain('Made with KaamSolv');
  expect(pdf.text).toContain('INVOICE');

  const res = await page.request.post('/api/invoices', {
    headers: ORIGIN,
    data: { invoice: invoiceDoc({ kind: 'quote', design: { template: 'bold', color: '#6934D0' } }) },
  });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  const saved = (await (await page.request.get(`/api/invoices/${id}`)).json()) as { invoice: Record<string, unknown> };
  expect(saved.invoice.kind).toBeUndefined();
  expect(saved.invoice.design).toBeUndefined();
  const convert = await page.request.post(`/api/invoices/${id}/convert`, { headers: ORIGIN, data: {} });
  expect(convert.status()).toBe(403);

  await page.goto('/app/invoices');
  await expect(page.getByRole('radio', { name: 'Quotations' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '+ New quotation' })).toHaveCount(0);
  await page.goto('/app/invoices/settings');
  await expect(page.getByRole('heading', { name: 'Numbering and defaults' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quotations', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Design', exact: true })).toHaveCount(0);
});

test('Pro, 60 items: every page repeats the table header and is numbered; totals stay together; no footer', async ({ page }) => {
  await signIn(page, email('pro-pages'));
  await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
  const items = Array.from({ length: 60 }, (_, i) => item(i + 1));
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: invoiceDoc({ items, notes: 'Thanks for the work.' }) } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };

  await page.goto(`/invoice-generator?id=${id}`);
  await expect(page.getByLabel('Item 60 description')).toHaveValue('Line item 60');
  const pdf = await downloadPdf(page, 'pro-60-items');
  expect(pdf.pages).toBeGreaterThanOrEqual(3);
  const n = pdf.pages;
  pdf.pageTexts.forEach((t, i) => {
    // Every page with rows starts with the header row.
    if (/Line item \d+ /.test(t)) expect(t, `page ${i + 1} header row`).toContain('HSN/SAC DESCRIPTION QTY RATE GST AMOUNT');
    expect(t, `page ${i + 1} number`).toContain(`Page ${i + 1} of ${n}`);
    if (i > 0) expect(t, `page ${i + 1} running header`).toContain('Invoice INV-0001 · continued');
    else expect(t).not.toContain('continued');
  });
  // Every line, once.
  for (let i = 1; i <= 60; i++) expect(pdf.text.split(`Line item ${i} `).length - 1, `line ${i}`).toBe(1);
  // The closing block is on one page: subtotal, GST, total, words, summary, signatory.
  const last = pdf.pageTexts.findIndex((t) => t.includes('Subtotal'));
  expect(last).toBe(n - 1);
  for (const s of ['Subtotal ₹6,000.00', 'CGST ₹540.00', 'SGST ₹540.00', 'Total ₹7,080.00', 'Rupees Seven Thousand Eighty Only', 'Authorised signatory', 'Thanks for the work.']) {
    expect(pdf.pageTexts[last], s).toContain(s);
  }
  expect(pdf.text).not.toContain('Made with KaamSolv');
  // The on-screen "runs onto a second page" warning is for free invoices only.
  await expect(page.getByText('It runs onto a second page')).toHaveCount(0);
});

test('Pro templates and brand colour: Classic, Minimal and Bold each print every particular, in the chosen colour', async ({ page }) => {
  await signIn(page, email('pro-design'));
  await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
  await page.goto('/invoice-generator');
  await page.getByLabel('Client name').fill('Acme Traders Pvt Ltd');
  await page.getByLabel('Client GSTIN').fill('29AAGCB7383J1Z4');
  await page.getByLabel('Item 1 description').fill('Logo design');
  await page.getByLabel('Item 1 rate').fill('25000');
  await page.getByLabel('Item 1 HSN or SAC code').fill('998391');

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Design', level: 2 })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Classic/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Coral' })).toBeChecked();

  const looks = [
    ['classic', /^Classic/, 'Teal', '#38bbac'],
    ['minimal', /^Minimal/, 'Purple', '#6934d0'],
    ['bold', /^Bold/, 'Navy', '#0c2248'],
  ] as const;
  for (const [id, name, swatch, hex] of looks) {
    await choose(page.getByRole('radio', { name }));
    await choose(page.getByRole('radio', { name: swatch }));
    const pdf = await downloadPdf(page, `pro-template-${id}`);
    expect(pdf.pages, id).toBe(1);
    for (const s of ['TAX INVOICE', 'Invoice no.', 'Place of supply Karnataka (29)', 'Reverse charge No', `GSTIN ${GSTIN}`, 'GSTIN 29AAGCB7383J1Z4', '998391', 'IGST ₹4,500.00', 'Total ₹29,500.00', 'Rupees Twenty-Nine Thousand Five Hundred Only', 'Authorised signatory']) {
      expect(pdf.text, `${id}: ${s}`).toContain(s);
    }
    expect(pdf.text, id).not.toContain('Made with KaamSolv');
    expect([...pdf.fills], `${id} uses ${hex}`).toContain(hex);
  }

  // A custom hex colour, checked as you type.
  const hexBox = page.getByLabel('Custom colour (hex, like #FE6336)');
  await hexBox.fill('#12');
  await expect(page.getByText('Use a colour like #FE6336.')).toBeVisible();
  await hexBox.fill('#8b1e3f');
  await expect(page.getByRole('radio', { name: 'Maroon' })).toBeChecked();
  const maroon = await downloadPdf(page, 'pro-template-bold-maroon');
  expect([...maroon.fills]).toContain('#8b1e3f');

  // The design is saved with the invoice.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Bold/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Maroon' })).toBeChecked();
});

test('Pro settings: the default template and colour start every new invoice; quotation numbering shows', async ({ page }) => {
  await signIn(page, email('pro-defaults'));
  await page.goto('/app/invoices/settings');
  await expect(page.getByText('Next quotation: QT-0001')).toBeVisible();
  await page.getByLabel('Quotation prefix').fill('EST-');
  await page.getByLabel('Next quotation number').fill('7');
  await expect(page.getByText('Next quotation: EST-0007')).toBeVisible();
  await choose(page.getByRole('radio', { name: /^Minimal/ }));
  await choose(page.getByRole('radio', { name: 'Green' }));
  await page.getByRole('button', { name: 'Save invoice settings' }).click();
  await expect(page.getByText('Saved. New invoices will use these.')).toBeVisible();

  await page.goto('/invoice-generator');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Minimal/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Green' })).toBeChecked();
  await choose(page.getByRole('radio', { name: 'Quotation', exact: true }));
  await expect(page.getByLabel('Quotation number')).toHaveValue('EST-0007');
  await choose(page.getByRole('radio', { name: 'Invoice', exact: true }));
  await expect(page.getByLabel('Invoice number')).toHaveValue('INV-0001');
});

test('Pro quotation: QUOTATION, Valid until, QT-0001, no UPI QR; Convert makes an invoice; the list filters', async ({ page }) => {
  await signIn(page, email('pro-quote'));
  await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
  await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: invoiceDoc({ number: 'INV-0001' }) } });

  await page.goto('/app/invoices');
  await page.getByRole('link', { name: '+ New quotation' }).click();
  await expect(page.getByRole('heading', { name: 'QUOTATION' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Quotation', exact: true })).toBeChecked();
  await expect(page.getByLabel('Quotation number')).toHaveValue('QT-0001');
  await expect(page.getByLabel('Valid until')).toBeVisible();
  const issued = await page.getByLabel('Quotation date').inputValue();
  const valid = await page.getByLabel('Valid until').inputValue();
  expect((Date.parse(valid) - Date.parse(issued)) / 86_400_000).toBe(30);
  await expect(page.getByText('GST shown is an estimate. A tax invoice follows on supply.')).toBeVisible();
  await expect(page.getByText('Tax payable on reverse charge')).toHaveCount(0);

  await page.getByLabel('Client name').fill('Acme Traders Pvt Ltd');
  await page.getByLabel('Item 1 description').fill('Website redesign');
  await page.getByLabel('Item 1 rate').fill('40000');
  await page.getByLabel('Item 1 HSN or SAC code').fill('998314');
  const pdf = await downloadPdf(page, 'pro-quotation');
  for (const s of ['QUOTATION', 'Quote no. QT-0001', 'Valid until', 'GST shown is an estimate.', 'Website redesign', 'Total ₹47,200.00', 'UPI: sharma@okhdfc']) {
    expect(pdf.text, s).toContain(s);
  }
  for (const s of ['TAX INVOICE', 'Reverse charge', 'Scan to pay', 'Authorised signatory', 'Made with KaamSolv']) {
    expect(pdf.text, s).not.toContain(s);
  }

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Convert to invoice' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Record payment' })).toHaveCount(0); // quotations take no payments
  await expect(page.getByRole('radio', { name: 'Quotation', exact: true })).toHaveCount(0); // saved: the type is fixed
  await page.getByRole('button', { name: 'Convert to invoice' }).click();
  await page.waitForURL(/invoice-generator\?id=/);
  await expect(page.getByRole('heading', { name: 'TAX INVOICE' })).toBeVisible();
  await expect(page.getByLabel('Invoice number')).toHaveValue('INV-0002');
  await expect(page.getByLabel('Item 1 description')).toHaveValue('Website redesign');
  await expect(page.getByLabel('Client name')).toHaveValue('Acme Traders Pvt Ltd');
  await expect(page.getByRole('link', { name: 'Record payment' })).toBeVisible();

  await page.goto('/app/invoices');
  const rows = page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'QT-0001' }).getByText('Quote', { exact: true })).toBeVisible();
  await choose(page.getByRole('radio', { name: 'Quotations' }));
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('QT-0001');
  await expect(rows.first()).toContainText('Valid until');
  await choose(page.getByRole('radio', { name: 'Invoices' }));
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Saved invoices' })).not.toContainText('QT-0001');

  // Converting from the list too; the quotation stays.
  await choose(page.getByRole('radio', { name: 'All', exact: true }));
  await page.getByRole('button', { name: 'Convert QT-0001 to an invoice' }).click();
  await expect(page.getByText('Made an invoice from QT-0001.')).toBeVisible();
  await expect(rows).toHaveCount(4);

  // A copy of a quotation is the next quotation.
  await page.getByRole('button', { name: 'Make a copy of QT-0001' }).click();
  await expect(page.getByText('Copied QT-0001.')).toBeVisible();
  await expect(rows.filter({ hasText: 'QT-0002' })).toHaveCount(1);

  // Overview counts invoices only: 3 invoices × ₹… and never the quotations.
  await page.goto('/app/invoices/overview');
  await expect(page.getByText('QT-000')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, width, height] of [['desktop', 1280, 900], ['phone', 375, 812]] as const) {
    test(`screenshots ${label} ${scheme}: design panel, quotation, list filter, settings`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await signIn(page, email(`pro-2c-shot-${label}-${scheme}`));
      await page.request.put('/api/settings', { headers: ORIGIN, data: SETTINGS });
      await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: invoiceDoc() } });
      await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: invoiceDoc({ kind: 'quote', number: 'QT-0001', dueDate: '2026-11-21' }) } });

      const noSideways = async (what: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${what} sideways scroll`).toBeLessThanOrEqual(0);
      };

      await page.goto('/invoice-generator?type=quote');
      await expect(page.getByRole('heading', { name: 'QUOTATION' })).toBeVisible();
      await page.getByRole('button', { name: 'Design', exact: true }).click();
      await choose(page.getByRole('radio', { name: /^Bold/ }));
      await choose(page.getByRole('radio', { name: 'Teal' }));
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await noSideways('editor');
      await page.screenshot({ path: `${SHOTS}/pro-editor-design-${label}-${scheme}.png`, fullPage: false });
      await page.locator('#design-panel').screenshot({ path: `${SHOTS}/pro-design-panel-${label}-${scheme}.png` });

      await page.goto('/app/invoices');
      await expect(page.getByRole('radio', { name: 'Quotations' })).toBeVisible();
      await noSideways('list');
      await page.screenshot({ path: `${SHOTS}/pro-list-${label}-${scheme}.png`, fullPage: true });

      await page.goto('/app/invoices/settings');
      await expect(page.getByRole('heading', { name: 'Design', exact: true })).toBeVisible();
      await noSideways('settings');
      await page.getByRole('heading', { name: 'Quotations', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/pro-settings-${label}-${scheme}.png`, fullPage: true });
    });
  }
}
