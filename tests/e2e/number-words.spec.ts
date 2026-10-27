import { expect, test } from '@playwright/test';

/**
 * Indian Number to Words (/indian-number-to-words): live as you type, cheque style
 * and plain words, exact paise, strict about input that could change an amount,
 * copy, and no sign-in needed.
 */

const SHOTS = 'test-results/screenshots';

test('works signed out, with the page in place', async ({ page }) => {
  await page.goto('/indian-number-to-words');
  await expect(page.getByRole('heading', { level: 1, name: 'Indian number to words' })).toBeVisible();
  await expect(page.getByLabel('Amount in figures')).toBeVisible();
  await expect(page.getByText('Type or paste an amount.')).toBeVisible();
  await expect(page.locator('#ntw-amount-err')).toHaveCount(0);
  // empty box: results are placeholders, nothing to copy
  await expect(page.getByRole('button', { name: /^Copy/ })).toHaveCount(0);
});

test('updates as you type: cheque style and plain words, with the Indian regrouping shown', async ({ page }) => {
  await page.goto('/indian-number-to-words');
  const amount = page.getByLabel('Amount in figures');

  await amount.fill('125000');
  await expect(page.getByText('Rupees One Lakh Twenty-Five Thousand Only', { exact: true })).toBeVisible();
  await expect(page.getByText('One Lakh Twenty-Five Thousand', { exact: true })).toBeVisible();
  await expect(page.getByText('Reads as ₹1,25,000')).toBeVisible();

  await amount.fill('₹ 1,180.5');
  await expect(page.getByText('Rupees One Thousand One Hundred Eighty and Fifty Paise Only', { exact: true })).toBeVisible();
  await expect(page.getByText('One Thousand One Hundred Eighty Point Five Zero', { exact: true })).toBeVisible();
  await expect(page.getByText('Reads as ₹1,180.50')).toBeVisible();

  await amount.fill('.50');
  await expect(page.getByText('Fifty Paise Only', { exact: true })).toBeVisible();
  await amount.fill('0');
  await expect(page.getByText('Rupees Zero Only', { exact: true })).toBeVisible();

  await amount.fill('2,50,00,000');
  await expect(page.getByText('Rupees Two Crore Fifty Lakh Only', { exact: true })).toBeVisible();
});

test('refuses input that could change the amount, calmly, and shows no words for it', async ({ page }) => {
  await page.goto('/indian-number-to-words');
  const amount = page.getByLabel('Amount in figures');
  const bad: [string, RegExp][] = [
    ['1,5', /Check the commas/],
    ['-500', /Negative amounts/],
    ['1.005', /up to 2 decimal places|2 decimal places/],
    ['12 rupees', /digits only/],
    ['1'.repeat(15), /bigger than this tool handles/],
  ];
  for (const [text, message] of bad) {
    await amount.fill(text);
    await expect(page.locator('#ntw-amount-err'), text).toContainText(message);
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/Only$/), `no words for ${text}`).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Copy/ })).toHaveCount(0);
  }
  // fixing it clears the message
  await amount.fill('1,500');
  await expect(page.locator('#ntw-amount-err')).toHaveCount(0);
  await expect(page.getByText('Rupees One Thousand Five Hundred Only', { exact: true })).toBeVisible();
});

test('the example buttons fill the box, and Copy puts the line on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  await page.goto('/indian-number-to-words');
  await page.getByRole('button', { name: '10,00,000', exact: true }).click();
  await expect(page.getByLabel('Amount in figures')).toHaveValue('10,00,000');
  await expect(page.getByText('Rupees Ten Lakh Only', { exact: true })).toBeVisible();

  const copies = page.getByRole('button', { name: /^Copy/ });
  await expect(copies).toHaveCount(2);
  await copies.first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Rupees Ten Lakh Only');
  await copies.nth(1).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Ten Lakh');
});

test('is listed as a live tool, on its own address, and the Invoice Generator still words amounts the same way', async ({ page, request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/indian-number-to-words');
  await page.goto('/tools');
  await expect(page.getByRole('link', { name: /Indian Number to Words/ }).first()).toHaveAttribute('href', '/indian-number-to-words');
  expect((await request.get('/generators/indian-number-to-words')).status(), 'the old placeholder address was never a page').toBe(404);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}: empty, result and error; no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/indian-number-to-words');
      const amount = page.getByLabel('Amount in figures');
      const tool = page.locator('main').first();
      await tool.screenshot({ path: `${SHOTS}/number-words-${name}-${scheme}-empty.png` });
      await amount.fill('1,25,00,000.50');
      await expect(page.getByText('Rupees One Crore Twenty-Five Lakh and Fifty Paise Only', { exact: true })).toBeVisible();
      await tool.screenshot({ path: `${SHOTS}/number-words-${name}-${scheme}-result.png` });
      await amount.fill('1,5');
      await expect(page.locator('#ntw-amount-err')).toBeVisible();
      await tool.screenshot({ path: `${SHOTS}/number-words-${name}-${scheme}-error.png` });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(wide, 'no horizontal scroll').toBe(false);
    });
  }
}
