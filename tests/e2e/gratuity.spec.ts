import { expect, test, type Page } from '@playwright/test';

/**
 * Gratuity Calculator (/gratuity-calculator): live result, the eligibility switch-over, the six-month
 * rounding, the maximum, refusals, copy, and that nothing is sent. The rules themselves are checked
 * in test/gratuity.test.mts; what no test can show is whether the law is read correctly.
 */
const SHOTS = 'test-results/screenshots';

async function enter(page: Page, v: { joined?: string; last?: string; wages?: string }) {
  if (v.joined !== undefined) await page.getByLabel('Joining date').fill(v.joined);
  if (v.last !== undefined) await page.getByLabel('Last working day').fill(v.last);
  if (v.wages !== undefined) await page.getByLabel('Last drawn wages per month').fill(v.wages);
}
const pick = (page: Page, name: string) => page.locator('label').filter({ has: page.getByRole('radio', { name }) }).click();
/** Opens the page and waits for React to take over, so typing right away isn't lost to hydration. */
async function open(page: Page) {
  await page.goto('/gratuity-calculator');
  await page.waitForLoadState('networkidle');
}
const result = (page: Page) => page.getByTestId('gratuity-result');

test('the page opens clean: a placeholder, the rules box, no errors on a fresh form', async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle(/Gratuity calculator/);
  await expect(page.getByRole('heading', { level: 1, name: 'Gratuity calculator' })).toBeVisible();
  await expect(page.getByTestId('gratuity-empty')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Rules this uses \(checked 27 October 2026\)/ })).toBeVisible();
  await expect(page.locator('#gr-joined-err, #gr-last-err, #gr-wages-err')).toHaveCount(0);
  await expect(result(page)).toHaveCount(0);
});

test('the worked example: ₹50,000 and 10 years is ₹2,88,462, with the working shown', async ({ page }) => {
  await open(page);
  await enter(page, { joined: '2016-01-01', last: '2025-12-31', wages: '50,000' });
  await expect(result(page)).toContainText('₹2,88,462');
  await expect(result(page)).toContainText('10 years');
  await expect(result(page)).toContainText('₹50,000 × 15 × 10 ÷ 26');
  await expect(page.getByTestId('gratuity-empty')).toHaveCount(0);
});

test('a part-year over six months rounds up, and says so; exactly six months does not', async ({ page }) => {
  await open(page);
  await enter(page, { joined: '2018-03-15', last: '2026-10-27', wages: '50,000' });
  await expect(result(page)).toContainText('8 years, 7 months, 13 days');
  await expect(result(page)).toContainText('more than 6 months of the last year counts as a full year');
  await expect(result(page)).toContainText('₹50,000 × 15 × 9 ÷ 26');
  await enter(page, { joined: '2020-01-01', last: '2026-06-30' });
  await expect(result(page)).toContainText('₹50,000 × 15 × 6 ÷ 26');
  await expect(result(page)).not.toContainText('more than 6 months of the last year');
});

test('not eligible yet: why, and the date; the 4-years-8-months note; fixed-term and death/disability change it', async ({ page }) => {
  await open(page);
  await enter(page, { joined: '2022-01-01', last: '2026-10-27', wages: '50,000' });
  const not = page.getByTestId('gratuity-not-yet');
  await expect(not).toContainText('Not eligible yet');
  await expect(not).toContainText('4 years, 9 months, 27 days');
  await expect(not).toContainText('A permanent job needs 5 years');
  await expect(not).toContainText('31 Dec 2026');
  await expect(result(page)).toHaveCount(0);
  await expect(not).toContainText('Some employers pay from 4 years and 8 months');

  await enter(page, { last: '2025-12-31' });
  await expect(not).toContainText('You have 4 years of service');
  await expect(not).not.toContainText('Some employers pay');
  await enter(page, { last: '2026-09-30' });

  await pick(page, 'Fixed-term contract');
  await expect(result(page)).toBeVisible();
  await expect(page.getByTestId('gratuity-not-yet')).toHaveCount(0);
  await pick(page, 'Permanent');
  await expect(page.getByTestId('gratuity-not-yet')).toBeVisible();
  await pick(page, 'Death or disability');
  await expect(result(page)).toBeVisible();
  await expect(page.getByText('On death or disability there is no minimum service.')).toBeVisible();
});

test('a fixed-term contract needs 1 year, to the day', async ({ page }) => {
  await open(page);
  await pick(page, 'Fixed-term contract');
  await enter(page, { joined: '2025-10-28', last: '2026-10-27', wages: '30,000' });
  await expect(result(page)).toContainText('1 year');
  await enter(page, { joined: '2025-10-29' });
  await expect(page.getByTestId('gratuity-not-yet')).toContainText('A fixed-term contract needs 1 year');
  await expect(page.getByTestId('gratuity-not-yet')).toContainText('28 Oct 2026');
});

test('the ₹20 lakh maximum: just under is shown as is, just over is limited and says so', async ({ page }) => {
  await open(page);
  await enter(page, { joined: '2000-01-01', last: '2025-12-31', wages: '1,33,333' });
  await expect(result(page)).toContainText('₹19,99,995');
  await expect(page.getByText(/the Act’s maximum is/)).toHaveCount(0);
  await enter(page, { wages: '1,33,334' });
  await expect(result(page)).toContainText('₹20,00,000');
  await expect(page.getByText('The formula gives ₹20,00,010, but the Act’s maximum is ₹20,00,000.')).toBeVisible();
});

test('death or disability within six months of joining: ₹0, said plainly', async ({ page }) => {
  await open(page);
  await pick(page, 'Death or disability');
  await enter(page, { joined: '2026-08-01', last: '2026-10-27', wages: '50,000' });
  await expect(result(page)).toContainText('₹0');
  await expect(page.getByText('Less than six months of service doesn’t count as a completed year')).toBeVisible();
});

test('mistakes are refused calmly, only once something is typed, and clearing them brings the result back', async ({ page }) => {
  await open(page);
  await enter(page, { joined: '2026-11-01', last: '2026-10-27', wages: '1,5' });
  await expect(page.locator('#gr-last-err')).toContainText('can’t be before the joining date');
  await expect(page.locator('#gr-wages-err')).toContainText('Check the commas');
  await enter(page, { wages: '-500' });
  await expect(page.locator('#gr-wages-err')).toContainText('Negative');
  await enter(page, { wages: '500.555' });
  await expect(page.locator('#gr-wages-err')).toContainText('2 decimal places');
  await expect(page.getByTestId('gratuity-empty')).toBeVisible();
  await enter(page, { joined: '2016-01-01', last: '2025-12-31', wages: '50,000' });
  await expect(page.locator('#gr-last-err, #gr-wages-err')).toHaveCount(0);
  await expect(result(page)).toContainText('₹2,88,462');
});

test('Copy puts the result and its working on the clipboard; nothing is sent anywhere', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  await open(page);
  await enter(page, { joined: '2016-01-01', last: '2025-12-31', wages: '50,000' });
  await page.getByRole('button', { name: /^Copy/ }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Gratuity: ₹2,88,462.');
  expect(text).toContain('₹50,000 × 15 × 10 ÷ 26');
  expect(text).toContain('not legal or tax advice');
  expect(sent).toEqual([]);
});

test('it is a live tool: in the sitemap, on the tools page, and the old placeholder address is not a page', async ({ page, request }) => {
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/gratuity-calculator');
  await page.goto('/tools');
  await expect(page.getByRole('link', { name: /Gratuity Calculator/ }).first()).toHaveAttribute('href', '/gratuity-calculator');
  expect((await request.get('/calculators/gratuity-calculator')).status()).toBe(404);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}: empty, result and not-yet; no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      const main = page.locator('main').first();
      await main.screenshot({ path: `${SHOTS}/gratuity-${name}-${scheme}-empty.png` });
      await enter(page, { joined: '2018-03-15', last: '2026-10-27', wages: '50,000' });
      await expect(result(page)).toBeVisible();
      await main.screenshot({ path: `${SHOTS}/gratuity-${name}-${scheme}-result.png` });
      await enter(page, { joined: '2022-01-01', last: '2026-09-30' });
      await expect(page.getByTestId('gratuity-not-yet')).toBeVisible();
      await main.screenshot({ path: `${SHOTS}/gratuity-${name}-${scheme}-not-yet.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no horizontal scroll').toBe(false);
    });
  }
}
