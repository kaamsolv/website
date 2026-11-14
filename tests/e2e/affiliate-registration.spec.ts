import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

/**
 * Affiliate Manager, Phase 2, end to end: an owner opens registration, an affiliate applies, the owner approves by
 * hand, the affiliate sees where they stand; the cheap bot checks and rate limits hold; and no one reaches another
 * merchant's applicants or another affiliate's applications. The rules and the same isolation, against real
 * Postgres, are in test/affiliate-registration.test.mts.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
// "affpro-" accounts hold the Affiliate Manager plan in the throwaway e2e database (tests/e2e/start-server.mts).
const email = (t: string) => `affpro-${t}-${tag}@example.test`;
const origin = { origin: BASE };
let ipCounter = 10;

/** A signed-in browser context. Each person gets their own caller address so the per-device limit isn't shared. */
async function person(browser: Browser, address: string, scheme: 'light' | 'dark' = 'light', width?: number): Promise<Page> {
  const ip = `10.7.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;
  const ctx = await browser.newContext({
    baseURL: BASE,
    colorScheme: scheme,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
    ...(width ? { viewport: { width, height: 780 } } : {}),
  });
  const page = await ctx.newPage();
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
  return page;
}

async function makeMerchant(page: Page, slug: string, name: string) {
  const res = await page.request.put('/api/affiliate/merchant', { headers: origin, data: { name, slug, programmeName: `${name} Partners`, terms: 'Paid monthly.' } });
  expect(res.status(), await res.text()).toBe(200);
}

/** The dev mail outbox (no real email is sent locally): every link in every message sent to this address, so far. */
async function mailLinks(address: string): Promise<string> {
  try {
    const lines = (await readFile('test-results/mail-outbox.jsonl', 'utf8')).split('\n').filter(Boolean);
    return lines.map((l) => JSON.parse(l) as { to: string; link: string }).filter((m) => m.to === address).map((m) => m.link).join('\n');
  } catch {
    return '';
  }
}

const setDoor = (api: APIRequestContext, status: 'open' | 'closed') => api.put('/api/affiliate/programme', { headers: origin, data: { status } });
const apply = (api: APIRequestContext, slug: string, extra: Record<string, unknown> = {}) =>
  api.post('/api/affiliate/apply', { headers: origin, data: { slug, displayName: 'Riya Sen', message: 'I run a travel blog', openedAt: Date.now() - 10_000, website2: '', ...extra } });
const applicants = async (api: APIRequestContext) => ((await (await api.get('/api/affiliate/applications')).json()) as { applications: { id: string; status: string; email: string }[] }).applications;

test('owner opens registration; an affiliate applies; the owner approves; the affiliate sees they are in', async ({ browser }) => {
  await mkdir(SHOTS, { recursive: true });
  const slug = `reg-${tag}`;
  const owner = await person(browser, email('owner'));
  await makeMerchant(owner, slug, 'Wandernest Tales');

  // Closed by default: the portal says so and the register page shows no form.
  const visitor = await (await browser.newContext({ baseURL: BASE })).newPage();
  await visitor.goto(`/affiliate/${slug}`);
  await expect(visitor.getByText('Applications are closed right now')).toBeVisible();
  await visitor.goto(`/affiliate/${slug}/register`);
  await expect(visitor.getByText('isn’t taking applications')).toBeVisible();

  // The owner opens registration from the page.
  await owner.goto('/app/affiliate/applications');
  await expect(owner.getByRole('heading', { name: 'Registration is closed' })).toBeVisible();
  await owner.getByRole('button', { name: 'Open registration' }).click();
  await expect(owner.getByRole('heading', { name: 'Registration is open' })).toBeVisible();

  // A signed-out visitor is asked to sign in, and the portal offers "Apply to join".
  await visitor.goto(`/affiliate/${slug}`);
  await expect(visitor.getByRole('link', { name: 'Apply to join' })).toBeVisible();
  await visitor.goto(`/affiliate/${slug}/register`);
  await expect(visitor.getByRole('link', { name: 'Sign in to apply' })).toHaveAttribute('href', new RegExp(`login\\?next=.*register`));
  await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // The affiliate applies through the form.
  const aff = await person(browser, email('aff'));
  await aff.goto(`/affiliate/${slug}/register`);
  await aff.getByLabel('Your name').fill('Riya Sen');
  await aff.getByLabel(/Link to your page or website/).fill('riyatravels.com');
  await aff.getByLabel(/A line about you/).fill('I write about the Himalayas.');
  await aff.waitForTimeout(3_300); // the form's minimum fill time
  await aff.getByRole('button', { name: 'Send application' }).click();
  await expect(aff.getByText(/Sent\. Wandernest Tales will review/)).toBeVisible();
  await aff.goto('/app/affiliate/programmes');
  await expect(aff.getByTestId('my-application')).toContainText('Waiting for review');

  // While it waits, the portal shows where she stands instead of "Apply to join", and so does her account.
  await aff.goto(`/affiliate/${slug}`);
  await expect(aff.getByTestId('portal-status')).toContainText('Your application is with Wandernest Tales');
  await expect(aff.getByRole('link', { name: 'Apply to join' })).toHaveCount(0);
  await aff.goto('/app');
  const hubCard = aff.getByTestId('affiliate-hub-card');
  await expect(hubCard).toContainText('1 waiting for review');
  await expect(hubCard).toContainText('Wandernest Tales Partners');

  // Someone with no affiliate link at all sees no affiliate card: portals stay unlinked from the rest of the site.
  const stranger = await person(browser, email('stranger'));
  await stranger.goto('/app');
  await expect(stranger.getByRole('heading', { name: 'Shared across your business tools' })).toBeVisible();
  await stranger.waitForLoadState('networkidle');
  await expect(stranger.getByTestId('affiliate-hub-card')).toHaveCount(0);

  // The owner sees her own programme on the hub, and her own portal offers management, not an application.
  await owner.goto('/app');
  await expect(owner.getByTestId('affiliate-hub-card')).toContainText('1 to review');
  await owner.goto(`/affiliate/${slug}`);
  await expect(owner.getByTestId('portal-status')).toContainText('This is your programme');

  // The owner sees the applicant and approves.
  await owner.goto('/app/affiliate/applications');
  await expect(owner.getByText('1 to review')).toBeVisible();
  await expect(owner.getByTestId('count-pending')).toHaveText('(1)');
  await expect(owner.getByTestId('count-approved')).toHaveText('(0)');
  await expect(owner.getByTestId('count-rejected')).toHaveText('(0)');
  await expect(owner.getByTestId('count-all')).toHaveText('(1)');
  const card = owner.getByTestId('application');
  await expect(card).toContainText('Riya Sen');
  await expect(card).toContainText('riyatravels.com');
  await expect(card).toContainText('I write about the Himalayas.');
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(owner.getByText('Nothing to review. Sorted.')).toBeVisible();
  await expect(owner.getByTestId('count-pending')).toHaveText('(0)');
  await expect(owner.getByTestId('count-approved')).toHaveText('(1)');
  await expect(owner.getByTestId('count-all')).toHaveText('(1)');

  await aff.goto('/app/affiliate/programmes');
  await expect(aff.getByTestId('my-application')).toContainText('You’re in');
  await aff.goto(`/affiliate/${slug}/register`);
  await expect(aff.getByText('You’re in. Welcome to')).toBeVisible();

  // The portal now tells her she's in (no "Apply to join"), with a way to her list; her hub lists the programme as approved.
  await aff.goto(`/affiliate/${slug}`);
  await expect(aff.getByTestId('portal-status')).toContainText('You’re part of this programme');
  await expect(aff.getByRole('link', { name: 'Apply to join' })).toHaveCount(0);
  await aff.getByRole('link', { name: 'Go to my programmes' }).click();
  await expect(aff).toHaveURL(/\/app\/affiliate\/programmes$/);
  await aff.goto('/app');
  await expect(aff.getByTestId('affiliate-hub-card')).toContainText('1 joined');
  await expect(aff.getByTestId('affiliate-hub-card')).toContainText('Approved');
});

test('the application page wears the merchant’s identity; reasons, suspend and reinstate, copy links, and the three emails', async ({ browser }) => {
  const slug = `mod-${tag}`;
  const ownerAddr = email('mod-owner');
  const affAddr = email('mod-aff');
  const owner = await person(browser, ownerAddr, 'light', 1280);
  await owner.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const made = await owner.request.put('/api/affiliate/merchant', { headers: origin, data: { name: 'Mod Shop', slug, programmeName: 'Mod Partners', brandColour: '#38BBAC' } });
  expect(made.status(), await made.text()).toBe(200);
  await setDoor(owner.request, 'open');

  // 1. The application page is the merchant's: their colour band and programme, one h1, KaamSolv only as the footer line.
  const aff = await person(browser, affAddr, 'light', 1280);
  await aff.goto(`/affiliate/${slug}/register`);
  const header = aff.getByTestId('portal-header');
  await expect(header).toContainText('Mod Shop');
  await expect(header).toContainText('Mod Partners');
  expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(56, 187, 172)');
  await expect(aff.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(aff.getByRole('heading', { level: 1 })).toHaveText('Apply to join');
  await expect(aff.getByText('Affiliate programme run on')).toBeVisible();
  await aff.screenshot({ path: `${SHOTS}/affiliate-p2-apply-branded-desktop.png`, fullPage: true });

  // 2. The three optional answers go to the merchant.
  await aff.getByLabel('Your name').fill('Riya Sen');
  await aff.getByLabel(/Which describes you best/).selectOption('teacher');
  await aff.getByLabel(/Where will you share it/).selectOption('instagram');
  await aff.getByLabel('Country').fill('India');
  await aff.waitForTimeout(3_300);
  await aff.getByRole('button', { name: 'Send application' }).click();
  await expect(aff.getByText(/Sent\. Mod Shop will review/)).toBeVisible();

  // 3. Email 1: the merchant is told, with a link to the inbox.
  await expect.poll(() => mailLinks(ownerAddr), { timeout: 20_000 }).toContain('/app/affiliate/applications?status=pending');

  await owner.goto('/app/affiliate/applications');
  const card = owner.getByTestId('application');
  await expect(card.getByTestId('application-answers')).toContainText('Teacher or educator');
  await expect(card.getByTestId('application-answers')).toContainText('Instagram');
  await expect(card.getByTestId('application-answers')).toContainText('India');
  await owner.screenshot({ path: `${SHOTS}/affiliate-p2-inbox-answers-desktop.png`, fullPage: true });

  // 4. A reason goes with the decision, email 2 goes to the affiliate, and she sees the reason.
  await card.getByLabel(/Reason or note/).fill('Welcome to the team');
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(owner.getByText('Nothing to review. Sorted.')).toBeVisible();
  await expect.poll(() => mailLinks(affAddr), { timeout: 20_000 }).toContain('/app/affiliate/programmes');
  await aff.goto('/app/affiliate/programmes');
  await expect(aff.getByTestId('my-application')).toContainText('Welcome to the team');
  await expect(aff.getByTestId('my-application-status')).toHaveText('You’re in');

  // 5. Suspend with a reason: it shows on both sides, the portal says access is paused, and she can't apply again.
  await owner.getByRole('button', { name: /^Approved/ }).click();
  const approvedCard = owner.getByTestId('application');
  await expect(approvedCard.getByTestId('application-status')).toHaveText('Approved');
  await approvedCard.getByRole('button', { name: 'Suspend…' }).click();
  await approvedCard.getByLabel(/^Reason/).fill('Posted off-brand content');
  await approvedCard.getByRole('button', { name: 'Suspend affiliate' }).click();
  await expect(approvedCard.getByTestId('application-status')).toHaveText('Suspended');
  await expect(approvedCard).toContainText('Reason for pausing: “Posted off-brand content”');
  await aff.goto('/app/affiliate/programmes');
  await expect(aff.getByTestId('my-application-status')).toHaveText('Paused by the merchant');
  await expect(aff.getByTestId('my-application-paused')).toContainText('Posted off-brand content');
  await aff.goto(`/affiliate/${slug}`);
  await expect(aff.getByTestId('portal-status')).toContainText('Your access is paused');
  await expect(aff.getByRole('link', { name: 'Apply to join' })).toHaveCount(0);
  await aff.goto(`/affiliate/${slug}/register`);
  await expect(aff.getByText('Your access to this programme is paused by the merchant.')).toBeVisible();
  const again = await apply(aff.request, slug);
  expect(again.status()).toBe(409);
  expect((await again.json()).error).toBe('suspended');

  // 6. Reinstate: she is back in.
  await owner.reload();
  await owner.getByRole('button', { name: /^Approved/ }).click();
  await owner.getByTestId('application').getByRole('button', { name: 'Reinstate' }).click();
  await expect(owner.getByTestId('application').getByTestId('application-status')).toHaveText('Approved');
  await aff.goto('/app/affiliate/programmes');
  await expect(aff.getByTestId('my-application-status')).toHaveText('You’re in');
  await expect(aff.getByTestId('my-application-paused')).toHaveCount(0);

  // 7. Copy links: the programme page and the application link go to the clipboard as full addresses.
  const links = owner.getByTestId('share-links');
  await links.getByRole('button', { name: 'Copy link' }).first().click();
  expect(await owner.evaluate(() => navigator.clipboard.readText())).toBe(`${BASE}/affiliate/${slug}`);
  await links.getByRole('button', { name: 'Copy link' }).nth(1).click();
  expect(await owner.evaluate(() => navigator.clipboard.readText())).toBe(`${BASE}/affiliate/${slug}/register`);

  // 8. Email 3: a rejection carries the reason and the programme page to the second applicant.
  const secondAddr = email('mod-aff2');
  const second = await person(browser, secondAddr);
  expect((await apply(second.request, slug, { displayName: 'Sam Rao' })).status()).toBe(200);
  await owner.goto('/app/affiliate/applications');
  const pending = owner.getByTestId('application');
  await pending.getByLabel(/Reason or note/).fill('Not the right fit right now');
  await pending.getByRole('button', { name: 'Don’t approve' }).click();
  await expect(owner.getByText('Nothing to review. Sorted.')).toBeVisible();
  await expect.poll(() => mailLinks(secondAddr), { timeout: 20_000 }).toContain(`/affiliate/${slug}`);
  await second.goto('/app/affiliate/programmes');
  await expect(second.getByTestId('my-application')).toContainText('Not the right fit right now');
});

test('sidebar: an Affiliate entry with an icon, and two branches that open to counts', async ({ browser }) => {
  const slug = `nav-${tag}`;
  const nav = (p: Page) => p.getByTestId('nav-affiliate');

  // No portal and no applications: the joined branch shows zeros; "Created" is a plain link to set one up.
  const stranger = await person(browser, email('nav-stranger'));
  await stranger.setViewportSize({ width: 1280, height: 800 });
  await stranger.goto('/app/affiliate');
  const root = nav(stranger).getByTestId('nav-affiliate-root');
  await expect(root).toContainText('Affiliate');
  await expect(root.locator('svg')).toHaveCount(1);
  await expect(root).toHaveAttribute('aria-current', 'page');
  await expect(nav(stranger).getByTestId('nav-joined-all')).toContainText('0');
  await expect(nav(stranger).getByTestId('nav-joined-pending')).toContainText('Applied');
  await expect(nav(stranger).getByTestId('nav-joined-approved')).toContainText('Approved');
  await expect(nav(stranger).getByTestId('nav-joined-rejected')).toContainText('Not approved');
  const setup = nav(stranger).getByRole('link', { name: /^Created$/ });
  await expect(setup).toHaveAttribute('href', '/app/affiliate/portal');
  await expect(setup).toBeVisible();

  // An owner with a portal: the created branch opens to To review / Approved / Not approved, with numbers.
  const owner = await person(browser, email('nav-owner'));
  await owner.setViewportSize({ width: 1280, height: 800 });
  await makeMerchant(owner, slug, 'Nav Shop');
  await setDoor(owner.request, 'open');
  const aff = await person(browser, email('nav-aff'));
  await aff.setViewportSize({ width: 1280, height: 800 });
  expect((await apply(aff.request, slug)).status()).toBe(200);

  await owner.goto('/app/affiliate');
  await expect(nav(owner).getByTestId('nav-created-pending')).toContainText('1');
  await expect(nav(owner).getByTestId('nav-created-approved')).toContainText('0');
  await expect(nav(owner).getByTestId('nav-created-rejected')).toContainText('0');
  await expect(owner.getByTestId('nav-affiliate-pending')).toHaveText('1');
  await expect(nav(owner).getByTestId('nav-created-portal')).toHaveAttribute('href', '/app/affiliate/portal');

  // The branch is a dropdown: it closes and opens again.
  const toggle = nav(owner).getByRole('button', { name: /Created options/ });
  await toggle.click();
  await expect(nav(owner).getByTestId('nav-created-pending')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(nav(owner).getByTestId('nav-created-pending')).toBeVisible();

  // A count opens the matching list, and the row says where you are.
  await nav(owner).getByTestId('nav-created-pending').click();
  await expect(owner).toHaveURL(/\/app\/affiliate\/applications\?status=pending$/);
  await expect(owner.getByRole('button', { name: /To review/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(nav(owner).getByTestId('nav-created-pending')).toHaveAttribute('aria-current', 'page');
  await owner.getByTestId('application').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(owner.getByText('Nothing to review. Sorted.')).toBeVisible();
  await nav(owner).getByTestId('nav-created-approved').click();
  await expect(owner).toHaveURL(/status=approved$/);
  await expect(owner.getByTestId('application')).toHaveCount(1);
  await expect(owner.getByTestId('nav-affiliate-pending')).toHaveCount(0);

  // The affiliate's branch: Approved now has her one programme, and opens the filtered list.
  await aff.goto('/app/affiliate');
  await expect(nav(aff).getByTestId('nav-joined-approved')).toContainText('1');
  await expect(nav(aff).getByTestId('nav-joined-all')).toContainText('1');
  await nav(aff).getByTestId('nav-joined-approved').click();
  await expect(aff).toHaveURL(/\/app\/affiliate\/programmes\?status=approved$/);
  await expect(aff.getByTestId('my-application')).toHaveCount(1);
  await aff.getByTestId('nav-joined-rejected').click();
  await expect(aff.getByText('Nothing here yet.')).toBeVisible();
  await expect(aff.getByTestId('mine-count-approved')).toHaveText('(1)');
});

test('the Affiliate page explains both roles, shows where you stand, and has the links to join or create', async ({ browser }) => {
  const slug = `ov-${tag}`;
  const owner = await person(browser, email('ov-owner'));
  await makeMerchant(owner, slug, 'Overview Shop');
  await setDoor(owner.request, 'open');

  // Someone with nothing yet: both roles explained, a way to join (paste a link) and a way to create.
  const p = await person(browser, email('ov-new'), 'light', 1280);
  await p.goto('/app/affiliate');
  await expect(p.getByRole('heading', { name: 'Affiliate', level: 1 })).toBeVisible();
  await expect(p.getByRole('heading', { name: 'How a programme works' })).toBeVisible();
  const joined = p.getByTestId('overview-joined');
  const created = p.getByTestId('overview-created');
  await expect(joined.getByRole('heading', { name: 'Programmes joined' })).toBeVisible();
  await expect(created.getByRole('heading', { name: 'Programmes created' })).toBeVisible();
  await expect(joined.getByTestId('figure-applied')).toContainText('0');
  await expect(created.getByTestId('create-programme')).toHaveAttribute('href', '/app/affiliate/portal');
  await p.screenshot({ path: `${SHOTS}/affiliate-overview-new-desktop.png`, fullPage: true });

  // Paste box: a bad value says what is wrong beside the box; a link, a path or a bare name opens the programme.
  const box = joined.getByLabel('Have a programme link?');
  await box.fill('hello there');
  await joined.getByRole('button', { name: 'Open programme' }).click();
  await expect(joined.locator('#paste-error')).toContainText('doesn’t look like a programme link');
  await expect(box).toHaveAttribute('aria-invalid', 'true');
  await box.fill(`https://kaamsolv.com/affiliate/${slug}/register?utm=x`);
  await expect(joined.locator('#paste-error')).toHaveCount(0);
  await joined.getByRole('button', { name: 'Open programme' }).click();
  await expect(p).toHaveURL(new RegExp(`/affiliate/${slug}$`));
  await expect(p.getByRole('link', { name: 'Apply to join' })).toBeVisible();

  // The owner sees their own programme: address, registration state, numbers, and the next step.
  const o = await person(browser, email('ov-owner2'), 'light', 1280);
  await makeMerchant(o, `ov2-${tag}`, 'Second Overview Shop');
  await o.goto('/app/affiliate');
  const mine = o.getByTestId('overview-created');
  await expect(mine).toContainText(`kaamsolv.com/affiliate/ov2-${tag}`);
  await expect(mine.getByTestId('registration-state')).toContainText('closed');
  await expect(mine.getByTestId('figure-to-review')).toContainText('0');
  await expect(mine.getByRole('link', { name: 'Portal settings' })).toHaveAttribute('href', '/app/affiliate/portal');
  await setDoor(o.request, 'open');
  await expect(async () => {
    await o.reload();
    await expect(o.getByTestId('overview-created').getByTestId('registration-state')).toContainText('open');
  }).toPass();
  await expect(o.getByTestId('create-programme')).toHaveCount(0);
  await o.screenshot({ path: `${SHOTS}/affiliate-overview-owner-desktop.png`, fullPage: true });
});

test('form errors name the field: the box is outlined, the message sits under it, focus moves there, typing clears it', async ({ browser }) => {
  const slug = `err-${tag}`;
  const owner = await person(browser, email('err-owner'));
  await makeMerchant(owner, slug, 'Error Test Shop');
  await setDoor(owner.request, 'open');
  const aff = await person(browser, email('err-aff'), 'dark', 375);
  await aff.goto(`/affiliate/${slug}/register`);

  // What a real applicant typed: an email address where the link goes.
  const site = aff.getByLabel(/Link to your page or website/);
  await aff.getByLabel('Your name').fill('Reha Bhatnagar');
  await site.fill('reha@insta.com');
  await aff.getByLabel(/A line about you/).fill('I am a very good influencer');
  await aff.getByRole('button', { name: 'Send application' }).click();

  const message = aff.locator('#a-site-error');
  await expect(message).toContainText('looks like an email address');
  await expect(message).toContainText('instagram.com/yourname');
  await expect(site).toHaveAttribute('aria-invalid', 'true');
  await expect(site).toHaveAttribute('aria-describedby', /a-site-error/);
  await expect(site).toBeFocused();
  await expect(aff.getByText('Please fix the highlighted field below.')).toBeVisible();
  expect(await site.evaluate((el) => getComputedStyle(el).borderColor), 'the box is outlined, not left plain').not.toBe(await aff.getByLabel('Your name').evaluate((el) => getComputedStyle(el).borderColor));
  await expect(aff.getByLabel('Your name')).not.toHaveAttribute('aria-invalid', 'true');
  expect(await aff.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await aff.screenshot({ path: `${SHOTS}/affiliate-p2-form-error-375-dark.png`, fullPage: true });

  // An empty name points at the name box, not the link.
  await site.fill('instagram.com/reha');
  await expect(message).toHaveCount(0);
  await expect(site).not.toHaveAttribute('aria-invalid', 'true');
  await aff.getByLabel('Your name').fill('');
  await aff.getByRole('button', { name: 'Send application' }).click();
  await expect(aff.locator('#a-name-error')).toContainText('Add the name you go by');
  await expect(aff.getByLabel('Your name')).toBeFocused();

  // Fixed, it goes through.
  await aff.getByLabel('Your name').fill('Reha Bhatnagar');
  await aff.waitForTimeout(3_300);
  await aff.getByRole('button', { name: 'Send application' }).click();
  await expect(aff.getByText(/Sent\. Error Test Shop will review/)).toBeVisible();

  // The server says which field too, for a client that skips the page's own check.
  const api = await aff.request.post('/api/affiliate/apply', { headers: origin, data: { slug, displayName: 'X', website: 'reha@insta.com', openedAt: Date.now() - 9000 } });
  expect(api.status()).toBe(400);
  expect(await api.json()).toMatchObject({ field: 'website', error: 'website_invalid' });
});

test('bot checks and rate limits: a trap or a too-fast submit stores nothing; the fourth attempt is limited', async ({ browser }) => {
  const slug = `bot-${tag}`;
  const owner = await person(browser, email('bot-owner'));
  await makeMerchant(owner, slug, 'Bot Test Shop');
  expect((await setDoor(owner.request, 'open')).status()).toBe(200);

  const aff = await person(browser, email('bot-aff'));
  expect((await apply(aff.request, slug, { website2: 'http://spam.example' })).status()).toBe(200);
  expect((await apply(aff.request, slug, { openedAt: Date.now() - 500 })).status()).toBe(200);
  expect((await apply(aff.request, slug, { openedAt: undefined })).status()).toBe(200);
  expect(await applicants(owner.request), 'a tripped check looks like success and stores nothing').toHaveLength(0);

  expect((await apply(aff.request, slug)).status()).toBe(200);
  expect((await apply(aff.request, slug)).status(), 'duplicate while pending').toBe(409);
  expect((await apply(aff.request, slug)).status()).toBe(409);
  const limited = await apply(aff.request, slug);
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  expect(await applicants(owner.request)).toHaveLength(1);
});

test('refusals: unknown, closed, your own programme, cross-site, signed out, bad input', async ({ browser }) => {
  const slug = `ref-${tag}`;
  const owner = await person(browser, email('ref-owner'));
  await makeMerchant(owner, slug, 'Refusal Shop');
  const aff = await person(browser, email('ref-aff'));

  expect((await apply(aff.request, 'no-such-shop')).status()).toBe(404);
  expect((await apply(aff.request, slug)).status(), 'closed').toBe(409);
  await setDoor(owner.request, 'open');
  expect((await apply(owner.request, slug)).status(), 'own programme').toBe(409);
  expect((await aff.request.post('/api/affiliate/apply', { headers: { origin: 'https://evil.example' }, data: { slug, displayName: 'X', openedAt: Date.now() - 9000 } })).status()).toBe(403);
  const out = await (await browser.newContext({ baseURL: BASE })).request.post('/api/affiliate/apply', { headers: origin, data: { slug } });
  expect(out.status()).toBe(401);
  expect((await apply(aff.request, slug, { displayName: '' })).status()).toBe(400);
  expect((await apply(aff.request, slug, { website: 'javascript:alert(1)' })).status()).toBe(400);
  expect((await setDoor(aff.request, 'open')).status(), 'an affiliate with no portal cannot open anyone’s door').toBe(404);
  expect(await applicants(owner.request)).toHaveLength(0);
});

test('isolation: another merchant cannot list or decide these applicants; another affiliate cannot withdraw them', async ({ browser }) => {
  const a = await person(browser, email('iso-a'));
  await makeMerchant(a, `isoa-${tag}`, 'Merchant A');
  await setDoor(a.request, 'open');
  const b = await person(browser, email('iso-b'));
  await makeMerchant(b, `isob-${tag}`, 'Merchant B');
  await setDoor(b.request, 'open');

  const aff = await person(browser, email('iso-aff'));
  expect((await apply(aff.request, `isoa-${tag}`)).status()).toBe(200);
  const [theirs] = await applicants(a.request);
  expect(theirs.status).toBe('pending');

  expect(await applicants(b.request), 'B sees none of A’s applicants').toHaveLength(0);
  const decide = (id: string) => b.request.post(`/api/affiliate/applications/${id}`, { headers: origin, data: { decision: 'approved' } });
  expect((await decide(theirs.id)).status(), 'B holding A’s application id').toBe(404);
  expect((await decide('not-a-uuid')).status()).toBe(404);
  expect((await applicants(a.request))[0].status).toBe('pending');

  const other = await person(browser, email('iso-other'));
  expect((await other.request.delete(`/api/affiliate/me/applications/${theirs.id}`, { headers: origin })).status(), 'someone else’s application').toBe(404);
  const mine = (await (await other.request.get('/api/affiliate/me')).json()) as { applications: unknown[]; profile: unknown };
  expect(mine.applications).toHaveLength(0);
  expect(mine.profile).toBeNull();
  expect((await other.request.get('/api/affiliate/applications')).status(), 'no merchant, no applicant list').toBe(404);

  const out = await (await browser.newContext({ baseURL: BASE })).request.get('/api/affiliate/applications');
  expect(out.status()).toBe(401);
  expect((await aff.request.delete(`/api/affiliate/me/applications/${theirs.id}`, { headers: origin })).status(), 'the owner of the application can withdraw it').toBe(200);
  expect((await applicants(a.request))[0].status).toBe('withdrawn');
});

for (const width of [375, 360, 320]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`registration pages hold at ${width}px, ${scheme}`, async ({ browser }) => {
      const slug = `w${width}${scheme[0]}-${tag}`;
      const owner = await person(browser, email(`wo${width}${scheme}`), scheme, width);
      await makeMerchant(owner, slug, 'Sharma & Sons Travel Company');
      await setDoor(owner.request, 'open');
      const aff = await person(browser, email(`wa${width}${scheme}`), scheme, width);
      expect((await apply(aff.request, slug, { message: 'x'.repeat(120) + ' ' + 'y'.repeat(100), displayName: 'A very long name '.repeat(4).trim() })).status()).toBe(200);

      const visits: [Page, string, string][] = [
        [aff, `/affiliate/${slug}`, 'portal'],
        [aff, `/affiliate/${slug}/register`, 'register'],
        [aff, '/app/affiliate/programmes', 'mine'],
        [aff, '/app/affiliate', 'overview-aff'],
        [owner, '/app/affiliate', 'overview-owner'],
        [owner, '/app/affiliate/applications', 'review'],
      ];
      for (const [page, path, name] of visits) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} sideways scroll`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${SHOTS}/affiliate-p2-${name}-${width}-${scheme}.png`, fullPage: true });
      }
    });
  }
}
