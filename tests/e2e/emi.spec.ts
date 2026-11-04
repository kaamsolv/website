import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/** EMI calculator: sliders and defaults, prepayment (extra and lump sum), how much can I borrow, share links, SEO, phone widths. */

const SHOTS = 'test-results/screenshots';
const SITE = 'https://kaamsolv.com';

async function open(page: Page, path = '/emi-calculator') {
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}
const tool = (page: Page) => page.locator('section[aria-labelledby="tool-title"]');
const choice = (page: Page, text: RegExp) => page.locator('label').filter({ hasText: text });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const openPrepay = async (page: Page) => {
  await page.getByTestId('prepay-section').locator('summary').click();
};

test('opens filled in with the worked example; nothing is sent', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  await open(page);
  await expect(page.getByTestId('calc-error')).toHaveCount(0);
  await expect(tool(page).getByText('₹44,986.30').first()).toBeVisible();
  await expect(page.getByTestId('prepay-result')).toHaveCount(0);
  await expect(page.getByTestId('prepay-section')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: /Repayment schedule/ })).toBeVisible();
  expect(sent).toEqual([]);
});

test('typing a different loan updates the answer; a silly rate is refused calmly', async ({ page }) => {
  await open(page);
  await page.locator('#emi-amount').fill('10,00,000');
  await page.locator('#emi-rate').fill('8.5');
  await page.locator('#emi-years').fill('20');
  await expect(tool(page).getByText('₹8,678.23').first()).toBeVisible();
  await page.locator('#emi-rate').fill('99');
  await expect(page.getByTestId('calc-error')).toBeVisible();
  await page.locator('#emi-rate').fill('8.5');
  await expect(page.getByTestId('calc-error')).toHaveCount(0);
});

test('extra every month: finishes in 12 years 10 months and saves ₹23,65,7xx', async ({ page }) => {
  await open(page);
  await openPrepay(page);
  await page.locator('#emi-extra').fill('10,000');
  const card = page.getByTestId('outcome-shorter');
  await expect(card).toContainText('12 years 10 months');
  await expect(card).toContainText('₹23,65,74');
  await expect(page.getByTestId('outcome-lower')).toHaveCount(0);
  await expect(page.getByTestId('compare-chart')).toBeVisible();
});

test('lump sum after month 24: both outcomes, side by side', async ({ page }) => {
  await open(page);
  await openPrepay(page);
  await page.locator('#emi-lump').fill('10,00,000');
  await expect(page.locator('#emi-lump-month')).toHaveValue('24');
  await expect(page.getByTestId('outcome-shorter')).toContainText('13 years 3 months');
  await expect(page.getByTestId('outcome-shorter')).toContainText('₹26,62,49');
  await expect(page.getByTestId('outcome-lower')).toContainText('₹35,621.85');
  await expect(page.getByTestId('outcome-lower')).toContainText('20 years');
  await page.locator('#emi-lump-month').fill('0');
  await expect(page.getByTestId('calc-error')).toBeVisible();
});

test('How much can I borrow: ₹50,000 EMI at 9% for 20 years supports ₹55,57,247', async ({ page }) => {
  await open(page);
  await choice(page, /^How much can I borrow\?$/).click();
  await page.locator('#emi-budget').fill('50,000');
  await expect(tool(page).getByText('₹55,57,247.00').first()).toBeVisible();
  await expect(page.getByTestId('prepay-section')).toHaveCount(0);
});

test('what-if lines and share: the link carries loan figures only and reopens the calculator filled in', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  await open(page);
  const before = await page.locator('#emi-rate').inputValue();
  await page.getByTestId('nudges').getByRole('button', { name: 'Try it' }).nth(1).click();
  expect(await page.locator('#emi-rate').inputValue()).not.toBe(before);
  await page.getByTestId('share-copy-result').click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/^https:\/\/kaamsolv\.com\/emi-calculator\?a=5000000&r=8\.5&y=20/);
  expect(link).not.toMatch(/name|email|phone/i);
  await open(page, '/emi-calculator?a=4000000&r=8&y=15&x=5000');
  await expect(page.locator('#emi-amount')).toHaveValue('40,00,000');
  await expect(page.locator('#emi-rate')).toHaveValue('8');
  await expect(page.locator('#emi-years')).toHaveValue('15');
  await expect(page.locator('#emi-extra')).toHaveValue('5,000');
  await expect(page.getByTestId('prepay-result')).toBeVisible();
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/emi-calculator`);
  await open(page, '/emi-calculator?a=-5&r=999&y=1.5&p=abc');
  await expect(page.locator('#emi-amount')).toHaveValue('50,00,000');
  await expect(page.getByTestId('calc-error')).toHaveCount(0);
});

test('print button calls print', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as { __printed: number };
    w.__printed = 0;
    window.print = () => {
      w.__printed += 1;
    };
  });
  await page.getByTestId('print-result').click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});

test('SEO tags, FAQ structured data and sitemap', async ({ page }) => {
  await open(page);
  await expect(page.locator('h1')).toHaveText('EMI calculator');
  const title = await page.title();
  expect(title.length, title).toBeLessThanOrEqual(70);
  const description = (await page.locator('meta[name="description"]').first().getAttribute('content')) ?? '';
  expect(description.length, description).toBeGreaterThan(80);
  expect(description.length, description).toBeLessThanOrEqual(160);
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = blocks.flatMap((b) => (JSON.parse(b) as { '@graph': { '@type': string }[] })['@graph']);
  const faq = graph.find((g) => g['@type'] === 'FAQPage') as unknown as { mainEntity: { name: string }[] };
  expect(faq.mainEntity.length).toBeGreaterThanOrEqual(6);
  for (const q of faq.mainEntity) await expect(page.locator('summary', { hasText: q.name }).first()).toBeAttached();
  expect(await page.request.get('/sitemap.xml').then((r) => r.text())).toContain(`${SITE}/emi-calculator`);
});

test('every input explains itself with an "i"', async ({ page }) => {
  await open(page);
  await openPrepay(page);
  await page.locator('#emi-lump').fill('5,00,000');
  const infos = tool(page).getByRole('button', { name: 'What does this mean?' });
  expect(await infos.count()).toBeGreaterThanOrEqual(7);
  await infos.nth(0).click();
  await expect(page.getByTestId('info-note').first()).toContainText('principal');
});

for (const width of [360, 320]) {
  test(`no sideways scroll at ${width}px with the prepayment, month table and every note open`, async ({ page }) => {
    await mkdir(SHOTS, { recursive: true });
    await page.setViewportSize({ width, height: 780 });
    await open(page);
    expect(await sideways(page), 'default').toBe(false);
    await openPrepay(page);
    await page.locator('#emi-extra').fill('10,000');
    await page.locator('#emi-lump').fill('10,00,000');
    await page.getByTestId('compare-chart').locator('label').filter({ hasText: /^Table$/ }).click();
    await choice(page, /^By month$/).click();
    const infos = tool(page).getByRole('button', { name: 'What does this mean?' });
    const n = await infos.count();
    for (let i = 0; i < n; i++) await infos.nth(i).click({ timeout: 4000 });
    expect(await sideways(page), 'everything open').toBe(false);
    await tool(page).screenshot({ path: `${SHOTS}/emi-${width}-open.png` });
  });
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}`, async ({ page }) => {
      await mkdir(SHOTS, { recursive: true });
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await openPrepay(page);
      await page.locator('#emi-lump').fill('10,00,000');
      await tool(page).screenshot({ path: `${SHOTS}/emi-${name}-${scheme}.png` });
      expect(await sideways(page)).toBe(false);
    });
  }
}
