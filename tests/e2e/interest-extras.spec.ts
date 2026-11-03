import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/** Value-add pack: goal mode, today's money, tax estimate, what-if nudges, share links, print, and the compare page. */

const SHOTS = 'test-results/screenshots';
const SITE = 'https://kaamsolv.com';

async function open(page: Page, slug: string) {
  await page.goto(`/${slug}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}
const tool = (page: Page) => page.locator('section[aria-labelledby="tool-title"]');
const choice = (page: Page, text: RegExp) => page.locator('label').filter({ hasText: text });

test('SIP: Reach a goal works backwards, and the today-money line appears', async ({ page }) => {
  await open(page, 'sip-calculator');
  await choice(page, /^Reach a goal$/).click();
  await page.locator('#sip-goal').fill('1,00,00,000');
  await page.locator('#sip-years').fill('15');
  await page.locator('#sip-rate').fill('12');
  await expect(tool(page).getByText('₹19,819.00').first()).toBeVisible();
  await expect(page.getByTestId('short-amount')).toContainText('₹1 crore');
  await page.getByLabel(/in today.s money/i).check();
  await expect(page.getByTestId('today-money')).toContainText('in today');
  await expect(page.getByTestId('growth-chart')).toBeVisible();
});

test('FD: tax estimate and nudges; RD goal mode', async ({ page }) => {
  await open(page, 'fd-calculator');
  await choice(page, /^30%$/).click();
  await expect(tool(page).getByText('Tax at 30% (estimate)')).toBeVisible();
  await expect(tool(page).getByText('You keep after tax')).toBeVisible();
  const before = await page.locator('#fd-years').inputValue();
  await page.getByTestId('nudges').getByRole('button', { name: 'Try it' }).first().click();
  expect(await page.locator('#fd-years').inputValue()).not.toBe(before);
  await open(page, 'rd-calculator');
  await choice(page, /^Reach a goal$/).click();
  await page.locator('#rd-goal').fill('5,00,000');
  await expect(page.getByTestId('calc-error')).toHaveCount(0);
  await expect(tool(page).getByText('Deposit every month').locator('visible=true').first()).toBeVisible();
});

test('a shared link opens the calculator filled in; hostile values are ignored; meta never changes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  await open(page, 'sip-calculator');
  await page.locator('#sip-amount').fill('7,500');
  const href = (await page.getByTestId('share-whatsapp-result').getAttribute('href')) ?? '';
  const msg = decodeURIComponent(href.split('?text=')[1]);
  expect(msg).toContain('₹7,500.00 a month');
  expect(msg).toContain('https://kaamsolv.com/sip-calculator?a=7500');
  await page.getByTestId('share-copy-result').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^https:\/\/kaamsolv\.com\/sip-calculator\?a=7500&r=12&y=10/);

  await page.goto('/sip-calculator?a=7500&r=14&y=12&s=10');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await expect(page.locator('#sip-amount')).toHaveValue('7,500');
  await expect(page.locator('#sip-rate')).toHaveValue('14');
  await expect(page.locator('#sip-years')).toHaveValue('12');
  await expect(page.locator('#sip-step')).toHaveValue('10');
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/sip-calculator`);

  await page.goto('/sip-calculator?a=-5&r=999&y=1.5&t=%3Cscript%3E');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await expect(page.locator('#sip-amount')).toHaveValue('5,000');
  await expect(page.getByTestId('calc-error')).toHaveCount(0);
});

test('Print button calls print; print view hides the chrome and shows the summary', async ({ page }) => {
  await open(page, 'sip-calculator');
  await page.evaluate(() => {
    const w = window as unknown as { __printed: number };
    w.__printed = 0;
    window.print = () => {
      w.__printed += 1;
    };
  });
  await page.getByTestId('print-result').click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('print-summary')).toBeVisible();
  await expect(page.getByTestId('share-tool')).toBeHidden();
  await expect(page.getByTestId('result-actions')).toBeHidden();
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/interest-print.png`, fullPage: true });
});

test('SIP vs FD vs RD: both modes, verdict, chart, table, share, SEO', async ({ page }) => {
  await open(page, 'sip-vs-fd-vs-rd-calculator');
  await expect(page.locator('h1')).toHaveText('SIP vs FD vs RD');
  await expect(tool(page).getByText('₹23,23,390.76').first()).toBeVisible();
  await expect(tool(page).getByText('₹16,89,879.52').first()).toBeVisible();
  await expect(page.getByTestId('verdict')).toContainText('not a promise');
  await page.getByTestId('compare-chart').locator('label').filter({ hasText: /^Table$/ }).click();
  await expect(page.getByTestId('year-table').getByRole('row')).toHaveCount(11);
  await choice(page, /^One lump sum$/).click();
  await page.locator('#cmp-amount').fill('1,00,000');
  await expect(tool(page).getByText('₹2,00,159.73').first()).toBeVisible();
  await expect(tool(page).getByText('₹3,10,584.82').first()).toBeVisible();
  await page.locator('#cmp-rate-a').fill('99');
  await expect(page.getByTestId('calc-error')).toBeVisible();
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/sip-vs-fd-vs-rd-calculator`);
  expect(await page.request.get('/sitemap.xml').then((r) => r.text())).toContain(`${SITE}/sip-vs-fd-vs-rd-calculator`);
  await page.goto('/sip-vs-fd-vs-rd-calculator?a=100000&y=10&r=12&t=7&f=1');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await expect(tool(page).getByText('₹3,10,584.82').first()).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}: extras on SIP, FD, compare; no sideways scroll`, async ({ page }) => {
      await mkdir(SHOTS, { recursive: true });
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, 'sip-calculator');
      await page.getByLabel(/in today.s money/i).check();
      await tool(page).screenshot({ path: `${SHOTS}/extras-sip-${name}-${scheme}.png` });
      await open(page, 'fd-calculator');
      await choice(page, /^20%$/).click();
      await tool(page).screenshot({ path: `${SHOTS}/extras-fd-${name}-${scheme}.png` });
      await open(page, 'sip-vs-fd-vs-rd-calculator');
      await tool(page).screenshot({ path: `${SHOTS}/extras-compare-${name}-${scheme}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no horizontal scroll').toBe(false);
    });
  }
}
