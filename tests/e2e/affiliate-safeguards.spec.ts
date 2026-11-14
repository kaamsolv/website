import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * The launch safeguards, end to end: who may run a programme (the plan), names that pass for someone else, reporting a
 * portal, and what a suspended merchant looks like from both sides. Suspension itself is an operator action with no
 * web route; the throwaway e2e database starts a merchant suspended when its owner's email contains "-sus-"
 * (tests/e2e/start-server.mts). The rules and the operator functions, against real Postgres, are in
 * test/affiliate-safeguards.test.mts.
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const origin = { origin: process.env.KK_E2E_BASE ?? 'http://localhost:3000' };
const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
let ipCounter = 40;

/** `kind` picks the account: affpro- holds the Affiliate Manager plan, free- does not, affpro-sus- starts suspended. */
const addr = (kind: 'affpro' | 'free' | 'sus' | 'visitor', t: string) =>
  kind === 'affpro' ? `affpro-${t}-${tag}@example.test` : kind === 'sus' ? `affpro-sus-${t}-${tag}@example.test` : `${kind}-${t}-${tag}@example.test`;

async function person(browser: Browser, address: string, width = 1280): Promise<Page> {
  const ip = `10.9.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;
  const ctx = await browser.newContext({ baseURL: origin.origin, extraHTTPHeaders: { 'x-forwarded-for': ip }, viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
  return page;
}
const create = (p: Page, slug: string, name = 'Safeguard Shop') => p.request.put('/api/affiliate/merchant', { headers: origin, data: { name, slug, programmeName: `${name} Partners` } });
const report = (p: Page, data: Record<string, unknown>) => p.request.post('/api/affiliate/report', { headers: origin, data });

test('plan: an account without the Affiliate Manager plan can look, but not make a programme; one with it can', async ({ browser }) => {
  await mkdir(SHOTS, { recursive: true });
  const free = await person(browser, addr('free', 'plan'));

  const refused = await create(free, `plan-${tag}`);
  expect(refused.status()).toBe(403);
  const body = await refused.json();
  expect(body.error).toBe('not_allowed');
  expect(body.message).toContain('isn’t open to every account yet');
  expect((await free.request.put('/api/affiliate/programme', { headers: origin, data: { status: 'open' } })).status(), 'no portal, so nothing to open').toBe(404);

  // The pages say so in plain words, with a way to ask, and no dead "Create" button.
  await free.goto('/app/affiliate');
  await expect(free.getByTestId('programme-not-allowed')).toContainText('isn’t open to every account yet');
  await expect(free.getByTestId('create-programme')).toHaveCount(0);
  await free.goto('/app/affiliate/portal');
  await expect(free.getByText('isn’t open to every account yet')).toBeVisible();
  await expect(free.getByLabel('Business name')).toHaveCount(0);
  await expect(free.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact');
  await free.screenshot({ path: `${SHOTS}/affiliate-p2-plan-gate-desktop.png`, fullPage: true });

  // Being an affiliate needs no plan: a free account can still apply, and see its own list.
  expect((await free.request.get('/api/affiliate/me')).status()).toBe(200);

  const paid = await person(browser, addr('affpro', 'plan'));
  expect((await create(paid, `plan-ok-${tag}`)).status()).toBe(200);
  expect((await paid.request.put('/api/affiliate/programme', { headers: origin, data: { status: 'open' } })).status()).toBe(200);
  await paid.goto('/app/affiliate');
  await expect(paid.getByTestId('programme-not-allowed')).toHaveCount(0);
});

test('names: addresses that pass for KaamSolv, a bank or an official body are refused, with the reason', async ({ browser }) => {
  const p = await person(browser, addr('affpro', 'names'));
  for (const slug of ['official-offers', 'hdfc-bank-partners', 'kaamsolv-support', 'paytm-rewards']) {
    const r = await create(p, slug);
    expect(r.status(), slug).toBe(400);
    const b = await r.json();
    expect(b.error).toBe('slug_blocked');
    expect(b.message).toContain('official, financial or KaamSolv name');
  }
  expect((await create(p, `riverbank-travel-${tag}`)).status(), 'an ordinary name with a plain word inside it is fine').toBe(200);
});

test('reporting: the portal links to a branded report page; a report needs a reason, says thanks, and never reveals who reported', async ({ browser }) => {
  const slug = `rep-${tag}`;
  const owner = await person(browser, addr('affpro', 'rep-owner'));
  expect((await create(owner, slug, 'Report Shop')).status()).toBe(200);

  const visitor = await (await browser.newContext({ baseURL: origin.origin })).newPage();
  await visitor.goto(`/affiliate/${slug}`);
  await visitor.getByTestId('report-link').click();
  await expect(visitor).toHaveURL(new RegExp(`/affiliate/${slug}/report$`));
  await expect(visitor.getByTestId('portal-header')).toContainText('Report Shop');
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // No reason: the field says so.
  await visitor.getByRole('button', { name: 'Send report' }).click();
  const reason = visitor.getByLabel('What is wrong?');
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(visitor.getByText('Choose what is wrong with this page.')).toBeVisible();
  await expect(reason).toBeFocused();

  await reason.selectOption('impersonation');
  await expect(reason).not.toHaveAttribute('aria-invalid', 'true');
  await visitor.getByLabel(/Anything we should know/).fill('Says it is run by a bank');
  await visitor.getByRole('button', { name: 'Send report' }).click();
  await expect(visitor.getByText(/Thanks\. We’ll look at this page\. We don’t tell Report Shop who reported it\./)).toBeVisible();
  await visitor.screenshot({ path: `${SHOTS}/affiliate-p2-report-sent-desktop.png`, fullPage: true });

  // The API: same answer for a portal that doesn't exist (no way to find out which addresses exist), and for the hidden trap.
  const api = await person(browser, addr('visitor', 'rep-api'));
  expect((await report(api, { slug: 'no-such-portal-here', reason: 'scam' })).status()).toBe(202);
  expect((await report(api, { slug, reason: 'scam', website2: 'http://spam.example' })).status()).toBe(202);
  const bad = await report(api, { slug, reason: 'wizard' });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({ error: 'invalid_report', field: 'reason' });

  // Rate limit per caller: 5 an hour. (4 used above by this address: 2 accepted, 1 invalid counts too; keep going until it bites.)
  let limited = 0;
  for (let i = 0; i < 6; i++) if ((await report(api, { slug, reason: 'other' })).status() === 429) limited++;
  expect(limited, 'the per-caller limit applies').toBeGreaterThan(0);
});

test('suspended merchant: the portal and its pages are gone for visitors; the owner sees why and can’t reopen or edit; reports are quietly dropped', async ({ browser }) => {
  const slug = `sus-${tag}`;
  const owner = await person(browser, addr('sus', 'owner'));
  expect((await create(owner, slug, 'Suspended Shop')).status(), 'making it works; it starts suspended in the e2e database').toBe(200);

  const visitor = await (await browser.newContext({ baseURL: origin.origin })).newPage();
  for (const path of [`/affiliate/${slug}`, `/affiliate/${slug}/register`, `/affiliate/${slug}/report`]) {
    const res = await visitor.goto(path);
    expect(res?.status(), path).toBe(404);
  }

  // Applicants are told it doesn't exist; a report is accepted and dropped.
  const aff = await person(browser, addr('affpro', 'sus-aff'));
  const applied = await aff.request.post('/api/affiliate/apply', { headers: origin, data: { slug, displayName: 'Riya', openedAt: Date.now() - 9000 } });
  expect(applied.status()).toBe(404);
  expect((await report(aff, { slug, reason: 'scam' })).status()).toBe(202);

  // The owner is told, in the editor, the Affiliate page and the inbox, and can't change or reopen anything.
  expect((await owner.request.put('/api/affiliate/merchant', { headers: origin, data: { name: 'Renamed', programmeName: 'x' } })).status()).toBe(403);
  const open = await owner.request.put('/api/affiliate/programme', { headers: origin, data: { status: 'open' } });
  expect(open.status()).toBe(403);
  expect((await open.json()).error).toBe('suspended');
  await owner.goto('/app/affiliate');
  await expect(owner.getByText('Your programme is suspended')).toBeVisible();
  await expect(owner.getByText('Reason: Test suspension')).toBeVisible();
  await owner.screenshot({ path: `${SHOTS}/affiliate-p2-suspended-overview-desktop.png`, fullPage: true });
  await owner.goto('/app/affiliate/applications');
  await expect(owner.getByText('Your programme is suspended')).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Open registration' })).toBeDisabled();
  await owner.goto('/app/affiliate/portal');
  await expect(owner.getByText('Your programme is suspended')).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

for (const width of [375, 320]) {
  test(`report page and plan notice hold at ${width}px`, async ({ browser }) => {
    const slug = `rw${width}-${tag}`;
    const owner = await person(browser, addr('affpro', `rw${width}`), width);
    expect((await create(owner, slug, 'Sharma & Sons Travel Company')).status()).toBe(200);
    const free = await person(browser, addr('free', `rw${width}`), width);
    for (const [page, path, name] of [
      [owner, `/affiliate/${slug}/report`, 'report'],
      [free, '/app/affiliate', 'plan-overview'],
      [free, '/app/affiliate/portal', 'plan-portal'],
    ] as [Page, string, string][]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} sideways scroll`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/affiliate-p2-${name}-${width}.png`, fullPage: true });
    }
  });
}

test('shared pages cope with an account that holds the Affiliate Manager plan: billing, hub, account, and what /api/me says', async ({ browser }) => {
  const p = await person(browser, addr('affpro', 'shared'));
  const me = (await (await p.request.get('/api/me')).json()) as { entitlements: { keys: string[]; limits: Record<string, number | null> } };
  expect(me.entitlements.keys).toContain('affiliate_programme');
  expect(me.entitlements.limits.affiliate_programme).toBe(1);

  const status = await (await p.request.get('/api/billing/status')).json();
  expect(status.subscriptions.map((s: { name: string }) => s.name)).toContain('Affiliate Manager');

  await p.goto('/app/billing');
  await expect(p.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(p.getByText('Affiliate Manager').first()).toBeVisible();
  await expect(p.getByText(/Something went wrong|couldn’t load/i)).toHaveCount(0);
  await p.goto('/app');
  await expect(p.getByRole('heading', { name: 'Your KaamSolv', level: 1 })).toBeVisible();
  await p.goto('/app/account');
  await expect(p.getByRole('heading', { level: 1 })).toBeVisible();

  // A free account is unaffected: no such entitlement, and no such plan in its list.
  const free = await person(browser, addr('free', 'shared'));
  const meFree = (await (await free.request.get('/api/me')).json()) as { entitlements: { keys: string[] } };
  expect(meFree.entitlements.keys).not.toContain('affiliate_programme');
  expect((await (await free.request.get('/api/billing/status')).json()).subscriptions).toHaveLength(0);
});

for (const width of [1280, 375, 320]) {
  test(`privacy and terms explain affiliate programmes, and hold at ${width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: origin.origin, viewport: { width, height: 800 } });
    const page = await ctx.newPage();

    await page.goto('/privacy');
    const privacy = page.locator('#affiliate');
    await expect(privacy).toHaveText('Affiliate programmes');
    const body = page.locator('main');
    await expect(body).toContainText('Your sign-in email address');
    await expect(body).toContainText('Once a business has seen your application it may have kept its own copy');
    await expect(body).toContainText("We don't tell the business who reported it");
    await expect(body).toContainText('Affiliate profiles, applications, programme pages and their history');
    await expect(body).toContainText('and your affiliate profile, your applications and any programme you run');
    await expect(page.getByText('Last updated', { exact: false }).first()).toContainText('14 November 2026');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'privacy sideways scroll').toBeLessThanOrEqual(0);
    if (width !== 375) await page.screenshot({ path: `${SHOTS}/affiliate-p2-privacy-${width}.png`, fullPage: true });

    await page.goto('/terms');
    await expect(page.locator('#affiliate')).toHaveText('Affiliate programmes');
    await expect(page.locator('main')).toContainText("isn't a party to the arrangement between a business and its affiliates");
    await expect(page.locator('main')).toContainText("we don't hold or pay any money");
    await expect(page.locator('main')).toContainText('Use “Report this page” at the bottom of it');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'terms sideways scroll').toBeLessThanOrEqual(0);
    if (width !== 375) await page.screenshot({ path: `${SHOTS}/affiliate-p2-terms-${width}.png`, fullPage: true });
  });
}
