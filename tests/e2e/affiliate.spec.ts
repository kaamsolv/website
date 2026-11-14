import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Affiliate Manager, Phase 1, end to end: an owner makes a branded portal, the public page shows it, a second owner
 * can't see or take it, and the page holds at phone widths in both themes. Rules and isolation against real
 * Postgres are in test/affiliate-merchant.test.mts and test/affiliate-isolation.test.mts.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const email = (t: string) => `${t}-${tag}@example.test`;

async function person(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
  return page;
}

test('owner creates a branded portal; the public page shows it', async ({ browser }) => {
  await mkdir(SHOTS, { recursive: true });
  const slug = `wt-${tag}`;
  const page = await person(browser, email('owner'));
  await page.goto('/app/affiliate/portal');
  await expect(page.getByRole('heading', { name: 'Portal settings', level: 1 })).toBeVisible();

  await page.getByLabel('Business name').fill('Wandernest Tales');
  await page.getByLabel('Portal address').fill(slug);
  await page.getByLabel('Programme name').fill('Wandernest Partners');
  await page.getByLabel(/What affiliates should know/).fill('Earn when your readers book.');
  await page.getByLabel(/Terms and conditions/).fill('Payouts are monthly.');
  await page.locator('#m-colour').fill('#38BBAC');
  await page.getByRole('button', { name: 'Create my portal' }).click();
  await expect(page.getByText(/Your portal is live at/)).toBeVisible();
  await expect(page.getByTestId('portal-address')).toHaveText(`kaamsolv.com/affiliate/${slug}`);

  const visitor = await browser.newContext({ baseURL: BASE }).then((c) => c.newPage());
  await visitor.goto(`/affiliate/${slug}`);
  await expect(visitor.getByRole('heading', { name: 'Wandernest Partners', level: 1 })).toBeVisible();
  await expect(visitor.getByText('Earn when your readers book.')).toBeVisible();
  await expect(visitor.getByText('Payouts are monthly.')).toBeVisible();
  await expect(visitor.getByText('Applications are closed right now')).toBeVisible();
  await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(await visitor.content()).not.toContain('example.test');

  // The address can't change; an edit keeps it.
  await page.reload();
  // A dev server that is still compiling other routes can reload the page under the test and wipe what was typed, so
  // the edit, the save and the check on the public page are one step that is retried as a whole.
  await expect(async () => {
    const input = page.getByLabel('Programme name');
    await input.fill('Wandernest Partners 2');
    await expect(input).toHaveValue('Wandernest Partners 2');
    const saved = page.waitForResponse((r) => r.url().includes('/api/affiliate/merchant') && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(page.getByText(/Your portal is live at/)).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole('heading', { name: 'Wandernest Partners 2', level: 1 })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });
});

test('a second owner sees nothing of the first, and cannot take the address', async ({ browser }) => {
  const slug = `iso-${tag}`;
  const a = await person(browser, email('iso-a'));
  const made = await a.request.put('/api/affiliate/merchant', { headers: { origin: BASE }, data: { name: 'Owner A', slug, terms: 'secret-a' } });
  expect(made.status(), await made.text()).toBe(200);

  const b = await person(browser, email('iso-b'));
  const mine = await (await b.request.get('/api/affiliate/merchant')).json();
  expect(mine.merchant).toBeNull();
  const clash = await b.request.put('/api/affiliate/merchant', { headers: { origin: BASE }, data: { name: 'Owner B', slug } });
  expect(clash.status()).toBe(409);
  const reserved = await b.request.put('/api/affiliate/merchant', { headers: { origin: BASE }, data: { name: 'Owner B', slug: 'register' } });
  expect(reserved.status()).toBe(400);
  const crossSite = await b.request.put('/api/affiliate/merchant', { headers: { origin: 'https://evil.example' }, data: { name: 'Owner B', slug: `b-${tag}` } });
  expect(crossSite.status()).toBe(403);

  // B creates their own, then tries to rename onto A's slug: refused, A untouched.
  const own = await b.request.put('/api/affiliate/merchant', { headers: { origin: BASE }, data: { name: 'Owner B', slug: `b-${tag}` } });
  expect(own.status()).toBe(200);
  const move = await b.request.put('/api/affiliate/merchant', { headers: { origin: BASE }, data: { name: 'Owner B', slug } });
  expect(move.status()).toBe(400);
  const still = await (await a.request.get('/api/affiliate/merchant')).json();
  expect(still.merchant.name).toBe('Owner A');

  const signedOut = await (await browser.newContext({ baseURL: BASE })).request.get('/api/affiliate/merchant');
  expect(signedOut.status()).toBe(401);
});

test('unknown portal address is a plain 404', async ({ page }) => {
  const res = await page.goto('/affiliate/no-such-merchant-here');
  expect(res?.status()).toBe(404);
});

for (const width of [375, 360, 320]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`portal and editor hold at ${width}px, ${scheme}`, async ({ browser }) => {
      const slug = `w${width}${scheme[0]}-${tag}`;
      const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height: 780 }, colorScheme: scheme });
      const page = await ctx.newPage();
      const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: email(`w${width}${scheme}`), name: 'Pat' } });
      expect(res.status()).toBe(200);
      const long = 'A very long unbroken word '.concat('x'.repeat(120));
      const made = await page.request.put('/api/affiliate/merchant', {
        headers: { origin: BASE },
        data: { name: 'Sharma & Sons Travel Company', slug, programmeName: 'x'.repeat(75), programmeDescription: long, terms: `${long}\n\n${long}`, brandColour: '#FDBD43' },
      });
      expect(made.status(), await made.text()).toBe(200);

      for (const path of [`/affiliate/${slug}`, '/app/affiliate/portal', '/app/affiliate']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} sideways scroll`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${SHOTS}/affiliate-${path === '/app/affiliate' ? 'overview' : path.startsWith('/app') ? 'editor' : 'portal'}-${width}-${scheme}.png`, fullPage: true });
      }
    });
  }
}
