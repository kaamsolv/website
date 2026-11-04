import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/** Phone-width checks (a real phone is about 360px wide) and the plain-words "i" help on every input. */

const SHOTS = 'test-results/screenshots';
const PAGES = ['sip-calculator', 'fd-calculator', 'rd-calculator', 'simple-interest-calculator', 'compound-interest-calculator', 'sip-vs-fd-vs-rd-calculator'];

async function open(page: Page, slug: string) {
  await page.goto(`/${slug}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

for (const width of [360, 320]) {
  test(`no sideways scroll at ${width}px, even with the Table view open`, async ({ page }) => {
    await mkdir(SHOTS, { recursive: true });
    await page.setViewportSize({ width, height: 780 });
    for (const slug of PAGES) {
      await open(page, slug);
      expect(await sideways(page), `${slug} graph view`).toBe(false);
      const table = page.locator('label').filter({ hasText: /^Table$/ }).first();
      if (await table.count()) {
        await table.click();
        await expect(page.getByTestId('year-table')).toBeVisible();
        expect(await sideways(page), `${slug} table view`).toBe(false);
      }
    }
    await open(page, 'sip-vs-fd-vs-rd-calculator');
    await page.locator('label').filter({ hasText: /^Table$/ }).first().click();
    await page.locator('section[aria-labelledby="tool-title"]').screenshot({ path: `${SHOTS}/mobile-${width}-compare-table.png` });
  });
}

test('every slider has an "i" that opens a plain-words note, and closes again', async ({ page }) => {
  for (const slug of PAGES) {
    await open(page, slug);
    const tool = page.locator('section[aria-labelledby="tool-title"]');
    const sliders = await tool.locator('input[type="range"]').count();
    const infos = await tool.getByRole('button', { name: 'What does this mean?' }).count();
    expect(infos, `${slug}: one "i" per slider`).toBeGreaterThanOrEqual(sliders);
  }
  await open(page, 'sip-vs-fd-vs-rd-calculator');
  const first = page.getByRole('button', { name: 'What does this mean?' }).nth(2);
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await first.click();
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('info-note')).toContainText('not a promise');
  await first.click();
  await expect(page.getByTestId('info-note')).toHaveCount(0);
});

test('FD: the compounding and tax groups explain themselves', async ({ page }) => {
  await open(page, 'fd-calculator');
  const tool = page.locator('section[aria-labelledby="tool-title"]');
  const compounding = tool.getByText('Interest is added', { exact: true }).locator('xpath=..').getByRole('button', { name: 'What does this mean?' });
  await compounding.click();
  await expect(page.getByTestId('info-note')).toContainText('How often the bank adds interest');
});
