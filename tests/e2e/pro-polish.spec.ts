import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Invoice Pro screens at phone widths (360 and 320), light and dark, with the interesting views open: nothing in the
 * page content may run off the right edge, and each screen needs a heading, labelled controls and no empty buttons.
 * Screenshots go to test-results/screenshots for a human look.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const pad = (n: number) => String(n).padStart(2, '0');
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // Inside a scroller on purpose (a wide table): fine.
        for (let p: Element | null = e.parentElement; p && p.tagName !== 'MAIN'; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden') return false;
        }
        return r.right > window.innerWidth + 1;
      })
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`)
      .slice(0, 6),
  );
}
async function unlabelled(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('main button, main input:not([type=hidden]), main select, main textarea, main a[href]')]
      .filter((e) => {
        const el = e as HTMLElement;
        if (el.offsetParent === null) return false;
        const name = (el.getAttribute('aria-label') ?? '') + (el.getAttribute('aria-labelledby') ? 'x' : '') + (el.textContent ?? '').trim() + ((el as HTMLInputElement).labels?.length ? 'x' : '') + (el.getAttribute('title') ?? '');
        return name.trim() === '';
      })
      .map((e) => `${e.tagName}#${e.id}`)
      .slice(0, 6),
  );
}

test('the Invoice Pro screens fit 360px and 320px, light and dark, with their views open', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(SHOTS, { recursive: true });
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const address = `pro-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  expect((await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } })).status()).toBe(200);

  const doc = {
    number: 'PL-1', issueDate: daysAgo(40), dueDate: daysAgo(10), currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: 'Acme Traders', address: 'Bengaluru', email: 'accounts@acme.example.test' },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate: '20000' }],
    discountType: 'percent', discountValue: '', taxLabel: 'GST', taxRate: '18', notes: '',
  };
  const saved = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc } });
  expect(saved.status(), await saved.text()).toBe(201);
  const id = ((await saved.json()) as { id: string }).id;

  const screens: { name: string; path: string; open?: (p: Page) => Promise<void> }[] = [
    { name: 'invoice', path: `/app/invoices/${id}` },
    { name: 'collections', path: '/app/invoices/collections' },
    { name: 'accountant', path: '/app/invoices/accountant' },
    { name: 'clients', path: '/accountant/clients' },
  ];
  const problems: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const s of screens) {
        await page.goto(s.path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main h1').first(), `${s.name} has a heading`).toBeVisible();
        for (const sel of ['[data-testid=reminder-panel] summary', '[data-testid=recurring-auto-on]']) {
          const t = page.locator(sel).first();
          if (await t.count()) await t.click({ trial: false }).catch(() => undefined);
        }
        const over = await overflowing(page);
        if (over.length) problems.push(`${scheme} ${width}px ${s.name}: ${over.join(', ')}`);
        const bad = await unlabelled(page);
        if (bad.length) problems.push(`${scheme} ${width}px ${s.name} unlabelled: ${bad.join(', ')}`);
        if (scheme === 'light' || width === 320) await page.screenshot({ path: `${SHOTS}/polish-${s.name}-${scheme}-${width}.png`, fullPage: true });
      }
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
  await ctx.close();
});
