import { expect, test, type Page } from '@playwright/test';

/**
 * Salary calculator (/salary-calculator). Expected figures come from the
 * unit-tested logic (test/calc-salary.test.mts), FY 2026-27 rules.
 */
const SHOTS = 'test-results/screenshots';

const answer = (page: Page) => page.locator('[aria-live="polite"]').filter({ hasText: 'In-hand a month' });

test('₹12 lakh CTC: in-hand updates as you type, regimes compare, options change PF', async ({ page }) => {
  await page.goto('/salary-calculator');
  await expect(page.getByRole('heading', { level: 1, name: 'Salary calculator' })).toBeVisible();

  await page.getByLabel('Your CTC (a year)').fill('12,00,000');
  // No Calculate button: the answer is there straight away.
  await expect(answer(page)).toContainText('₹91,396');
  await expect(page.getByText('New regime leaves you ₹1,42,819 more a year.')).toBeVisible();
  await expect(page.getByRole('table')).toContainText('₹28,846'); // gratuity

  await page.getByText('Old regime (under 60)').click();
  await expect(answer(page)).toContainText('₹79,495');
  await expect(page.getByLabel('Deductions you claim (a year)')).toBeVisible();

  await page.getByText('New regime', { exact: true }).click();
  await page.getByLabel('More options').check();
  await page.getByText('Full basic', { exact: true }).click();
  await expect(answer(page)).toContainText('₹85,396');
});

test('old regime wins with big deductions; the comparison line says so', async ({ page }) => {
  await page.goto('/salary-calculator');
  await page.getByLabel('Your CTC (a year)').fill('2500000');
  await page.getByText('Old regime (under 60)').click();
  await page.getByLabel('Deductions you claim (a year)').fill('8,00,000');
  await expect(page.getByText('Old regime leaves you ₹4,446 more a year.')).toBeVisible();
});

test('bad input shows a calm message, not a result', async ({ page }) => {
  await page.goto('/salary-calculator');
  await page.getByLabel('Your CTC (a year)').fill('20,00,00,000');
  await expect(page.getByRole('alert').filter({ hasText: 'Check the numbers' })).toBeVisible();
  await expect(answer(page)).toContainText('—');

  await page.getByLabel('Your CTC (a year)').fill('abc');
  await expect(page.getByText('Enter a number, like 2500 or 12.5.')).toBeVisible();
});

for (const { name, width, scheme } of [
  { name: 'desktop-light', width: 1280, scheme: 'light' as const },
  { name: 'desktop-dark', width: 1280, scheme: 'dark' as const },
  { name: 'mobile-light', width: 375, scheme: 'light' as const },
  { name: 'mobile-dark', width: 375, scheme: 'dark' as const },
]) {
  test(`screenshot: ${name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/salary-calculator');
    await page.getByLabel('Your CTC (a year)').fill('15,00,000');
    await page.getByLabel('Bonus / variable in it (a year)').fill('1,50,000');
    await expect(answer(page)).toContainText('₹');
    if (width < 500) {
      // §45: the answer is on the first screen of an 812 px-tall phone.
      const bottom = await answer(page).evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
      expect(bottom).toBeLessThanOrEqual(812);
      await page.setViewportSize({ width, height: 812 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${SHOTS}/salary-${name}-first-screen.png` });
    }
    await page.getByLabel('More options').check();
    // The breakdown fits without sideways scrolling, even on a phone.
    const overflow = await page.getByRole('table').evaluate((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.locator('main').screenshot({ path: `${SHOTS}/salary-${name}.png` });
  });
}
