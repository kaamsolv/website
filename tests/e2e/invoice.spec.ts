import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
// Dev-only: read the text inside the downloaded PDF.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const SHOTS = 'test-results/screenshots';

/** Screenshot with a viewport tall enough that nothing scrolls — otherwise sticky bars get stitched into the image. */
async function tallShot(page: Page, path: string, width: number, target?: string) {
  const before = page.viewportSize()!;
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.setViewportSize({ width, height: 2400 });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (target) await page.locator(target).screenshot({ path });
  else await page.screenshot({ path });
  await page.setViewportSize(before);
}

async function pdfText(path: string): Promise<{ pages: number; text: string }> {
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data, disableFontFace: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  return { pages: doc.numPages, text: text.replace(/\s+/g, ' ') };
}

async function fillSample(page: Page) {
  await page.getByLabel('Your business name').fill('Sharma Design Studio');
  await page.getByLabel('Your address').fill('12 MG Road\nBengaluru 560001');
  await page.getByLabel('Your email').fill('hello@sharmadesign.in');
  await page.getByLabel('Your phone').fill('+91 98450 12345');
  await page.getByLabel('Client name').fill('Acme Traders Pvt Ltd');
  await page.getByLabel('Client address').fill('4th Floor, Nariman Point\nMumbai 400021');
  await page.getByLabel('Client email').fill('accounts@acme.in');
  await page.getByLabel('Item 1 description').fill('Logo design');
  await page.getByLabel('Item 1 rate').fill('25,000');
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByLabel('Item 2 description').fill('Brand guidelines (PDF)');
  await page.getByLabel('Item 2 rate').fill('15000');
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByLabel('Item 3 description').fill('Social media templates');
  await page.getByLabel('Item 3 quantity').fill('5');
  await page.getByLabel('Item 3 rate').fill('2000');
  await page.getByLabel('Discount', { exact: true }).fill('10');
  await page.getByLabel('GST rate', { exact: true }).selectOption('18');
  await page.getByLabel('Notes or payment details').fill('Bank: HDFC Bank, A/c 50100123456789, IFSC HDFC0001234\nUPI: sharmadesign@okhdfc');
}

for (const scheme of ['light', 'dark'] as const) {
  test(`desktop ${scheme}: live totals, screenshot, PDF with free-tier footer`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/invoice-generator');
    await fillSample(page);

    // ₹50,000 − 10% = ₹45,000; + 18% = ₹53,100 — updated live, no Generate button.
    await expect(page.getByTestId('invoice-total')).toHaveText('₹53,100.00');
    await tallShot(page, `${SHOTS}/invoice-desktop-${scheme}.png`, 1280, 'article[aria-label="Invoice"]');

    const number = await page.getByLabel('Invoice number').inputValue();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).first().click()]);
    expect(download.suggestedFilename()).toBe(`${number}.pdf`);
    const path = await download.path();
    await download.saveAs(`${SHOTS}/invoice-sample-${scheme}.pdf`);
    const head = (await readFile(path)).subarray(0, 5).toString();
    expect(head).toBe('%PDF-');

    const { pages, text } = await pdfText(path);
    expect(pages).toBe(1);
    expect(text).toContain('Made with KaamSolv');
    expect(text).toContain(number);
    expect(text).toContain('₹53,100.00');
    expect(text).toContain('Sharma Design Studio');
    expect(text).toContain('Acme Traders Pvt Ltd');
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`phone 375px ${scheme}: no sideways scroll, download from the bottom bar`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/invoice-generator');
    await fillSample(page);
    await expect(page.getByTestId('invoice-total')).toHaveText('₹53,100.00');

    await expect(page.getByRole('button', { name: 'Download PDF' })).toHaveCount(1); // only the bottom bar on phones
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await tallShot(page, `${SHOTS}/invoice-phone-${scheme}.png`, 375);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).last().click()]);
    const { pages, text } = await pdfText(await download.path());
    expect(pages).toBe(1);
    expect(text).toContain('Made with KaamSolv');
  });
}

test('10 long items still fit one page; an 11th is blocked with a clear message', async ({ page }) => {
  await page.goto('/invoice-generator');
  const long = 'Website redesign sprint — discovery workshop, wireframes, high-fidelity mockups and handover notes';
  for (let i = 1; i <= 10; i++) {
    if (i > 1) await page.getByRole('button', { name: '+ Add item' }).click();
    await page.getByLabel(`Item ${i} description`).fill(`${long} (${i})`);
    await page.getByLabel(`Item ${i} rate`).fill('12500');
  }
  await page.getByLabel('Notes or payment details').fill('Payment within 14 days. '.repeat(15));
  await expect(page.getByRole('button', { name: '+ Add item' })).toBeDisabled();
  await expect(page.getByText('up to 10 items fit on a one-page invoice')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).first().click()]);
  await download.saveAs(`${SHOTS}/invoice-10-items.pdf`);
  const { pages, text } = await pdfText(await download.path());
  expect(pages).toBe(1);
  expect(text).toContain('(10)');
});

test('currency switch, bad input, keyboard and labels', async ({ page }) => {
  await page.goto('/invoice-generator');
  await page.getByLabel('Item 1 rate').fill('1250.5');
  await page.getByLabel('Currency').first().selectOption('AED');
  await expect(page.getByTestId('invoice-total')).toHaveText('AED 1,250.50');
  await page.getByLabel('Currency').first().selectOption('EUR');
  await expect(page.getByTestId('invoice-total')).toHaveText('€1,250.50');

  await page.getByLabel('Item 1 quantity').fill('two');
  await expect(page.getByText('Item 1: quantity and rate must be numbers')).toBeVisible();
  await expect(page.getByLabel('Item 1 quantity')).toHaveAttribute('aria-invalid', 'true');

  // Every field on the paper has an accessible name.
  const unnamed = await page.locator('article input:not([type=file]), article textarea, article select').evaluateAll((els) =>
    els.filter((el) => !el.getAttribute('aria-label') && !(el as HTMLInputElement).labels?.length).length,
  );
  expect(unnamed).toBe(0);

  // Keyboard: Tab reaches the paper fields in reading order, with a visible focus ring.
  await page.getByLabel('Your business name').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Your address')).toBeFocused();
  // Coral focus underline (polled: the colour animates in over ~150 ms).
  await expect
    .poll(() => page.getByLabel('Your address').evaluate((el) => getComputedStyle(el).borderBottomColor))
    .toBe('rgb(254, 99, 54)');
});
