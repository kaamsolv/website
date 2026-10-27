import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Billing M2 in the browser: Share on WhatsApp and the private invoice page (/i/<token>). The email, the
 * Razorpay-created invoice and the retries need a payment and are covered against real Postgres in
 * test/billing-invoices.test.mts; this is the part a person touches.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
function doc(over: Record<string, unknown> = {}) {
  return {
    number: 'INV-0001', issueDate: '2026-10-20', dueDate: '2026-11-05', currency: 'INR',
    seller: { name: 'ABC Studio', address: '12 MG Road, Pune', email: '', phone: '' },
    client: { name: 'Rahul Sharma', address: 'Bengaluru', email: '', phone: '98765 43210' },
    items: [{ id: 'i1', description: 'Brand identity', qty: '1', rate: '10000' }],
    discountType: 'percent', discountValue: '', taxLabel: 'Tax', taxRate: '18', notes: 'Thank you.',
    ...over,
  };
}
async function save(page: Page, over: Record<string, unknown> = {}): Promise<string> {
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: doc(over) } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
const link = async (page: Page, id: string, method: 'GET' | 'POST' | 'DELETE') =>
  page.request.fetch(`/api/invoices/${id}/link`, { method, headers: method === 'GET' ? {} : ORIGIN });

test('share an invoice: make a link, get the WhatsApp message, open it signed out, download the PDF, turn it off', async ({ page, browser }) => {
  await mkdir(SHOTS, { recursive: true });
  await signIn(page, email('share'));
  // The client's phone lives on the saved customer, which the invoice is linked to.
  const cust = await page.request.post('/api/customers', { headers: ORIGIN, data: { name: 'Rahul Sharma', phone: '98765 43210' } });
  expect(cust.status(), await cust.text()).toBe(201);
  const customerId = ((await cust.json()) as { id: string }).id;
  const id = await save(page, { customerId });

  await page.goto(`/app/invoices/${id}`);
  const panel = page.getByTestId('invoice-share');
  await expect(panel).toContainText('Anyone who has the link can open this invoice until you turn it off');
  await expect(page.getByTestId('share-url')).toHaveCount(0);

  // Copy link makes the link and shows it.
  await panel.getByTestId('share-copy').click();
  const shown = page.getByTestId('share-url');
  await expect(shown).toContainText('/i/');
  const url = ((await shown.textContent()) ?? '').trim();
  expect(url).toMatch(/\/i\/[A-Za-z0-9_-]{22}$/);

  // The WhatsApp message and address, built from the invoice.
  const api = (await (await link(page, id, 'GET')).json()) as { url: string; whatsapp: { message: string; href: string; hasClientNumber: boolean } };
  expect(api.url).toBe(url);
  expect(api.whatsapp.hasClientNumber).toBe(true);
  expect(api.whatsapp.message).toContain('Hi Rahul, your invoice from ABC Studio is ready.');
  expect(api.whatsapp.message).toContain('Invoice: INV-0001');
  expect(api.whatsapp.message).toContain('Amount: ₹11,800.00');
  expect(api.whatsapp.message).toContain('Due date: 5 Nov 2026');
  expect(api.whatsapp.message).toContain(`View invoice: ${url}`);
  expect(api.whatsapp.href.startsWith('https://wa.me/919876543210?text=')).toBe(true);
  expect(decodeURIComponent(api.whatsapp.href.split('?text=')[1])).toBe(api.whatsapp.message);

  // Share on WhatsApp opens a new tab (its address is checked above; the page itself is WhatsApp's).
  const [popup] = await Promise.all([page.waitForEvent('popup'), panel.getByTestId('share-whatsapp').click()]);
  expect(popup).toBeTruthy();
  await popup.close();

  // A stranger with no sign-in opens it.
  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  const res = await sp.goto(url);
  expect(res?.status()).toBe(200);
  await expect(sp.getByRole('heading', { level: 1 })).toContainText(/invoice/i);
  await expect(sp.getByText('ABC Studio')).toBeVisible();
  await expect(sp.getByText('Rahul Sharma')).toBeVisible();
  await expect(sp.getByText('INV-0001')).toBeVisible();
  await expect(sp.getByText('₹11,800.00').first()).toBeVisible();
  await expect(sp.getByTestId('invoice-status')).toHaveText('Unpaid');
  expect(await sp.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  expect(await sp.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer');
  const html = await sp.content();
  expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); // no database ids on the page
  await sp.screenshot({ path: `${SHOTS}/invoice-link-desktop.png`, fullPage: true });

  // The PDF.
  const pdf = await stranger.request.get(`${url}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect(pdf.headers()['cache-control']).toContain('no-store');
  expect(pdf.headers()['x-robots-tag']).toContain('noindex');
  const bytes = await pdf.body();
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const text = bytes.toString('latin1');
  expect(text).toContain('INV-0001');
  expect(text).toContain('Rs. 11,800.00');

  // Turn it off: the same address is now a plain 404, for the page and the PDF.
  await page.goto(`/app/invoices/${id}`);
  await page.getByTestId('share-off').click();
  await expect(page.getByTestId('share-note')).toContainText('Link turned off');
  expect((await stranger.request.get(url)).status()).toBe(404);
  expect((await stranger.request.get(`${url}/pdf`)).status()).toBe(404);
  await stranger.close();
});

test('wrong, short or made-up links are plain 404s, and nobody else can make or read a link for my invoice', async ({ page, browser, request }) => {
  await signIn(page, email('owner'));
  const id = await save(page);
  for (const bad of ['short', 'x'.repeat(22), '0'.repeat(22), 'a'.repeat(40)]) {
    expect((await request.get(`/i/${bad}`)).status(), bad).toBe(404);
    expect((await request.get(`/i/${bad}/pdf`)).status(), bad).toBe(404);
  }

  expect((await request.get(`/api/invoices/${id}/link`)).status()).toBe(401);
  const other = await browser.newContext();
  const op = await other.newPage();
  await signIn(op, email('other'));
  expect((await link(op, id, 'GET')).status()).toBe(404);
  expect((await link(op, id, 'POST')).status()).toBe(404);
  expect((await link(op, id, 'DELETE')).status()).toBe(404);
  expect((await link(page, '00000000-0000-4000-8000-000000000000', 'GET')).status()).toBe(404);
  expect((await link(page, 'not-an-id', 'GET')).status()).toBe(404);
  // A cross-site POST is refused even when signed in.
  const cross = await page.request.post(`/api/invoices/${id}/link`, { headers: { origin: 'https://evil.example' } });
  expect(cross.status()).toBe(403);
  await other.close();
});

test('the link page works on a phone, in light and dark, with no sideways scroll', async ({ page, browser }) => {
  await signIn(page, email('phone'));
  const id = await save(page);
  const made = (await (await link(page, id, 'POST')).json()) as { url: string };
  for (const scheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(made.url);
    await expect(p.getByTestId('invoice-pdf')).toBeVisible();
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await p.screenshot({ path: `${SHOTS}/invoice-link-phone-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
});
