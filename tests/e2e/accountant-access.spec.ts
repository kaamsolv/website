import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

/**
 * A named accountant's read-only access, end to end: the owner invites, the invited person signs in as that address
 * and accepts, reads one business, and is refused everything else. No real email is sent (dev mail outbox). The rules
 * are tested against real Postgres in test/accountant-access.test.mts.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const pad = (n: number) => String(n).padStart(2, '0');
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const lastMonthDay = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-05`;
};

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
async function newPerson(browser: import('@playwright/test').Browser, address: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await signIn(page, address);
  return { ctx, page };
}
const docOf = (number: string, issue: string) => ({
    number, issueDate: issue, dueDate: issue, currency: 'INR',
    seller: { name: 'Sharma Design Studio', address: '12 MG Road', email: '', phone: '' },
    client: { name: 'Acme Traders', address: 'Bengaluru', email: '' },
    items: [{ id: 'i1', description: 'Work', qty: '1', rate: '2000' }],
    discountType: 'percent', discountValue: '', taxLabel: 'GST', taxRate: '18', notes: '',
});
async function save(page: Page, number: string, issue: string): Promise<string> {
  const res = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: docOf(number, issue) } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
async function lastLinkTo(address: string, contains: string): Promise<string> {
  const text = await readFile('test-results/mail-outbox.jsonl', 'utf8').catch(() => '');
  const rows = text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { to: string; link: string }).filter((m) => m.to === address && m.link.includes(contains));
  expect(rows.length, `a mail to ${address} with ${contains}`).toBeGreaterThan(0);
  return rows[rows.length - 1].link;
}

test('invite, accept as the invited address, read one business, be refused everything else, and lose access the moment it is ended', async ({ browser }) => {
  await mkdir(SHOTS, { recursive: true });
  const caEmail = email('ca');
  const owner = await newPerson(browser, email('pro'));
  const ownerId = ((await (await owner.page.request.get('/api/me')).json()) as { user: { id: string } }).user.id;
  const invoiceId = await save(owner.page, 'AA-1', lastMonthDay());

  // The owner invites.
  await owner.page.goto('/app/invoices/accountant');
  await owner.page.getByLabel('Their name').fill('CA Mehta');
  await owner.page.getByLabel('Their email').fill(caEmail);
  await owner.page.getByTestId('access-invite').click();
  await expect(owner.page.getByTestId('access-msg')).toContainText('Invitation sent');
  await expect(owner.page.getByTestId('access-status')).toContainText('Invited, not accepted');
  const link = await lastLinkTo(caEmail, '/accountant/accept/');

  // A different signed-in person cannot use the link; it is not used up.
  const stranger = await newPerson(browser, email('stranger'));
  await stranger.page.goto(link);
  await expect(stranger.page.getByTestId('accept-wrong')).toBeVisible();
  const token = link.split('/').pop()!;
  const wrong = await stranger.page.request.post('/api/accountant-access/accept', { headers: ORIGIN, data: { token } });
  expect(wrong.status()).toBe(403);

  // The accountant, signed out, is asked to sign in as the invited address; then accepts.
  const ca = await newPerson(browser, 'placeholder-' + Date.now() + '@example.test');
  await ca.ctx.clearCookies();
  await ca.page.goto(link);
  await expect(ca.page.getByTestId('accept-signin')).toBeVisible();
  await ca.page.screenshot({ path: `${SHOTS}/access-accept.png`, fullPage: true });
  await signIn(ca.page, caEmail);
  await ca.page.goto(link);
  await ca.page.getByTestId('accept-invite').click();
  await expect(ca.page).toHaveURL(/\/accountant\/clients$/);
  await expect(ca.page.getByTestId('clients')).toBeVisible();
  expect((await ca.page.request.post('/api/accountant-access/accept', { headers: ORIGIN, data: { token } })).status()).toBe(404);

  // They read the books.
  await ca.page.getByTestId('clients').getByRole('link').first().click();
  await expect(ca.page.getByTestId('client-books')).toBeVisible();
  await expect(ca.page.getByTestId('books-table')).toContainText('AA-1');
  await ca.page.screenshot({ path: `${SHOTS}/access-books.png`, fullPage: true });
  await ca.page.getByTestId('tab-customers').click();
  await expect(ca.page.getByTestId('books-empty').or(ca.page.getByTestId('books-table'))).toBeVisible();
  const pack = await ca.page.request.get(`/api/accountant-access/pack?owner=${ownerId}`);
  expect(pack.status()).toBe(200);
  expect(pack.headers()['content-type']).toBe('application/zip');

  // Everything else is refused: other businesses, the owner's own routes, every write.
  const rnd = '11111111-1111-4111-8111-111111111111';
  expect((await ca.page.request.get(`/api/accountant-access/data?owner=${rnd}&view=register`)).status()).toBe(404);
  const strangerId = ((await (await stranger.page.request.get('/api/me')).json()) as { user: { id: string } }).user.id;
  expect((await ca.page.request.get(`/api/accountant-access/data?owner=${strangerId}&view=register`)).status()).toBe(404);
  expect((await ca.page.request.get(`/api/accountant-access/data?owner=${ownerId}&view=settings`)).status()).toBe(400);
  const own = (await (await ca.page.request.get('/api/invoices')).json()) as { invoices?: { number: string }[] };
  expect(JSON.stringify(own)).not.toContain('AA-1');
  const denied = async (res: Promise<import('@playwright/test').APIResponse>) => {
    const r = await res;
    expect([403, 404], `${r.url()} gave ${r.status()}`).toContain(r.status());
  };
  await denied(ca.page.request.get(`/api/invoices/${invoiceId}`));
  await denied(ca.page.request.put(`/api/invoices/${invoiceId}`, { headers: ORIGIN, data: { invoice: docOf('HACK', lastMonthDay()) } }));
  await denied(ca.page.request.delete(`/api/invoices/${invoiceId}`, { headers: ORIGIN }));
  await denied(ca.page.request.post(`/api/invoices/${invoiceId}/payments`, { headers: ORIGIN, data: { amount: '1', paidOn: todayLocal(), method: 'upi', reference: '', note: '', clientKey: crypto.randomUUID(), today: todayLocal() } }));
  await denied(ca.page.request.get(`/api/invoices/${invoiceId}/payments`));
  await denied(ca.page.request.post(`/api/invoices/${invoiceId}/reminders`, { headers: ORIGIN, data: {} }));
  await denied(ca.page.request.put(`/api/invoices/${invoiceId}/followup`, { headers: ORIGIN, data: { promisedOn: lastMonthDay() } }));
  await denied(ca.page.request.post(`/api/invoices/${invoiceId}/link`, { headers: ORIGIN, data: {} }));
  await denied(ca.page.request.post('/api/accountant-access/invite', { headers: ORIGIN, data: { name: 'Friend', email: email('friend') } }));
  await denied(ca.page.request.post('/api/accountant-access/revoke', { headers: ORIGIN, data: { id: rnd } }));
  const mine = (await (await ca.page.request.get('/api/accountant')).json()) as { settings: unknown };
  expect(mine.settings, 'their own Accountant Connect, not the owner’s').toBeNull();
  expect((await ca.page.request.get(`/api/accountant/pack`)).status()).toBe(403);
  expect((await ca.page.request.get('/api/billing/status')).status()).not.toBe(500);

  // Signed-out requests get nothing.
  const anon = await browser.newContext({ baseURL: BASE });
  const ap = await anon.newPage();
  expect((await ap.request.get(`/api/accountant-access/data?owner=${ownerId}&view=meta`)).status()).toBe(401);
  expect((await ap.request.get(`/api/accountant-access/pack?owner=${ownerId}`)).status()).toBe(401);
  await anon.close();

  // The owner sees what they did, then ends access: the next click fails.
  await owner.page.reload();
  await expect(owner.page.getByTestId('access-events')).toContainText('Opened');
  await expect(owner.page.getByTestId('access-events')).toContainText('Downloaded a pack');
  await owner.page.screenshot({ path: `${SHOTS}/access-owner.png`, fullPage: true });
  await owner.page.getByTestId('access-revoke').click();
  await owner.page.getByTestId('access-revoke-yes').click();
  await expect(owner.page.getByTestId('access-msg')).toContainText('Access ended');
  expect((await ca.page.request.get(`/api/accountant-access/data?owner=${ownerId}&view=register`)).status()).toBe(404);
  expect((await ca.page.request.get(`/api/accountant-access/pack?owner=${ownerId}`)).status()).toBe(404);
  expect((await ca.page.goto(`/accountant/clients/${ownerId}`))?.status()).toBe(404);
  await ca.page.goto('/accountant/clients');
  await expect(ca.page.getByTestId('no-clients')).toBeVisible();

  for (const p of [owner, stranger, ca]) await p.ctx.close();
});

test('a bad or used invitation link is a plain 404, and a free account cannot invite', async ({ browser }) => {
  const free = await newPerson(browser, email('free'));
  expect((await free.page.goto('/accountant/accept/' + 'a'.repeat(22)))?.status()).toBe(404);
  const r = await free.page.request.post('/api/accountant-access/invite', { headers: ORIGIN, data: { name: 'CA', email: email('ca') } });
  expect(r.status()).toBe(403);
  await free.ctx.close();
});

test('the owner card fits a 320px phone', async ({ browser }) => {
  await mkdir(SHOTS, { recursive: true });
  const owner = await newPerson(browser, email('pro'));
  await owner.page.setViewportSize({ width: 320, height: 800 });
  await owner.page.goto('/app/invoices/accountant');
  await expect(owner.page.getByTestId('access-card')).toBeVisible();
  const wide = await owner.page.evaluate(() =>
    [...document.querySelectorAll('[data-testid=access-card] *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`).slice(0, 6),
  );
  expect(wide).toEqual([]);
  await owner.page.screenshot({ path: `${SHOTS}/access-320.png`, fullPage: true });
  await owner.ctx.close();
});
