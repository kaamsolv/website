import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * The "recent tools" bar under the header, and "Recent" in the search box: a device-only list of the tools a person has opened
 * (app/lib/recent-tools.ts, docs/products/recent-tools.md). A first visit looks exactly as before; the list never reaches a
 * server and sets no cookie; the bar shows on the home page and /tools only, scrolls when it does not fit, can be hidden until the
 * next visit to the home page, reserves its space so nothing jumps, and broken or blocked storage never breaks a page.
 */
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const KEY = 'kaamsolv-recent-tools';

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const bar = (page: Page) => page.getByTestId('recent-bar');
const chips = (page: Page) => bar(page).getByRole('link');
const row = (page: Page) => bar(page).locator('[data-scroll-row]');
const storedSlugs = (page: Page) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw).tools as { s: string }[]).map((t) => t.s) : [];
  }, KEY);

/** Opens a tool and waits until the page has remembered it. */
async function use(page: Page, path: string, slug: string) {
  await page.goto(path);
  await expect.poll(() => storedSlugs(page)).toContain(slug);
}

/** Starts the page with a stored list, before any script runs (once per tab, so a reload does not undo a Clear). */
async function seed(page: Page, tools: { s: string; t: number; n: number }[]) {
  await page.addInitScript(
    ([k, v]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(k, v);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [KEY, JSON.stringify({ v: 1, tools })] as const,
  );
}

const now = Date.now();
const HISTORY = [
  { s: 'coupon-code-generator', t: now - 60_000, n: 1 },
  { s: 'merge-pdf', t: now - 3_600_000, n: 5 },
  { s: 'qr-code-generator', t: now - 2 * 86_400_000, n: 8 },
  { s: 'invoice-generator', t: now - 9 * 86_400_000, n: 3 },
  { s: 'compress-pdf', t: now - 12 * 86_400_000, n: 1 },
];
const FEW = [
  { s: 'coupon-code-generator', t: now - 60_000, n: 1 },
  { s: 'merge-pdf', t: now - 3_600_000, n: 2 },
];
const MANY = ['invoice-generator', 'qr-code-generator', 'merge-pdf', 'split-pdf', 'compress-pdf', 'coupon-code-generator', 'jpg-to-pdf', 'pdf-to-jpg', 'protect-pdf', 'rotate-pdf', 'heic-to-jpg', 'gst-calculator'].map((s, i) => ({ s, t: now - (i + 1) * 60_000, n: 1 }));

test('a first visit looks exactly as before: no bar, no reserved space, the usual suggestions, no cookie', async ({ page, context }) => {
  for (const path of ['/', '/tools']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-recent', '1');
    expect(await page.locator('.recent-slot').evaluate((el) => getComputedStyle(el).display)).toBe('none');
  }
  await page.goto('/');
  await page.locator('#hero-search').focus();
  await expect(page.getByText('Try one of these')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(6);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe('');
});

test('opening tools fills the bar, newest first, labelled by what you did; a click goes back to the tool', async ({ page, context }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  await use(page, '/invoice-generator', 'invoice-generator');
  await use(page, '/qr-code-generator', 'qr-code-generator');
  await use(page, '/merge-pdf', 'merge-pdf');
  await use(page, '/coupon-code-generator', 'coupon-code-generator');
  await page.goto('/');
  await expect(bar(page)).toBeVisible();
  await expect(chips(page)).toHaveCount(4);
  await expect(chips(page).nth(0)).toContainText('Make coupon codes');
  await expect(chips(page).nth(1)).toContainText('Combine PDFs into one');
  await expect(chips(page).nth(2)).toContainText('Make a QR code');
  await expect(chips(page).nth(3)).toContainText('Make an invoice');
  await expect(page.getByTestId('recent-switch')).toHaveText('Recent');
  await chips(page).nth(1).click();
  await expect(page).toHaveURL(/\/merge-pdf$/);
  expect(await context.cookies(), 'no cookie is set').toEqual([]);
  expect(sent, 'nothing is sent anywhere').toEqual([]);
});

test('the bar sits directly under the header and the old home-page row is gone', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/');
  await expect(bar(page)).toBeVisible();
  const header = (await page.locator('header.site-header').boundingBox())!;
  const b = (await bar(page).boundingBox())!;
  expect(Math.abs(b.y - (header.y + header.height))).toBeLessThanOrEqual(1);
  expect(b.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 20); // full width
  expect(Math.round(b.height)).toBeLessThanOrEqual(46); // one slim line
  await expect(page.getByRole('heading', { name: 'Pick up where you left off' })).toHaveCount(0);
});

test('it shows on the home page and /tools, and nowhere else: not in a tool, not on other pages', async ({ page }) => {
  await seed(page, HISTORY);
  for (const [path, shown] of [['/', true], ['/tools', true], ['/merge-pdf', false], ['/coupon-code-generator', false], ['/qr-code-generator', false], ['/pdf-tools', false], ['/about', false], ['/privacy', false], ['/login', false]] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(bar(page), path).toHaveCount(shown ? 1 : 0);
  }
});

test('the same tool opened again moves up but one visit is one use', async ({ page }) => {
  await use(page, '/merge-pdf', 'merge-pdf');
  await use(page, '/split-pdf', 'split-pdf');
  await page.goto('/merge-pdf');
  // merge-pdf is already in the list, so wait for the page to move it to the front rather than for it to appear.
  await expect.poll(() => storedSlugs(page)).toEqual(['merge-pdf', 'split-pdf']);
  const list = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).tools as { s: string; n: number }[], KEY);
  expect(list[0].n, 'two openings a minute apart are one use').toBe(1);
});

test('the switch opens a small panel: Recent or Most used, and Clear; Escape and a click outside close it', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/');
  const sw = page.getByTestId('recent-switch');
  await sw.click();
  const panel = page.getByTestId('recent-panel');
  await expect(panel).toBeVisible();
  await expect(sw).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('radio', { name: 'Recent' })).toBeChecked();
  await expect(panel.getByRole('button', { name: 'Clear recent tools' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(sw).toBeFocused();
  await sw.click();
  await page.locator('#hero-title').click({ position: { x: 420, y: 6 } });
  await expect(panel).toHaveCount(0);
  await sw.click();
  // choosing closes the panel as it acts, so click the label rather than "check" (which would look for the radio afterwards)
  await panel.locator('label').filter({ hasText: /^Most used$/ }).click();
  await expect(panel).toHaveCount(0);
  await expect(sw).toHaveText('Most used');
  await expect(chips(page)).toHaveCount(3); // 8 uses, 5 uses, 3 uses; the others are under 3
  await expect(chips(page).nth(0)).toContainText('Make a QR code');
  await expect(chips(page).nth(1)).toContainText('Combine PDFs into one');
  await expect(chips(page).nth(2)).toContainText('Make an invoice');
  await expect(chips(page).nth(0)).toHaveAttribute('title', 'QR Code Generator · Used 8 times');
  await sw.click();
  await panel.locator('label').filter({ hasText: /^Recent$/ }).click();
  await expect(chips(page)).toHaveCount(5);
});

test('with no tool used three times there is no Most used choice, only Clear', async ({ page }) => {
  await seed(page, FEW);
  await page.goto('/');
  await page.getByTestId('recent-switch').click();
  const panel = page.getByTestId('recent-panel');
  await expect(panel.getByRole('radio')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Clear recent tools' })).toBeVisible();
});

test('Clear forgets everything, says so, puts focus on the page title, and the bar returns with the next tool', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/');
  await page.getByTestId('recent-switch').click();
  await page.getByTestId('recent-clear').click();
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Recent tools cleared.' })).toHaveCount(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  await expect(page.locator('h1')).toBeFocused();
  await page.reload();
  await expect(bar(page)).toHaveCount(0);
  await page.locator('#hero-search').focus();
  await expect(page.getByRole('option')).toHaveCount(6);
  await use(page, '/split-pdf', 'split-pdf');
  await page.goto('/');
  await expect(chips(page)).toHaveCount(1);
});

test('Clear works from the keyboard alone', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/');
  await page.getByTestId('recent-switch').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('recent-panel')).toBeVisible();
  await expect(page.getByTestId('recent-panel').getByRole('radio', { name: 'Recent' })).toBeFocused();
  await page.getByTestId('recent-clear').focus();
  await page.keyboard.press('Enter');
  await expect(bar(page)).toHaveCount(0);
});

test('the close button hides the bar while you work elsewhere, and the home page always brings it back', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/');
  await expect(bar(page)).toBeVisible();
  await page.getByRole('button', { name: 'Hide recent tools' }).click();
  await expect(bar(page)).toHaveCount(0);
  expect(await page.locator('.recent-slot').evaluate((el) => getComputedStyle(el).display), 'the space closes up').toBe('none');
  await page.goto('/tools');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(bar(page), 'still hidden on /tools').toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-recent', '1');
  await page.goto('/merge-pdf');
  await page.goto('/');
  await expect(bar(page), 'back on the home page').toBeVisible();
  // and hiding it on /tools lasts until the next visit to the home page too
  await page.goto('/tools');
  await expect(bar(page)).toBeVisible();
  await page.getByRole('button', { name: 'Hide recent tools' }).click();
  await page.reload();
  await expect(bar(page)).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide recent tools' }).click();
  await page.reload();
  await expect(bar(page), 'a fresh visit to the home page shows it again').toBeVisible();
});

test('too many tools to fit: one line that scrolls (arrows, wheel, keyboard) and never wraps or widens the page', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await seed(page, MANY);
  await page.goto('/');
  await expect(chips(page)).toHaveCount(12);
  const r = row(page);
  const overflows = () => r.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
  expect(await overflows(), 'the chips do not all fit, so the row scrolls').toBe(true);
  expect(Math.round((await bar(page).boundingBox())!.height), 'still one slim line').toBeLessThanOrEqual(46);
  expect(await sideways(page)).toBe(false);
  await expect(bar(page).locator('[data-scroll-right]')).toBeVisible();
  await expect(bar(page).locator('[data-scroll-left]')).toHaveCount(0);

  // the arrow button
  await bar(page).locator('[data-scroll-right]').click();
  await expect.poll(() => r.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await expect(bar(page).locator('[data-scroll-left]')).toBeVisible();
  await bar(page).locator('[data-scroll-left]').click();
  await expect.poll(() => r.evaluate((el) => el.scrollLeft)).toBe(0);

  // the mouse wheel moves it sideways while the pointer is over it
  const box = (await r.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => r.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);

  // the keyboard: Tab through every chip; each one is brought into view
  await r.evaluate((el) => (el.scrollLeft = 0));
  await chips(page).first().focus();
  for (let i = 0; i < 11; i++) await page.keyboard.press('Tab');
  await expect(chips(page).last()).toBeFocused();
  const rb = (await r.boundingBox())!;
  const lb = (await chips(page).last().boundingBox())!;
  expect(lb.x + lb.width, 'the last chip was scrolled into view').toBeLessThanOrEqual(rb.x + rb.width + 1);
  expect(lb.x).toBeGreaterThanOrEqual(rb.x - 1);
  expect(await sideways(page)).toBe(false);
});

test('a few tools fit without scrolling: no arrows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, FEW);
  await page.goto('/');
  await expect(chips(page)).toHaveCount(2);
  await expect(bar(page).locator('[data-scroll-right], [data-scroll-left]')).toHaveCount(0);
});

test('the page does not jump when the bar appears: its space is reserved from the first paint', async ({ page }) => {
  await seed(page, HISTORY);
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { __top: number }).__top = document.querySelector('#hero-title')!.closest('section')!.getBoundingClientRect().top;
    });
  });
  await page.goto('/');
  await expect(bar(page)).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __top: number }).__top);
  const after = await page.evaluate(() => document.querySelector('#hero-title')!.closest('section')!.getBoundingClientRect().top);
  expect(Math.abs(before - after), `the hero moved from ${before} to ${after}`).toBeLessThanOrEqual(1);
});

test('the search box offers Recent first, then three suggestions; the keyboard walks all six', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/');
  const search = page.locator('#hero-search');
  await search.focus();
  await expect(page.getByRole('listbox')).toBeVisible();
  const options = page.getByRole('option');
  await expect(options).toHaveCount(6);
  await expect(page.getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveCount(3);
  await expect(page.getByRole('group', { name: 'Try one of these' }).getByRole('option')).toHaveCount(3);
  await expect(options.nth(0)).toContainText('Make coupon codes');
  await expect(options.nth(1)).toContainText('Combine PDFs into one');
  await expect(options.nth(2)).toContainText('Make a QR code');
  const names = await options.allTextContents();
  expect(new Set(names.map((n) => n.split('·')[0])).size).toBe(6);
  await search.press('ArrowDown');
  await search.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/merge-pdf$/);
});

test('typing still searches the whole catalogue, whatever the history says', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/');
  const search = page.locator('#hero-search');
  await search.fill('make an invoice');
  await expect(page.getByText('Best matches')).toBeVisible();
  await expect(page.getByRole('option').first()).toContainText('Make an invoice');
  await expect(page.getByRole('listbox').getByText('Recent', { exact: true })).toHaveCount(0);
});

test('broken, odd or hostile stored data is ignored: the page works and shows nothing it should not', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  for (const bad of ['{{{{ not json', '[]', '{"v":9}', '{"v":1,"tools":[{"s":"<img src=x onerror=alert(1)>","t":1,"n":1},{"s":"random-number-generator","t":9,"n":9},{"s":"nope","t":9,"n":9}]}']) {
    const p = await page.context().newPage();
    p.on('pageerror', (e) => problems.push(e.message));
    await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, bad] as const);
    await p.goto('/');
    await expect(p.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(p.getByTestId('recent-bar')).toHaveCount(0);
    // The page guesses from the stored text before it loads, so the space can be held for a moment; once loaded it must close up.
    await expect(p.locator('.recent-slot')).toHaveAttribute('data-open', 'false');
    expect(await p.locator('.recent-slot').evaluate((el) => getComputedStyle(el).display), 'no space is left behind').toBe('none');
    await p.locator('#hero-search').focus();
    await expect(p.getByRole('option')).toHaveCount(6);
    await p.close();
  }
  expect(problems).toEqual([]);
});

test('storage that is blocked or full never breaks a page', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript(() => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.getItem = boom;
    Storage.prototype.setItem = boom;
    Storage.prototype.removeItem = boom;
  });
  await page.goto('/coupon-code-generator');
  await expect(page.getByRole('heading', { level: 1, name: 'Coupon code generator' })).toBeVisible();
  await expect(page.getByTestId('coupon-sample').locator('li').first()).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/tools');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('signed in: the invoice and QR workspace pages count, and the bar stays out of the workspace', async ({ page }) => {
  const address = `recent-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
  await page.goto('/app/invoices');
  await expect.poll(() => storedSlugs(page)).toContain('invoice-generator');
  await expect(bar(page)).toHaveCount(0);
  await page.goto('/app/qr');
  await expect.poll(() => storedSlugs(page)).toEqual(['qr-code-generator', 'invoice-generator']);
  await page.goto('/app/billing'); // not a tool: nothing is added
  await page.waitForTimeout(300);
  expect(await storedSlugs(page)).toEqual(['qr-code-generator', 'invoice-generator']);
  await page.goto('/');
  await expect(chips(page)).toHaveCount(2);
});

test('the privacy page says what is kept', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByText('which tools you used lately')).toBeVisible();
  await expect(page.getByText('never what you typed or made')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 360, 320]) {
    test.describe(`phone ${width}px ${scheme}`, () => {
      test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });

      test('the bar fits on one line, touch targets are 44px, it scrolls, the panel fits, no sideways scroll', async ({ page }) => {
        mkdirSync(SHOTS, { recursive: true });
        await page.emulateMedia({ colorScheme: scheme });
        await seed(page, [...HISTORY, ...MANY.slice(5).map((t, i) => ({ ...t, t: now - (20 + i) * 86_400_000 }))]);
        await page.goto('/');
        await expect(bar(page)).toBeVisible();
        expect(await sideways(page), 'bar').toBe(false);
        const b = (await bar(page).boundingBox())!;
        expect(Math.round(b.height), 'a touch-sized single line').toBe(52);
        for (const el of [page.getByTestId('recent-switch'), page.getByRole('button', { name: 'Hide recent tools' }), ...(await chips(page).all())]) {
          const box = (await el.boundingBox())!;
          if (box.x + box.width <= width + 1 && box.x >= -1) expect(box.height, 'touch target').toBeGreaterThanOrEqual(44);
        }
        const hide = (await page.getByRole('button', { name: 'Hide recent tools' }).boundingBox())!;
        expect(hide.x + hide.width, 'the close button stays on screen').toBeLessThanOrEqual(width);
        expect(hide.width).toBeGreaterThanOrEqual(44);
        const r = row(page);
        expect(await r.evaluate((el) => el.scrollWidth > el.clientWidth + 2), 'the chips scroll sideways').toBe(true);
        await r.evaluate((el) => (el.scrollLeft = 200));
        await expect.poll(() => r.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
        expect(await sideways(page), 'after scrolling the row').toBe(false);
        await page.screenshot({ path: `${SHOTS}/recent-bar-${width}-${scheme}.png`, clip: { x: 0, y: 0, width, height: 180 } });
        await page.getByTestId('recent-switch').click();
        const panel = (await page.getByTestId('recent-panel').boundingBox())!;
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width, 'the panel fits the screen').toBeLessThanOrEqual(width);
        await page.screenshot({ path: `${SHOTS}/recent-panel-${width}-${scheme}.png`, clip: { x: 0, y: 0, width, height: 320 } });
        expect(await sideways(page), 'panel open').toBe(false);
      });
    });
  }
}
