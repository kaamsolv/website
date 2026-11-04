import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/** HRA calculator: the three limits, the 8-city list by financial year, monthly/yearly, the regime check, print, SEO, phone widths. */

const SHOTS = 'test-results/screenshots';
const SITE = 'https://kaamsolv.com';

async function open(page: Page) {
  await page.goto('/hra-calculator');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}
const tool = (page: Page) => page.locator('section[aria-labelledby="tool-title"]');
const choice = (page: Page, text: RegExp) => page.locator('label').filter({ hasText: text });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test('opens with a worked example, and rent is the limit', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  await open(page);
  await expect(page.getByTestId('calc-error')).toHaveCount(0);
  await expect(tool(page).getByText('₹17,000.00').first()).toBeVisible();
  await expect(page.getByTestId('limit-rent')).toHaveAttribute('data-limiting', 'true');
  await expect(page.getByTestId('limit-received')).toHaveAttribute('data-limiting', 'false');
  await expect(page.getByTestId('hra-reason')).toContainText('Your rent is what limits you');
  expect(sent).toEqual([]);
});

test('the eight cities, and the year changes the cap (Bengaluru)', async ({ page }) => {
  await open(page);
  for (const c of ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad', 'Anywhere else']) {
    await expect(choice(page, new RegExp(`^${c}$`))).toHaveCount(1);
  }
  await page.locator('#hra-basic').fill('1,00,000');
  await page.locator('#hra-received').fill('60,000');
  await page.locator('#hra-rent').fill('80,000');
  await choice(page, /^Bengaluru$/).click();
  await expect(page.getByTestId('limit-cap')).toContainText('₹50,000.00');
  await expect(page.getByTestId('hra-reason')).toContainText('city cap');
  await choice(page, /^FY 2025-26$/).click();
  await expect(page.getByTestId('limit-cap')).toContainText('₹40,000.00');
  await choice(page, /^Delhi$/).click();
  await expect(page.getByTestId('limit-cap')).toContainText('₹50,000.00');
});

test('yearly: the values convert and the textbook example gives ₹1,20,000', async ({ page }) => {
  await open(page);
  await choice(page, /^Yearly$/).click();
  await expect(page.locator('#hra-basic')).toHaveValue('6,00,000');
  await page.locator('#hra-received').fill('2,40,000');
  await page.locator('#hra-rent').fill('1,80,000');
  await expect(tool(page).getByText('₹1,20,000.00').first()).toBeVisible();
  await choice(page, /^Monthly$/).click();
  await expect(page.locator('#hra-basic')).toHaveValue('50,000');
  await expect(tool(page).getByText('₹10,000.00').first()).toBeVisible();
});

test('no rent means no exemption; bad input is refused calmly and the answer goes away', async ({ page }) => {
  await open(page);
  await page.locator('#hra-rent').fill('0');
  await expect(page.getByTestId('hra-reason')).toContainText('No rent paid, no exemption');
  await page.locator('#hra-basic').fill('0');
  await expect(page.getByTestId('calc-error')).toBeVisible();
  await expect(page.getByTestId('hra-limits')).toHaveCount(0);
  await page.locator('#hra-basic').fill('50,000');
  await expect(page.getByTestId('calc-error')).toHaveCount(0);
});

test('rent-for-the-full-exemption note shows the what-if, and the new regime has no HRA note', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('rent-max')).toContainText('₹25,000.00');
  await expect(page.getByTestId('rent-max')).toContainText('claim the rent you really pay');
  await expect(tool(page).getByText(/your full HRA is taxable there/)).toBeVisible();
  await page.locator('#hra-rent').fill('30,000');
  await expect(page.getByTestId('rent-max')).toHaveCount(0);
});

test('regime check: new regime wins at the default pay; big deductions flip it; FY 2025-26 asks to switch', async ({ page }) => {
  await open(page);
  await page.getByTestId('regime-compare').locator('summary').click();
  await expect(page.getByTestId('regime-verdict')).toContainText('new regime leaves you ₹30,888.00 more a year');
  await page.locator('#hra-other-pay').fill('20,00,000');
  await page.locator('#hra-deductions').fill('5,00,000');
  await expect(page.getByTestId('regime-verdict')).toContainText('regime leaves you');
  await choice(page, /^FY 2025-26$/).click();
  await expect(page.getByTestId('regime-compare')).toContainText('switch the financial year to FY 2026-27');
});

test('Copy, print and share: nothing personal in any link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  await open(page);
  await page.getByRole('button', { name: /^Copy(?! link)/ }).first().click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Tax-free HRA ₹17,000.00 a month');
  expect(text).toContain('not tax advice');
  const wa = (await page.getByTestId('share-whatsapp-tool').getAttribute('href')) ?? '';
  expect(decodeURIComponent(wa)).not.toMatch(/17,?000|50,?000|22,?000|\?a=/);
  await page.getByTestId('share-copy-tool').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${SITE}/hra-calculator`);
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
  await expect(page.getByTestId('result-actions')).toBeHidden();
});

test('SEO tags, structured data and sitemap', async ({ page }) => {
  await open(page);
  await expect(page.locator('h1')).toHaveText('HRA calculator');
  const title = await page.title();
  expect(title.length, title).toBeLessThanOrEqual(70);
  expect(title).toContain('KaamSolv');
  const meta = (sel: string) => page.locator(sel).first().getAttribute('content');
  const description = (await meta('meta[name="description"]')) ?? '';
  expect(description.length, description).toBeGreaterThan(80);
  expect(description.length, description).toBeLessThanOrEqual(160);
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/hra-calculator`);
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = blocks.flatMap((b) => (JSON.parse(b) as { '@graph': { '@type': string }[] })['@graph']);
  const types = graph.map((g) => g['@type']);
  for (const t of ['WebApplication', 'BreadcrumbList', 'FAQPage', 'Organization']) expect(types, t).toContain(t);
  const faq = graph.find((g) => g['@type'] === 'FAQPage') as unknown as { mainEntity: { name: string }[] };
  for (const q of faq.mainEntity) await expect(page.locator('summary', { hasText: q.name }).first()).toBeAttached();
  expect(await page.request.get('/sitemap.xml').then((r) => r.text())).toContain(`${SITE}/hra-calculator`);
  const tools = await page.request.get('/tools').then((r) => r.text());
  expect(tools).toContain('HRA Calculator');
});

test('every input explains itself with an "i"', async ({ page }) => {
  await open(page);
  const infos = tool(page).getByRole('button', { name: 'What does this mean?' });
  expect(await infos.count()).toBeGreaterThanOrEqual(6);
  await infos.nth(0).click();
  await expect(page.getByTestId('info-note').first()).toContainText('Basic pay');
});

for (const width of [360, 320]) {
  test(`no sideways scroll at ${width}px with every view open`, async ({ page }) => {
    await mkdir(SHOTS, { recursive: true });
    await page.setViewportSize({ width, height: 780 });
    await open(page);
    expect(await sideways(page), 'default').toBe(false);
    await page.getByTestId('regime-compare').locator('summary').click();
    await choice(page, /^Yearly$/).click();
    const infos = tool(page).getByRole('button', { name: 'What does this mean?' });
    const n = await infos.count();
    for (let i = 0; i < n; i++) {
      try {
        await infos.nth(i).click({ timeout: 4000 });
      } catch (e) {
        throw new Error(`info ${i} of ${n} could not be clicked: ${String(e).slice(0, 1500)}`);
      }
    }
    expect(await sideways(page), 'regime, yearly and every note open').toBe(false);
    await tool(page).screenshot({ path: `${SHOTS}/hra-${width}-open.png` });
  });
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}`, async ({ page }) => {
      await mkdir(SHOTS, { recursive: true });
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await page.getByTestId('regime-compare').locator('summary').click();
      await tool(page).screenshot({ path: `${SHOTS}/hra-${name}-${scheme}.png` });
      expect(await sideways(page)).toBe(false);
    });
  }
}
