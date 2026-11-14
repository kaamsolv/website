import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Referral links and recorded clicks (Phase 3A), end to end on the dev server: the business sets where links lead, an
 * approved affiliate gets a link, the link redirects, and the click that is written after the response is counted.
 * The rules and the database behaviour are in test/affiliate-link*.test.mts; the same redirect and persistence check
 * against a real Neon database and the OpenNext preview is `npm run affiliate:smoke … --redirect-base-url`.
 */

const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const origin = { origin: BASE };
const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const slug = `lnk-${tag}`;
const DESTINATION = 'https://store.example/shop';
const HUMAN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
let ipCounter = 120;

async function person(browser: Browser, address: string, width = 1280, scheme: 'light' | 'dark' = 'light'): Promise<Page> {
  const ip = `10.7.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;
  const ctx = await browser.newContext({ baseURL: BASE, colorScheme: scheme, extraHTTPHeaders: { 'x-forwarded-for': ip }, viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
  return page;
}
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

type Me = { applications: { id: string; link: { code: string; clicks: { days7: number; days30: number; all: number }; paused: boolean; hasDestination: boolean } | null }[] };
const me = async (p: Page): Promise<Me> => (await p.request.get('/api/affiliate/me')).json();
const hit = (p: Page, path: string, ua = HUMAN_UA) => p.request.get(path, { maxRedirects: 0, headers: { 'user-agent': ua } });

test.describe.serial('referral links', () => {
  let biz: Page;
  let aff: Page;
  let code = '';
  let applicationId = '';

  test.beforeAll(async ({ browser }) => {
    await mkdir(SHOTS, { recursive: true });
    biz = await person(browser, `affpro-links-${tag}@example.test`);
    aff = await person(browser, `free-links-aff-${tag}@example.test`);
  });

  test('the business sets where links lead: bad addresses are refused in plain words, a good one is saved', async () => {
    expect((await biz.request.put('/api/affiliate/merchant', { headers: origin, data: { name: 'Links Shop', slug, programmeName: 'Links Partners' } })).status()).toBe(200);
    await biz.goto('/app/affiliate/portal');
    const field = biz.getByLabel('Where affiliate links lead');
    await expect(field).toBeVisible();
    await expect(biz.getByRole('button', { name: 'What does this mean?' }).first()).toBeVisible();

    for (const [bad, message] of [
      ['http://store.example', 'Use an https address'],
      ['https://kaamsolv.com/', 'That’s a KaamSolv address'],
      ['https://bit.ly/abc', 'link-shortener'],
      ['not an address', 'doesn’t look like a web address'],
    ] as const) {
      await field.fill(bad);
      await biz.getByRole('button', { name: 'Save destination' }).click();
      await expect(biz.getByRole('alert').filter({ hasText: message })).toBeVisible();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
    }

    await field.fill(DESTINATION);
    await biz.getByRole('button', { name: 'Save destination' }).click();
    await expect(biz.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(biz.getByRole('link', { name: 'Open it to check it works' })).toHaveAttribute('href', `${DESTINATION}`);
    await biz.reload();
    await expect(biz.getByLabel('Where affiliate links lead')).toHaveValue(DESTINATION);
    await biz.screenshot({ path: `${SHOTS}/affiliate-p3-destination-desktop.png`, fullPage: true });

    expect((await biz.request.put('/api/affiliate/programme', { headers: origin, data: { status: 'open' } })).status()).toBe(200);
  });

  test('an approved affiliate gets a link, and it never shows to anyone before approval', async () => {
    const applied = await aff.request.post('/api/affiliate/apply', { headers: origin, data: { slug, displayName: 'Riya Links', openedAt: Date.now() - 9000 } });
    expect(applied.status(), await applied.text()).toBeLessThan(300);
    const before = await me(aff);
    expect(before.applications[0].link, 'no link while the application is pending').toBeNull();

    const list = (await (await biz.request.get('/api/affiliate/applications')).json()) as { applications: { id: string }[] };
    applicationId = list.applications[0].id;
    expect((await biz.request.post(`/api/affiliate/applications/${applicationId}`, { headers: origin, data: { decision: 'approved', note: 'Welcome' } })).status()).toBe(200);

    const after = await me(aff);
    const link = after.applications[0].link;
    expect(link?.code).toMatch(/^[0-9A-Za-z]{8}$/);
    expect(link?.hasDestination).toBe(true);
    expect(link?.clicks).toEqual({ days7: 0, days30: 0, all: 0 });
    code = link!.code;
    // Asking again does not make another.
    expect((await me(aff)).applications[0].link?.code).toBe(code);

    await aff.goto('/app/affiliate/programmes');
    const card = aff.getByTestId('link-card');
    await expect(card).toBeVisible();
    await expect(aff.getByTestId('link-address')).toHaveText(`kaamsolv.com/${slug}/${code}`);
    await expect(aff.getByTestId('link-whatsapp')).toHaveAttribute('href', new RegExp(`^https://wa\\.me/\\?text=.*${code}`));
    await expect(card.getByText('No clicks recorded yet')).toBeVisible();
    await expect(card.getByText('Recorded clicks')).toBeVisible();
    await expect(card.getByText(/unique|visitors|people/i).first()).toBeHidden();
    await aff.screenshot({ path: `${SHOTS}/affiliate-p3-link-card-desktop.png`, fullPage: true });
  });

  test('the link redirects to the store with ?ref=, and the click written after the response is counted', async () => {
    const res = await hit(aff, `/${slug}/${code}`);
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toBe(`${DESTINATION}?ref=${code}`);
    expect(res.headers()['cache-control']).toContain('no-store');
    expect(res.headers()['x-robots-tag']).toContain('noindex');

    // The click lands after the answer, so poll the affiliate's own view.
    await expect.poll(async () => (await me(aff)).applications[0].link?.clicks.all, { timeout: 10_000 }).toBe(1);
    expect((await me(aff)).applications[0].link?.clicks).toEqual({ days7: 1, days30: 1, all: 1 });

    // The business sees the same count, worded as recorded clicks.
    await biz.goto('/app/affiliate/applications');
    await biz.getByRole('button', { name: /Approved/ }).click();
    await expect(biz.getByTestId('recorded-clicks')).toContainText('Recorded clicks on their link: 1 in the last 30 days, 1 in all.');
  });

  test('link previews, unknown codes and wrong addresses record nothing and answer correctly', async () => {
    const before = (await me(aff)).applications[0].link!.clicks.all;
    expect((await hit(aff, `/${slug}/${code}`, 'WhatsApp/2.23.20.0')).status(), 'a preview is still sent on').toBe(302);
    expect((await hit(aff, `/${slug}/Zz9Zz9Zz`)).status()).toBe(404);
    expect((await hit(aff, `/no-such-${tag}/${code}`)).status()).toBe(404);
    expect((await hit(aff, `/tools/${code}`)).status(), 'a real page name is never a business').toBe(404);
    expect((await hit(aff, `/${slug}/short`)).status(), 'a code of the wrong shape').toBe(404);
    await aff.waitForTimeout(1500);
    expect((await me(aff)).applications[0].link!.clicks.all).toBe(before);
  });

  test('a paused affiliate’s link still opens the store, without ?ref=, and records nothing; reinstated, it counts again', async () => {
    expect((await biz.request.post(`/api/affiliate/applications/${applicationId}`, { headers: origin, data: { decision: 'suspended', note: 'Pause' } })).status()).toBe(200);
    const res = await hit(aff, `/${slug}/${code}`);
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toBe(DESTINATION);
    await aff.waitForTimeout(1500);
    expect((await me(aff)).applications[0].link!.clicks.all).toBe(1);
    await aff.goto('/app/affiliate/programmes');
    await expect(aff.getByTestId('link-paused')).toContainText('has paused your place');
    await expect(aff.getByTestId('link-whatsapp')).toHaveCount(0);

    expect((await biz.request.post(`/api/affiliate/applications/${applicationId}`, { headers: origin, data: { decision: 'reinstated' } })).status()).toBe(200);
    expect((await hit(aff, `/${slug}/${code}`)).headers()['location']).toBe(`${DESTINATION}?ref=${code}`);
    await expect.poll(async () => (await me(aff)).applications[0].link?.clicks.all, { timeout: 10_000 }).toBe(2);
  });

  test('with no destination yet, the link leads to the programme page', async ({ browser }) => {
    const owner = await person(browser, `affpro-links-nodest-${tag}@example.test`);
    const slug2 = `nd-${tag}`;
    expect((await owner.request.put('/api/affiliate/merchant', { headers: origin, data: { name: 'No Dest', slug: slug2 } })).status()).toBe(200);
    expect((await owner.request.put('/api/affiliate/programme', { headers: origin, data: { status: 'open' } })).status()).toBe(200);
    const other = await person(browser, `free-links-nd-${tag}@example.test`);
    expect((await other.request.post('/api/affiliate/apply', { headers: origin, data: { slug: slug2, displayName: 'N D', openedAt: Date.now() - 9000 } })).status()).toBeLessThan(300);
    const id = ((await (await owner.request.get('/api/affiliate/applications')).json()) as { applications: { id: string }[] }).applications[0].id;
    await owner.request.post(`/api/affiliate/applications/${id}`, { headers: origin, data: { decision: 'approved' } });
    const link = (await me(other)).applications[0].link!;
    expect(link.hasDestination).toBe(false);
    const res = await hit(other, `/${slug2}/${link.code}`);
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toBe(`/affiliate/${slug2}`);
    await other.goto('/app/affiliate/programmes');
    await expect(other.getByTestId('link-no-destination')).toContainText('hasn’t added their store address yet');
  });

  test('a code under another business’s address is not found', async ({ browser }) => {
    const sus = await person(browser, `affpro-other-links-${tag}@example.test`);
    const slug3 = `sus-${tag}`;
    expect((await sus.request.put('/api/affiliate/merchant', { headers: origin, data: { name: 'Sus', slug: slug3 } })).status()).toBe(200);
    // The first business's code under this address is nothing.
    expect((await hit(aff, `/${slug3}/${code}`)).status()).toBe(404);
  });

  test('phone widths 360 and 320, light and dark, notes open: nothing scrolls sideways and the controls fit', async ({ browser }) => {
    for (const width of [360, 320]) {
      for (const scheme of ['light', 'dark'] as const) {
        const a = await person(browser, `free-links-aff-${tag}@example.test`, width, scheme);
        await a.goto('/app/affiliate/programmes');
        await expect(a.getByTestId('link-card')).toBeVisible();
        await a.getByRole('button', { name: 'What does this mean?' }).first().click();
        await expect(a.getByTestId('info-note')).toBeVisible();
        expect(await sideways(a), `programmes ${width} ${scheme}`).toBeLessThanOrEqual(0);
        for (const sel of ['link-whatsapp']) {
          const box = await a.getByTestId(sel).boundingBox();
          expect(box && box.height >= 44, `${sel} is a 44px target at ${width}`).toBeTruthy();
        }
        await a.screenshot({ path: `${SHOTS}/affiliate-p3-link-card-${width}-${scheme}.png`, fullPage: true });

        const b = await person(browser, `affpro-links-${tag}@example.test`, width, scheme);
        await b.goto('/app/affiliate/portal');
        const field = b.getByLabel('Where affiliate links lead');
        await field.fill('http://nope.example');
        await b.getByRole('button', { name: 'Save destination' }).click();
        await expect(b.getByRole('alert').filter({ hasText: 'Use an https address' })).toBeVisible();
        await b.getByRole('button', { name: 'What does this mean?' }).first().click();
        expect(await sideways(b), `portal ${width} ${scheme}`).toBeLessThanOrEqual(0);
        await b.screenshot({ path: `${SHOTS}/affiliate-p3-destination-${width}-${scheme}.png`, fullPage: true });

        await b.goto('/app/affiliate/applications');
        await b.getByRole('button', { name: /Approved/ }).click();
        await expect(b.getByTestId('recorded-clicks')).toBeVisible();
        expect(await sideways(b), `applications ${width} ${scheme}`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('keyboard: the info button opens with Enter, the fields are labelled, the copy and share controls take focus', async () => {
    await aff.goto('/app/affiliate/programmes');
    const info = aff.getByRole('button', { name: 'What does this mean?' }).first();
    await info.focus();
    await aff.keyboard.press('Enter');
    await expect(info).toHaveAttribute('aria-expanded', 'true');
    await expect(aff.getByTestId('info-note')).toContainText('isn’t a count of people');
    await aff.keyboard.press('Enter');
    await expect(info).toHaveAttribute('aria-expanded', 'false');
    await aff.getByRole('button', { name: /Copy link/ }).focus();
    await expect(aff.getByRole('button', { name: /Copy link/ })).toBeFocused();
    await aff.getByTestId('link-whatsapp').focus();
    await expect(aff.getByTestId('link-whatsapp')).toBeFocused();
  });
});
