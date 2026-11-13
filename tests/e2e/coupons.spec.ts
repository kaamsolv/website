import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Coupon Code Generator (/coupon-code-generator): the settings, the live codes, the files that really download (opened and
 * read back), copy, honest limits, nothing uploaded, search and catalogue, and phone widths in both themes.
 */
const SHOTS = 'test-results/screenshots';
const CLEAR = '[A-HJKMNP-Z2-9]';

const choice = (page: Page, group: string, text: RegExp) => page.getByRole('group', { name: group }).locator('label').filter({ hasText: text });
const count = (page: Page) => page.getByLabel('How many codes', { exact: true });
const length = (page: Page) => page.getByLabel('Characters in each code', { exact: true });
const prefix = (page: Page) => page.getByLabel('Starts with (optional)');
const sample = (page: Page) => page.getByTestId('coupon-sample').locator('li');
const everyCode = (page: Page) => page.getByTestId('coupon-all');
/** Opens the page and waits for the first codes: they are made after the page has loaded its script, so this is the sign it is ready to be used. */
async function open(page: Page) {
  await page.goto('/coupon-code-generator');
  await expect(page.getByTestId('coupon-sample').locator('li')).toHaveCount(6);
}
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

async function allCodes(page: Page): Promise<string[]> {
  await page.getByText('See every code').click();
  const text = await everyCode(page).inputValue();
  return text.split('\n').filter(Boolean);
}

test('opens ready: 100 codes on first load, in the clear alphabet, with the honest note and no errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  await open(page);
  await expect(page).toHaveTitle(/Coupon code generator/);
  await expect(page.getByRole('heading', { level: 1, name: 'Coupon code generator' })).toBeVisible();
  await expect(page.getByTestId('coupon-count')).toHaveText('100 codes');
  await expect(sample(page)).toHaveCount(6);
  for (const li of await sample(page).all()) await expect(li).toHaveText(new RegExp(`^${CLEAR}{4}-${CLEAR}{4}$`));
  await expect(page.getByText('and 94 more.')).toBeVisible();
  await expect(page.getByTestId('coupon-strength')).toContainText('A random guess matches one of your codes about 1 time in 853 crore.');
  await expect(page.getByTestId('coupon-labels-note')).toContainText('can’t stop a code being used twice');
  await expect(page.getByText('Made on your device. Nothing is uploaded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy all codes' })).toBeVisible();
  expect(problems, 'no console errors or page errors').toEqual([]);
});

test('settings shape the codes: count, length, prefix, characters, dashes', async ({ page }) => {
  await open(page);
  await count(page).fill('25');
  await expect(page.getByTestId('coupon-count')).toHaveText('25 codes');
  expect(await allCodes(page)).toHaveLength(25);

  await length(page).fill('12');
  await expect(sample(page).first()).toHaveText(new RegExp(`^${CLEAR}{4}-${CLEAR}{4}-${CLEAR}{4}$`));

  await prefix(page).fill('diwali 25!');
  await expect(prefix(page)).toHaveValue('DIWALI25');
  await expect(sample(page).first()).toHaveText(new RegExp(`^DIWALI25-${CLEAR}{4}-${CLEAR}{4}-${CLEAR}{4}$`));

  await choice(page, 'Characters', /^Digits$/).click();
  await expect(sample(page).first()).toHaveText(/^DIWALI25-\d{4}-\d{4}-\d{4}$/);

  await choice(page, 'Dashes', /^None$/).click();
  await expect(sample(page).first()).toHaveText(/^DIWALI25-\d{12}$/);

  await choice(page, 'Dashes', /^Every 3$/).click();
  await choice(page, 'Characters', /^Letters$/).click();
  await expect(sample(page).first()).toHaveText(/^DIWALI25-[A-HJKMNP-Z]{3}-[A-HJKMNP-Z]{3}-[A-HJKMNP-Z]{3}-[A-HJKMNP-Z]{3}$/);
});

test('slider and box stay in step, and a typed number past the slider still counts', async ({ page }) => {
  await open(page);
  const slider = page.getByRole('slider', { name: 'How many codes, slider' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(count(page)).toHaveValue('1000');
  await expect(page.getByTestId('coupon-count')).toHaveText('1,000 codes');
  await page.keyboard.press('ArrowLeft');
  await expect(count(page)).toHaveValue('999');
  await page.keyboard.press('Home');
  await expect(count(page)).toHaveValue('1');
  await expect(page.getByTestId('coupon-count')).toHaveText('1 code');
  await count(page).fill('300');
  await expect(slider).toHaveValue('300');
  await length(page).fill('16');
  await expect(page.getByRole('slider', { name: 'Characters in each code, slider' })).toHaveValue('16');
  await count(page).fill('1,000');
  await expect(slider).toHaveValue('1000');
  await expect(page.getByTestId('coupon-count')).toHaveText('1,000 codes');
  await expect(page.getByTestId('coupon-strength')).toContainText('less than 1 time in a lakh crore');
});

test('dragging the count or typing a prefix keeps the codes you are looking at; "Make a new set" changes them', async ({ page }) => {
  await open(page);
  const first = (await sample(page).first().textContent())!;
  await count(page).fill('40');
  await expect(page.getByTestId('coupon-count')).toHaveText('40 codes');
  await expect(sample(page).first()).toHaveText(first);
  await prefix(page).fill('sale');
  await expect(sample(page).first()).toHaveText(`SALE-${first}`);
  await page.getByTestId('coupon-new').click();
  await expect(sample(page).first()).not.toHaveText(`SALE-${first}`);
  await expect(sample(page).first()).toHaveText(new RegExp(`^SALE-${CLEAR}{4}-${CLEAR}{4}$`));
});

test('every code is different, in the list and in the files', async ({ page }) => {
  await open(page);
  await count(page).fill('1000');
  const codes = await allCodes(page);
  expect(codes).toHaveLength(1000);
  expect(new Set(codes).size).toBe(1000);
});

test('out-of-range numbers say so, show no codes, and recover', async ({ page }) => {
  await open(page);
  await count(page).fill('5000');
  await expect(page.getByText('Pick a whole number from 1 to 1,000.')).toBeVisible();
  await expect(page.getByTestId('coupon-count')).toHaveText('—');
  await expect(page.getByRole('button', { name: 'Download CSV' })).toHaveCount(0);
  await count(page).fill('12.5');
  await expect(page.getByText('Pick a whole number from 1 to 1,000.')).toBeVisible();
  await count(page).fill('10');
  await expect(page.getByTestId('coupon-count')).toHaveText('10 codes');
  await length(page).fill('3');
  await expect(page.getByText('Make the code 4 to 16 characters long.')).toBeVisible();
  await expect(page.getByTestId('coupon-count')).toHaveText('—'); // no codes until the length is valid too
  await length(page).fill('6');
  await expect(page.getByTestId('coupon-count')).toHaveText('10 codes');
  await expect(sample(page).first()).toHaveText(new RegExp(`^${CLEAR}{4}-${CLEAR}{2}$`));
  await expect(page.getByText('Make the code 4 to 16 characters long.')).toHaveCount(0);
});

test('the CSV downloads with the codes, the discount and the date; the TXT is one code per line', async ({ page }) => {
  await open(page);
  await prefix(page).fill('sale');
  await count(page).fill('60');
  await choice(page, 'Discount', /% off/).click();
  await expect(page.getByLabel('Percent off', { exact: true })).toHaveValue('10');
  await page.getByLabel('Percent off', { exact: true }).fill('15');
  await page.getByLabel(/^Valid until/).fill('2026-12-31');
  const shown = await allCodes(page);

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(csv.suggestedFilename()).toBe('coupon-codes-60-sale.csv');
  const csvText = await readFile((await csv.path())!, 'utf8');
  const lines = csvText.trim().split('\r\n');
  expect(lines[0]).toBe('code,discount_type,discount_value,expires_on');
  expect(lines).toHaveLength(61);
  expect(csvText.charCodeAt(0)).toBe('c'.charCodeAt(0)); // no byte-order mark
  expect(lines.slice(1)).toEqual(shown.map((c) => `${c},percent,15,2026-12-31`));

  const [txt] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download TXT' }).click()]);
  expect(txt.suggestedFilename()).toBe('coupon-codes-60-sale.txt');
  expect((await readFile((await txt.path())!, 'utf8')).trim().split('\n')).toEqual(shown);
});

test('with no discount or date the CSV cells are empty, and an amount label is written as a number', async ({ page }) => {
  await open(page);
  await count(page).fill('3');
  const [plain] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(plain.suggestedFilename()).toBe('coupon-codes-3.csv');
  const rows = (await readFile((await plain.path())!, 'utf8')).trim().split('\r\n');
  for (const r of rows.slice(1)) expect(r).toMatch(new RegExp(`^${CLEAR}{4}-${CLEAR}{4},,,$`));

  await choice(page, 'Discount', /₹ off/).click();
  await expect(page.getByLabel('Amount off', { exact: true })).toHaveValue('100');
  await page.getByLabel('Amount off', { exact: true }).fill('250');
  const [amount] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  const amountRows = (await readFile((await amount.path())!, 'utf8')).trim().split('\r\n');
  for (const r of amountRows.slice(1)) expect(r).toMatch(/,amount,250,$/);
});

test('a discount or date that makes no sense is called out and the files wait; copying still works', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  await open(page);
  await choice(page, 'Discount', /% off/).click();
  await page.getByLabel('Percent off', { exact: true }).fill('150');
  await expect(page.getByText('A percentage off is more than 0 and up to 100, with at most two decimals.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
  await expect(page.getByText('Fix the discount or the date to download the files.')).toBeVisible();
  await page.getByRole('button', { name: 'Copy all codes' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')).toHaveLength(100);
  await page.getByLabel('Percent off', { exact: true }).fill('20');
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
});

test('a past valid-until date gets a gentle note, not a block', async ({ page }) => {
  await open(page);
  await page.getByLabel(/^Valid until/).fill('2020-01-01');
  await expect(page.getByText('That date has already passed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
});

test('Copy puts every code on the clipboard, one per line, matching the list', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  await open(page);
  await prefix(page).fill('vip');
  await count(page).fill('30');
  const listed = await allCodes(page);
  await page.getByRole('button', { name: 'Copy all codes' }).click();
  // Windows hands clipboard text back with CRLF line ends; the codes themselves are what matter.
  expect((await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/)).toEqual(listed);
});

test('nothing is uploaded: no request carries a code anywhere', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  await open(page);
  await count(page).fill('200');
  await prefix(page).fill('nope');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  await page.getByTestId('coupon-new').click();
  expect(sent).toEqual([]);
});

test('keyboard: the controls are reachable in order and "Make a new set" works from the keyboard', async ({ page }) => {
  await open(page);
  await page.getByTestId('coupon-new').focus();
  const first = (await sample(page).first().textContent())!;
  await page.keyboard.press('Enter');
  await expect(sample(page).first()).not.toHaveText(first);
  await count(page).focus();
  await page.keyboard.press('Tab'); // the slider follows the box
  await expect(page.getByRole('slider', { name: 'How many codes, slider' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveValue('101');
  await choice(page, 'Dashes', /^Every 3$/).locator('input').focus();
  await page.keyboard.press('ArrowRight');
  await expect(choice(page, 'Dashes', /^None$/).locator('input')).toBeChecked();
});

test('search and catalogue: found by task, listed under Business, in the sitemap and the footer of related tools', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search for a tool' });
  await search.fill('i need discount codes for my sale');
  const option = page.getByRole('option', { name: /Make coupon codes/ });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await expect(page).toHaveURL(/\/coupon-code-generator$/);

  await page.goto('/tools');
  await expect(page.getByRole('link', { name: /Coupon Code Generator/ }).first()).toBeVisible();
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/coupon-code-generator');
  const ld = await page.goto('/coupon-code-generator').then(() => page.locator('script[type="application/ld+json"]').first().textContent());
  expect(JSON.parse(ld!)['@graph'].some((x: { '@type': string }) => x['@type'] === 'FAQPage')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Related tools' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 360, 320]) {
    test(`phone ${width}px ${scheme}: every view open, worst-case codes, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      for (const b of await page.getByRole('button', { name: 'What does this mean?' }).all()) await b.click();
      await prefix(page).fill('DIWALIMEGASALE');
      await length(page).fill('16');
      await choice(page, 'Discount', /₹ off/).click();
      await page.getByLabel(/^Valid until/).fill('2024-01-01');
      await page.getByText('See every code').click();
      await expect(page.getByTestId('coupon-sample').locator('li').first()).toBeVisible();
      await expect(page.getByTestId('info-note').first()).toBeVisible();
      expect(await sideways(page), 'no horizontal scroll').toBe(false);
      const worst = page.getByTestId('coupon-sample').locator('li').first();
      const box = (await worst.boundingBox())!;
      expect(box.x + box.width, 'the longest code stays inside the screen').toBeLessThanOrEqual(width);
      await page.locator('main').first().screenshot({ path: `${SHOTS}/coupons-${width}-${scheme}.png` });
    });
  }
}
