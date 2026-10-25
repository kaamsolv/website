import { expect, test, type Page } from '@playwright/test';
import { LIVE_TOOLS } from '../../app/lib/catalogue';

/**
 * Google Analytics consent + events (docs/ANALYTICS.md).
 *
 * Two modes, because NEXT_PUBLIC_GA_ID is fixed when the server starts:
 *   - default run (KK_E2E_GA_ID unset): analytics must be completely off.
 *   - KK_E2E_GA_ID=G-E2ETEST1 npx playwright test analytics: the consent flow.
 *     gtag.js is replaced by an empty stub, so nothing reaches Google and the
 *     events can be read straight off window.dataLayer.
 */
const GA_ID = process.env.KK_E2E_GA_ID ?? '';
const SHOTS = 'test-results/screenshots';
const GOOGLE = /google-analytics\.com|googletagmanager\.com|analytics\.google\.com/;

/** Every request to a Google analytics host; gtag.js itself is answered with an empty script. */
async function watchGoogle(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route(GOOGLE, (route) => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  return seen;
}

type Entry = { cmd: string; name: string; params: Record<string, unknown> };

async function events(page: Page): Promise<Entry[]> {
  return page.evaluate(() => {
    const dl = ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((a) => Array.from(a));
    return dl.map((a) => ({ cmd: String(a[0]), name: String(a[1]), params: (a[2] ?? {}) as Record<string, unknown> }));
  });
}
const named = (list: Entry[], name: string) => list.filter((e) => e.cmd === 'event' && e.name === name);
const gaCookies = async (page: Page) => (await page.context().cookies()).filter((c) => c.name.startsWith('_ga'));

const banner = (page: Page) => page.getByRole('region', { name: 'Analytics choice' });
const accept = (page: Page) => banner(page).getByRole('button', { name: 'Accept analytics' });

test.describe('analytics off (no GA id)', () => {
  test.skip(!!GA_ID, 'server was started with a GA id');

  test('no banner, no Google requests, no cookies', async ({ page }) => {
    const seen = await watchGoogle(page);
    await page.goto('/gst-calculator');
    await page.getByLabel('Price before GST').fill('1000');
    await expect(page.getByText('₹1,180').first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    expect(seen).toEqual([]);
    expect(await gaCookies(page)).toEqual([]);
    expect(await events(page)).toEqual([]);
    await page.goto('/privacy');
    await expect(page.getByText(/Analytics is (on|off) in this browser/)).toHaveCount(0);
  });
});

test.describe('analytics with consent', () => {
  test.skip(!GA_ID, 'set KK_E2E_GA_ID=G-E2ETEST1 to run');

  test('nothing is sent or set before a choice, and "No thanks" keeps it that way', async ({ page }) => {
    const seen = await watchGoogle(page);
    await page.goto('/gst-calculator');
    await expect(banner(page)).toBeVisible();
    await page.getByLabel('Price before GST').fill('1000');
    await page.waitForTimeout(500);
    expect(seen).toEqual([]);
    expect(await events(page)).toEqual([]);

    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.goto('/word-counter');
    await page.waitForTimeout(500);
    expect(seen).toEqual([]);
    expect(await events(page)).toEqual([]);
    await expect(banner(page)).toHaveCount(0); // remembered
    expect(await gaCookies(page)).toEqual([]);
  });

  test('Accept: one page_view per page, tool events, and no personal data', async ({ page }) => {
    const seen = await watchGoogle(page);
    await page.goto('/gst-calculator?secret=abc#frag');
    await accept(page).click();
    await expect(banner(page)).toHaveCount(0);
    await expect.poll(() => seen.some((u) => u.includes('gtag/js') && u.includes(GA_ID))).toBe(true);

    let list = await events(page);
    const config = list.find((e) => e.cmd === 'config');
    expect(config?.params).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const consent = list.filter((e) => e.cmd === 'consent');
    expect(consent.map((e) => e.name)).toEqual(['default', 'update']);
    expect(consent[0].params).toMatchObject({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });

    expect(named(list, 'page_view')).toHaveLength(1);
    expect(named(list, 'page_view')[0].params).toMatchObject({ page_path: '/gst-calculator' });
    expect(JSON.stringify(list)).not.toContain('secret');
    expect(named(list, 'tool_open').map((e) => e.params)).toEqual([{ tool_name: 'gst-calculator', tool_category: 'money' }]);
    expect(named(list, 'tool_success')).toHaveLength(0);

    await page.getByLabel('Price before GST').fill('98765');
    await expect(page.getByText('₹1,16,542').first()).toBeVisible();
    await page.getByLabel('Price before GST').fill('98766');
    list = await events(page);
    expect(named(list, 'tool_success').map((e) => e.params)).toEqual([
      { tool_name: 'gst-calculator', tool_category: 'money', tool_type: 'calculator' },
    ]); // once, not per keystroke
    expect(JSON.stringify(list)).not.toMatch(/98765|98766|116542|1,16,542/);

    // Today every internal link is a plain <a> (a full page load, so a fresh dataLayer). A client-side
    // route change — Next's history integration, as a future <Link> would trigger — must still give
    // exactly one more page_view, and re-rendering on the same path none.
    await page.evaluate(() => window.history.pushState(null, '', '/tools?x=1'));
    await expect.poll(async () => named(await events(page), 'page_view').length).toBe(2);
    await page.evaluate(() => window.history.replaceState(null, '', '/tools?x=2'));
    await page.waitForTimeout(300);
    list = await events(page);
    expect(named(list, 'page_view').map((e) => e.params.page_path)).toEqual(['/gst-calculator', '/tools']);

    // A real navigation to another page: that page's own single page_view.
    await page.goto('/tools');
    await expect.poll(async () => named(await events(page), 'page_view').length).toBe(1);
    await page.waitForTimeout(300);
    list = await events(page);
    expect(named(list, 'page_view').map((e) => e.params.page_path)).toEqual(['/tools']);

    // Outbound link: the domain only.
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = 'https://example.org/some/private/path?x=1';
      a.textContent = 'out';
      a.addEventListener('click', (e) => e.preventDefault());
      document.body.appendChild(a);
      a.click();
    });
    list = await events(page);
    expect(named(list, 'outbound_click').map((e) => e.params)).toEqual([{ link_domain: 'example.org' }]);
  });

  test('words typed into a text tool are never sent', async ({ page }) => {
    await watchGoogle(page);
    await page.goto('/word-counter');
    await accept(page).click();
    await page.getByLabel('Your text').fill('my private sentence');
    await expect.poll(async () => named(await events(page), 'tool_success').length).toBe(1);
    expect(JSON.stringify(await events(page))).not.toContain('private');
  });

  test('image converter: success and download send only the extension', async ({ page }) => {
    await watchGoogle(page);
    await page.goto('/png-to-jpg');
    await accept(page).click();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.locator('input[type=file]').first().setInputFiles({ name: 'my-passport-photo.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: /^Convert/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download/ }).first().click();
    await download;
    const list = await events(page);
    expect(named(list, 'tool_success')).toHaveLength(1);
    expect(named(list, 'file_download').map((e) => e.params)).toEqual([
      { tool_name: 'png-to-jpg', tool_category: 'images-files', file_ext: 'jpg' },
    ]);
    expect(JSON.stringify(list)).not.toContain('passport');
  });

  test('the Privacy page shows the choice and can withdraw it (cookies removed)', async ({ page }) => {
    await watchGoogle(page);
    await page.goto('/privacy');
    await accept(page).click();
    await expect(page.getByText('Analytics is on in this browser.')).toBeVisible();
    await page.context().addCookies([{ name: '_ga', value: 'GA1.1.1.1', url: page.url() }]);
    await page.getByRole('button', { name: 'Turn analytics off' }).click();
    await expect(page.getByText('Analytics is off in this browser.')).toBeVisible();
    expect(await gaCookies(page)).toEqual([]);
    await page.getByRole('button', { name: 'Turn analytics on' }).click();
    await expect(page.getByText('Analytics is on in this browser.')).toBeVisible();
  });

  test('withdrawing stops everything: this page, later navigation and reloads', async ({ page }) => {
    const seen = await watchGoogle(page);
    await page.goto('/privacy');
    await accept(page).click();
    await expect.poll(() => seen.some((u) => u.includes('gtag/js'))).toBe(true);
    await page.getByRole('button', { name: 'Turn analytics off' }).click();
    await expect(page.getByText('Analytics is off in this browser.')).toBeVisible();

    // Same page, client-side route change, an outbound click: no events.
    const before = (await events(page)).length;
    const requests = seen.length;
    await page.evaluate(() => window.history.pushState(null, '', '/tools'));
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = 'https://example.org/';
      a.addEventListener('click', (e) => e.preventDefault());
      document.body.appendChild(a);
      a.click();
    });
    await page.waitForTimeout(500);
    expect((await events(page)).length).toBe(before);
    expect(seen.length).toBe(requests);

    // New documents: nothing is installed, loaded or sent.
    for (const path of ['/gst-calculator', '/word-counter']) {
      const n = seen.length;
      await page.goto(path);
      await page.waitForTimeout(500);
      expect(await events(page)).toEqual([]);
      expect(seen.length).toBe(n);
      await expect(banner(page)).toHaveCount(0);
    }
    await page.reload();
    await page.waitForTimeout(500);
    expect(await events(page)).toEqual([]);
    expect(await gaCookies(page)).toEqual([]);
    expect(await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag)).toBe('undefined');
  });

  test('saying yes again after withdrawing works on the same page', async ({ page }) => {
    await watchGoogle(page);
    await page.goto('/privacy');
    await accept(page).click();
    await page.getByRole('button', { name: 'Turn analytics off' }).click();
    await page.getByRole('button', { name: 'Turn analytics on' }).click();
    expect(await page.evaluate((id) => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`], GA_ID)).toBe(false);
    await page.evaluate(() => window.history.pushState(null, '', '/tools'));
    await expect.poll(async () => named(await events(page), 'page_view').map((e) => e.params.page_path)).toContain('/tools');
  });

  test('every live tool page opens once with its own slug and category', async ({ page }) => {
    test.setTimeout(240_000);
    await watchGoogle(page);
    await page.addInitScript(() => localStorage.setItem('kaamsolv-analytics', 'granted'));
    for (const tool of LIVE_TOOLS) {
      await page.goto(tool.url);
      await expect.poll(async () => named(await events(page), 'tool_open').length, { message: tool.slug }).toBe(1);
      const list = await events(page);
      expect(named(list, 'tool_open')[0].params).toMatchObject({ tool_name: tool.slug });
      expect(named(list, 'page_view')).toHaveLength(1);
    }
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`banner looks right at 375px (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 375, height: 760 });
      await watchGoogle(page);
      await page.goto('/gst-calculator');
      await expect(banner(page)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      const heights = await banner(page)
        .getByRole('button')
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(heights.every((h) => h >= 44)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/analytics-banner-${scheme}-375.png` });
    });
  }
});
