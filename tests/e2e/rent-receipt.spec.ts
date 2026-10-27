import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Rent Receipt Generator (/rent-receipt-generator): the form, the live preview, the PAN and stamp
 * notes, refusals, and the PDF that actually downloads (opened and read back, and rendered as
 * pictures so it can be looked at). The financial year is always chosen explicitly, so these don't
 * depend on today's date.
 */
const SHOTS = 'test-results/screenshots';
const SAVED_PDF = 'test-results/rent-receipts-sample.pdf';

async function fill(page: Page, over: Partial<Record<'tenant' | 'landlord' | 'address' | 'rent' | 'pan' | 'ref', string>> = {}) {
  const v = { tenant: 'Priya Sharma', landlord: 'Rakesh Gupta', address: 'Flat 4B, Green Park Apartments, Bengaluru 560034', rent: '25,000', pan: '', ref: '', ...over };
  await page.getByLabel('Tenant (you)').fill(v.tenant);
  await page.getByLabel('Landlord', { exact: true }).fill(v.landlord);
  await page.getByLabel('Address of the rented property').fill(v.address);
  await page.getByLabel('Rent per month').fill(v.rent);
  if (v.pan) await page.getByLabel(/Landlord’s PAN/).fill(v.pan);
  if (v.ref) await page.getByLabel(/^Reference/).fill(v.ref);
  await page.locator('#rr-fy').selectOption('2026'); // April 2026 to March 2027, whatever today is
}

async function readPdf(bytes: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  const n = doc.numPages;
  await doc.loadingTask.destroy();
  return { pageCount: n, pages, all: pages.join(' \n ') };
}

const preview = (page: Page) => page.getByTestId('receipt-preview');

test('the page opens clean: no errors on a fresh form, a placeholder instead of a receipt', async ({ page }) => {
  await page.goto('/rent-receipt-generator');
  await expect(page).toHaveTitle(/Rent receipt generator/);
  await expect(page.getByRole('heading', { level: 1, name: 'Rent receipt generator' })).toBeVisible();
  await expect(page.getByText('Fill in the details and your receipt appears here.')).toBeVisible();
  await expect(page.locator('#rr-tenant-err, #rr-landlord-err, #rr-address-err, #rr-rent-err')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
  await expect(page.getByText('Only make receipts for rent you actually paid.').first()).toBeVisible();
});

test('live preview: the first receipt, and a summary of all of them', async ({ page }) => {
  await page.goto('/rent-receipt-generator');
  await fill(page);
  await expect(preview(page)).toContainText('RENT RECEIPT');
  await expect(preview(page)).toContainText('For April 2026');
  await expect(preview(page)).toContainText('Date: 30 Apr 2026');
  await expect(preview(page)).toContainText('Received with thanks from Priya Sharma the sum of ₹25,000 (Rupees Twenty-Five Thousand Only) as rent for April 2026, for the property at Flat 4B, Green Park Apartments, Bengaluru 560034.');
  await expect(preview(page)).toContainText('Paid by UPI.');
  await expect(preview(page)).toContainText('Rakesh Gupta');
  await expect(page.getByText(/12 receipts \(April 2026 to March 2027\) · ₹3,00,000 in all · 4 pages, three to a page/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF (12 receipts)' })).toBeVisible();

  await page.getByLabel('Rent per month').fill('8,333.50');
  await expect(preview(page)).toContainText('₹8,333.50 (Rupees Eight Thousand Three Hundred Thirty-Three and Fifty Paise Only)');
  await page.getByText('1st of the month').click();
  await expect(preview(page)).toContainText('Date: 1 Apr 2026');
});

test('the landlord-PAN note: shown when rent is over ₹1,00,000 a year and no PAN; gone with a valid PAN or small rent', async ({ page }) => {
  await page.goto('/rent-receipt-generator');
  await fill(page, { rent: '25,000' });
  const note = page.getByRole('status').filter({ hasText: /employers usually ask for the landlord’s PAN/ });
  await expect(note).toBeVisible();
  await page.getByLabel(/Landlord’s PAN/).fill('abcde 1234 f');
  await expect(note).toHaveCount(0);
  await expect(preview(page)).toContainText('PAN: ABCDE1234F');
  await page.getByLabel(/Landlord’s PAN/).fill('ABCD123');
  await expect(page.locator('#rr-pan-err')).toContainText('five letters, four digits, one letter');
  await page.getByLabel(/Landlord’s PAN/).fill('');
  await page.getByLabel('Rent per month').fill('8,333'); // 99,996 a year
  await expect(note).toHaveCount(0);
  await page.getByLabel('Rent per month').fill('8,334'); // 1,00,008 a year
  await expect(note).toBeVisible();
});

test('the revenue-stamp note and box: cash over ₹5,000 only', async ({ page }) => {
  await page.goto('/rent-receipt-generator');
  await fill(page);
  const note = page.getByRole('status').filter({ hasText: /landlords usually put a ₹1 revenue stamp/ });
  await expect(note).toHaveCount(0);
  await page.getByText('Cash', { exact: true }).click();
  await expect(note).toBeVisible();
  await expect(preview(page)).toContainText('Revenue stamp ₹1');
  await page.getByLabel('Rent per month').fill('5,000');
  await expect(note).toHaveCount(0);
  await page.getByLabel('Rent per month').fill('5,001');
  await expect(note).toBeVisible();
  await page.getByText('Bank transfer', { exact: true }).click();
  await expect(note).toHaveCount(0);
});

test('mistakes are refused calmly: live for wrong values, all at once on Download', async ({ page }) => {
  await page.goto('/rent-receipt-generator');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  for (const id of ['#rr-tenant-err', '#rr-landlord-err', '#rr-address-err', '#rr-rent-err']) await expect(page.locator(id), id).toBeVisible();
  await expect(page.getByText('Fill in the details marked above first.')).toBeVisible();
  await expect(page.getByTestId('receipt-preview')).toHaveCount(0);

  await page.getByLabel('Rent per month').fill('1,5');
  await expect(page.locator('#rr-rent-err')).toContainText('Check the commas');
  await page.getByLabel('Rent per month').fill('-500');
  await expect(page.locator('#rr-rent-err')).toContainText('Negative');
  await page.getByLabel('Rent per month').fill('25000.555');
  await expect(page.locator('#rr-rent-err')).toContainText('2 decimal places');
  await page.getByLabel('Rent per month').fill('25,000');
  await expect(page.locator('#rr-rent-err')).toHaveCount(0);
});

test('"Pick the months": any range, and a backwards or too long one is refused', async ({ page }) => {
  await page.goto('/rent-receipt-generator');
  await fill(page);
  await page.getByText('Pick the months', { exact: true }).first().click();
  await page.getByLabel('From month').selectOption('12');
  await page.getByLabel('From year').selectOption('2026');
  await page.getByLabel('To month').selectOption('2');
  await page.getByLabel('To year').selectOption('2027');
  await expect(page.getByText(/3 receipts \(December 2026 to February 2027\) · ₹75,000 in all · 1 page, three to a page/)).toBeVisible();
  await expect(preview(page)).toContainText('For December 2026');

  await page.getByLabel('To year').selectOption('2026');
  await page.getByLabel('To month').selectOption('11');
  await expect(page.getByRole('alert').filter({ hasText: /can’t be before/ })).toBeVisible();
  await expect(page.getByTestId('receipt-preview')).toHaveCount(0);

  await page.getByLabel('From year').selectOption('2023');
  await page.getByLabel('From month').selectOption('4');
  await page.getByLabel('To year').selectOption('2027');
  await page.getByLabel('To month').selectOption('3');
  await expect(page.getByRole('alert').filter({ hasText: /48 months. Up to 24 at a time/ })).toBeVisible();
});

test('the PDF: downloads, has every month in order, 4 pages of 3, and nothing was uploaded', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  await page.goto('/rent-receipt-generator');
  await fill(page, { pan: 'abcde1234f', ref: 'Ref 77' });
  await page.getByText('Cash', { exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF (12 receipts)' }).click()]);
  expect(file.suggestedFilename()).toBe('rent-receipts-April-2026-to-March-2027.pdf');
  const bytes = await readFile(await file.path());
  await file.saveAs(SAVED_PDF);
  await expect(page.getByText(/Done\. 12 receipts, 4 pages\./)).toBeVisible();
  await expect(page.getByText(/ask your landlord to sign each one \(and the stamp\)/)).toBeVisible();

  const pdf = await readPdf(bytes);
  expect(pdf.pageCount).toBe(4);
  expect(pdf.all.split('RENT RECEIPT').length - 1).toBe(12);
  for (const p of pdf.pages) expect(p.split('RENT RECEIPT').length - 1).toBe(3);
  let at = -1;
  for (const m of ['April 2026', 'July 2026', 'December 2026', 'March 2027']) {
    const found = pdf.all.indexOf(`For ${m}`, at + 1);
    expect(found, m).toBeGreaterThan(at);
    at = found;
  }
  expect(pdf.all.split('₹25,000').length - 1).toBe(12);
  expect(pdf.all.split('PAN: ABCDE1234F').length - 1).toBe(12);
  expect(pdf.all.split('Revenue stamp ₹1').length - 1).toBe(12);
  expect(pdf.all).toContain('Paid by Cash (Ref: Ref 77).');
  expect(sent, 'no request carried the details anywhere').toEqual([]);
});

test('the PDF looks right: its pages, drawn by the PDF to JPG tool, saved as pictures to look at', async ({ page }) => {
  await page.goto('/rent-receipt-generator');
  await fill(page, { pan: 'ABCDE1234F' });
  await page.getByText('Cash', { exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download PDF/ }).click()]);

  await page.goto('/pdf-to-jpg');
  await page.locator('input[type="file"]').first().setInputFiles(await file.path());
  await page.getByRole('button', { name: /^Convert 4 pages to JPG$/ }).click();
  await expect(page.getByText('Done. 4 JPGs are ready.')).toBeVisible({ timeout: 60_000 });
  const srcs = await page.getByRole('link', { name: /Page \d/ }).locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
  expect(srcs).toHaveLength(4);
  const pngs = await page.evaluate(async (urls) => {
    const out: string[] = [];
    for (const u of urls) {
      const img = new Image();
      img.src = u;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      out.push(c.toDataURL('image/png').split(',')[1]);
    }
    return out;
  }, srcs);
  const { writeFileSync } = await import('node:fs');
  pngs.forEach((b64, i) => writeFileSync(`${SHOTS}/rent-receipt-pdf-page-${i + 1}.png`, Buffer.from(b64, 'base64')));
  expect(pngs[0].length).toBeGreaterThan(5000); // a drawn page, not a blank one
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}: empty, filled and with errors; no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/rent-receipt-generator');
      const main = page.locator('main').first();
      await main.screenshot({ path: `${SHOTS}/rent-receipt-${name}-${scheme}-empty.png` });
      await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
      await expect(page.locator('#rr-rent-err')).toBeVisible();
      await main.screenshot({ path: `${SHOTS}/rent-receipt-${name}-${scheme}-errors.png` });
      await fill(page);
      await page.getByText('Cash', { exact: true }).click();
      await expect(preview(page)).toBeVisible();
      await main.screenshot({ path: `${SHOTS}/rent-receipt-${name}-${scheme}-filled.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no horizontal scroll').toBe(false);
    });
  }
}
