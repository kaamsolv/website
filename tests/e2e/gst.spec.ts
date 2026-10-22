import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
// Dev-only: read the text inside the downloaded PDF.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { gstinCheckChar } from '../../app/lib/invoice/india';

/**
 * Stage 2B: the GST tax invoice — free, no account needed. Every PDF is read
 * back with pdfjs to check the printed particulars, not just the screen.
 */

const SHOTS = 'test-results/screenshots';
const gstin = (state: string, pan = 'AAPFU0939F') => `${state}${pan}1Z${gstinCheckChar(`${state}${pan}1Z`)}`;
const MH = gstin('27'); // Maharashtra
const MH2 = gstin('27', 'AAGCB7383J');
const KA = gstin('29', 'AAGCB7383J'); // Karnataka
const CH = gstin('04'); // Chandigarh (UT without a legislature)

async function pdf(page: Page): Promise<{ text: string; pages: number; path: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).first().click()]);
  const path = await download.path();
  const doc = await getDocument({ data: new Uint8Array(await readFile(path)), disableFontFace: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  return { text: text.replace(/\s+/g, ' '), pages: doc.numPages, path };
}

async function taxInvoice(page: Page, seller: string, client: string) {
  await page.goto('/invoice-generator');
  await page.getByLabel('Your business name').fill('Sharma Design Studio');
  await page.getByLabel('Your GSTIN').fill(seller);
  await page.getByLabel('Client name').fill('Acme Traders Pvt Ltd');
  await page.getByLabel('Client GSTIN').fill(client);
  await page.getByLabel('GST rate', { exact: true }).selectOption('18');
  await page.getByLabel('Item 1 description').fill('Logo design');
  await page.getByLabel('Item 1 rate').fill('25000');
  await page.getByLabel('Item 1 HSN or SAC code').fill('998391');
  await page.getByLabel('Item 1 unit').fill('pcs');
}

test('Maharashtra seller → Karnataka client: TAX INVOICE with IGST, place of supply, HSN, summary, words, signatory', async ({ page }) => {
  await taxInvoice(page, MH, KA);
  await expect(page.getByRole('heading', { name: 'TAX INVOICE' })).toBeVisible();
  await expect(page.getByText('This is a GST tax invoice.')).toBeVisible();
  await expect(page.getByLabel('Place of supply')).toHaveValue('29');
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByLabel('Item 2 description').fill('Printed brochures');
  await page.getByLabel('Item 2 quantity').fill('100');
  await page.getByLabel('Item 2 rate').fill('50');
  await page.getByLabel('Item 2 HSN or SAC code').fill('4911');
  await page.getByLabel('Item 2 GST rate').selectOption('5');
  // 25000 @18% + 5000 @5% → IGST 4500 + 250
  await expect(page.getByTestId('gst-split')).toContainText('IGST');
  await expect(page.getByTestId('invoice-total')).toHaveText('₹34,750.00');
  await expect(page.getByText('Rupees Thirty-Four Thousand Seven Hundred Fifty Only')).toBeVisible();

  const { text, pages } = await pdf(page);
  expect(pages).toBe(1);
  for (const s of [
    'TAX INVOICE',
    'Place of supply Karnataka (29)',
    'Reverse charge No',
    `GSTIN ${MH}`,
    'State: Maharashtra (27)',
    `GSTIN ${KA}`,
    'State: Karnataka (29)',
    'HSN/SAC',
    '998391',
    '4911',
    '1 pcs',
    'IGST ₹4,750.00',
    'GST RATE TAXABLE VALUE IGST TOTAL TAX',
    '5% ₹5,000.00 ₹250.00 ₹250.00',
    '18% ₹25,000.00 ₹4,500.00 ₹4,500.00',
    'Rupees Thirty-Four Thousand Seven Hundred Fifty Only',
    'For Sharma Design Studio',
    'Authorised signatory',
  ]) {
    expect(text, s).toContain(s);
  }
  expect(text).not.toContain('CGST');
});

test('same state: CGST + SGST (half each), no IGST', async ({ page }) => {
  await taxInvoice(page, MH, MH2);
  await expect(page.getByLabel('Place of supply')).toHaveValue('27');
  await expect(page.getByTestId('invoice-total')).toHaveText('₹29,500.00');
  const { text } = await pdf(page);
  expect(text).toContain('CGST ₹2,250.00');
  expect(text).toContain('SGST ₹2,250.00');
  expect(text).not.toContain('IGST');
});

test('a UT without a legislature: CGST + UTGST', async ({ page }) => {
  await taxInvoice(page, CH, CH);
  await page.getByLabel('Place of supply').selectOption('04');
  const { text } = await pdf(page);
  expect(text).toContain('UTGST ₹2,250.00');
  expect(text).toContain('Place of supply Chandigarh (04)');
});

test('choosing GST without a GSTIN: a clear note, and it stays a plain INVOICE', async ({ page }) => {
  await page.goto('/invoice-generator');
  await page.getByLabel('Item 1 rate').fill('1000');
  await page.getByLabel('GST rate', { exact: true }).selectOption('18');
  await expect(page.getByText('Only GST-registered businesses can charge GST — add your GSTIN, or pick No tax.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'INVOICE', exact: true })).toBeVisible();
  await expect(page.getByLabel('Place of supply')).toHaveCount(0);
});

test('composition: BILL OF SUPPLY with the required wording and no tax', async ({ page }) => {
  await taxInvoice(page, MH, KA);
  await page.getByLabel('Tax type').selectOption('composition');
  await expect(page.getByRole('heading', { name: 'BILL OF SUPPLY' })).toBeVisible();
  await expect(page.getByTestId('invoice-total')).toHaveText('₹25,000.00');
  const { text } = await pdf(page);
  expect(text).toContain('BILL OF SUPPLY');
  expect(text).toContain('Composition taxable person, not eligible to collect tax on supplies');
  expect(text).toContain('Rupees Twenty-Five Thousand Only');
  expect(text).not.toMatch(/IGST|CGST|SGST/);
});

test('GST invoice numbers over 16 characters get a clear message', async ({ page }) => {
  await taxInvoice(page, MH, KA);
  await page.getByLabel('Invoice number').fill('INVOICE-2026-10-22-01');
  await expect(page.getByText('GST invoice numbers can be at most 16 characters.')).toBeVisible();
  await page.getByLabel('Invoice number').fill('KS/26-27/0001');
  await expect(page.getByText('GST invoice numbers can be at most 16 characters.')).toHaveCount(0);
});

test('10 lines with every particular, ship-to and payment details still fit one page', async ({ page }) => {
  await taxInvoice(page, MH, KA);
  await page.getByLabel('Your address').fill('12 MG Road, Pune 411001');
  await page.getByLabel('Client address').fill('4th Floor, Brigade Road\nBengaluru 560025');
  await page.getByRole('button', { name: '+ Deliver to a different address' }).click();
  await page.getByLabel('Delivery address').fill('Warehouse 7, Hosur Road\nBengaluru 560068');
  for (let i = 2; i <= 10; i++) {
    await page.getByRole('button', { name: '+ Add item' }).click();
    await page.getByLabel(`Item ${i} description`).fill(`Website redesign sprint — discovery, wireframes and handover notes (${i})`);
    await page.getByLabel(`Item ${i} rate`).fill('12500');
    await page.getByLabel(`Item ${i} HSN or SAC code`).fill('998314');
    if (i % 2) await page.getByLabel(`Item ${i} GST rate`).selectOption('5');
  }
  await page.getByLabel('Notes or payment details').fill('Thank you for your business. Payment within 14 days.');
  await page.getByRole('button', { name: '+ Add payment details (bank / UPI)' }).click();
  await page.getByLabel('Bank account name').fill('Sharma Design Studio');
  await page.getByLabel('Bank account number').fill('50100123456789');
  await page.getByLabel('IFSC').fill('HDFC0001234');
  await page.getByLabel('UPI ID').fill('sharma@okhdfc');
  const { text, pages, path } = await pdf(page);
  const { copyFile } = await import('node:fs/promises');
  await copyFile(path, `${SHOTS}/gst-tax-invoice-10-items.pdf`);
  expect(pages).toBe(1);
  expect(text).toContain('SHIP TO');
  expect(text).toContain('Authorised signatory');
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, width] of [['desktop', 1280], ['phone', 375]] as const) {
    test(`screenshot ${label} ${scheme}: editor as a GST tax invoice`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await taxInvoice(page, MH, KA);
      await page.getByRole('button', { name: '+ Add item' }).click();
      await page.getByLabel('Item 2 description').fill('Printed brochures');
      await page.getByLabel('Item 2 rate').fill('5000');
      await page.getByLabel('Item 2 GST rate').selectOption('5');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.setViewportSize({ width, height: 2600 });
      await page.locator('article[aria-label="Invoice"]').screenshot({ path: `${SHOTS}/gst-editor-${label}-${scheme}.png` });
      if (label === 'desktop' && scheme === 'light') {
        const { path } = await pdf(page);
        const { copyFile } = await import('node:fs/promises');
        await copyFile(path, `${SHOTS}/gst-tax-invoice-sample.pdf`);
      }
    });
  }
}

test('composition set in the Business profile: new invoices start as a Bill of Supply', async ({ page }) => {
  const email = `comp-${Date.now()}@example.test`;
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': process.env.KK_E2E_SECRET ?? '' }, data: { email, name: 'Pat' } });
  expect(res.status()).toBe(200);
  await page.goto('/app/business');
  await page.getByLabel('Business name').fill('Small Shop');
  await page.getByLabel('I’m under the GST composition scheme').check();
  await page.getByRole('button', { name: 'Save business profile' }).click();
  await expect(page.getByText('Saved. Your invoices will use these details.')).toBeVisible();
  await page.goto('/invoice-generator');
  await expect(page.getByRole('heading', { name: 'BILL OF SUPPLY' })).toBeVisible();
  await expect(page.getByLabel('Tax type')).toHaveValue('composition');
});
