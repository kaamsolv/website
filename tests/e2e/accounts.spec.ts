import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Accounts Stage 1. Runs against the throwaway e2e database
 * (tests/e2e/start-server.mts), where the free save limit is lowered to 3 as a
 * test-only override.
 *
 * "Google" here is the test-only stand-in (POST /api/test/oauth-sign-in), which
 * runs better-auth's real account creation/linking. Real Google is checked by
 * hand. Email sign-in is the real flow; the link is read from the dev outbox.
 */

const BASE = 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const E2E_SAVE_LIMIT = 3;
const ORIGIN = { origin: BASE };

const rows = (page: Page) => page.getByRole('list', { name: 'Saved invoices' }).getByRole('listitem');

const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function googleSignIn(page: Page, email: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', {
    headers: { 'x-kk-e2e-secret': SECRET },
    data: { email, name: 'Pat Example' },
  });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { userId: string }).userId;
}

async function lastLinkFor(email: string, since: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const text = await readFile('test-results/mail-outbox.jsonl', 'utf8').catch(() => '');
    const hit = text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { to: string; link: string; at: number })
      .filter((m) => m.to === email && m.at >= since)
      .pop();
    if (hit) return hit.link;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no sign-in email for ${email}`);
}

async function emailSignIn(page: Page, email: string, next: string) {
  const since = Date.now() - 1000;
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await page.goto(await lastLinkFor(email, since));
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

async function meId(page: Page): Promise<string | null> {
  const body = (await (await page.request.get('/api/me')).json()) as { signedIn: boolean; user?: { id: string } };
  return body.signedIn ? body.user!.id : null;
}

async function fillInvoice(page: Page, client: string, seller = 'Pat’s Studio') {
  await page.getByLabel('Your business name').fill(seller);
  await page.getByLabel('Client name').fill(client);
  await page.getByLabel('Item 1 description').fill('Design work');
  await page.getByLabel('Item 1 rate').fill('5000');
}

async function saveNew(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page).toHaveURL(/\/invoice-generator\?id=[0-9a-f-]{36}$/);
}

test('anonymous draft survives a refresh — nothing sent anywhere', async ({ page }) => {
  await page.goto('/invoice-generator');
  await page.getByLabel('Client name').fill('Draft Client');
  await page.getByLabel('Item 1 rate').fill('1234');
  await page.waitForTimeout(600); // draft is written 400 ms after typing stops
  await page.reload();
  await expect(page.getByLabel('Client name')).toHaveValue('Draft Client');
  await expect(page.getByLabel('Item 1 rate')).toHaveValue('1234');
  await expect(page.getByText('Your draft stays in this browser — nothing is uploaded.')).toBeVisible();
});

test('Google, sign out, then email link with the same address: same account, both invoices', async ({ page }) => {
  const email = uniqueEmail('pat');
  const googleId = await googleSignIn(page, email);

  await page.goto('/invoice-generator');
  await fillInvoice(page, 'First Client');
  await saveNew(page);
  await page.getByRole('button', { name: 'Start new' }).click();
  await page.getByLabel('Client name').fill('Second Client');
  await page.getByLabel('Item 1 rate').fill('700');
  await saveNew(page);

  await page.goto('/app/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(`${BASE}/`);
  expect(await meId(page)).toBeNull();

  await emailSignIn(page, email, '/app/invoices');
  expect(await meId(page)).toBe(googleId);
  await expect(page.getByText('First Client')).toBeVisible();
  await expect(page.getByText('Second Client')).toBeVisible();
});

test('reverse order — email link first, then Google with the same address — is one account', async ({ page }) => {
  const email = uniqueEmail('rev');
  await emailSignIn(page, email, '/app/invoices');
  const emailId = await meId(page);
  expect(emailId).not.toBeNull();
  await page.request.post('/api/auth/sign-out', { headers: ORIGIN, data: {} });
  expect(await meId(page)).toBeNull();
  expect(await googleSignIn(page, email)).toBe(emailId);
});

test('a draft made before signing in is still there after, and saves', async ({ page }) => {
  await page.goto('/invoice-generator');
  await fillInvoice(page, 'Carried Over Ltd');
  await page.waitForTimeout(600);
  await page.getByRole('link', { name: /Sign in to save invoices/ }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Finvoice-generator/);
  await emailSignIn(page, uniqueEmail('carry'), '/invoice-generator');
  await expect(page.getByLabel('Client name')).toHaveValue('Carried Over Ltd');
  await saveNew(page);
});

test('save, autosave, list, copy and delete', async ({ page }) => {
  await googleSignIn(page, uniqueEmail('crud'));
  await page.goto('/invoice-generator');
  await fillInvoice(page, 'Autosave Co');
  await saveNew(page);

  await page.getByLabel('Notes or payment details').fill('UPI: pat@okbank');
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Notes or payment details')).toHaveValue('UPI: pat@okbank');

  await page.goto('/app/invoices');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: /^Make a copy of/ }).click();
  await expect(rows(page)).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Delete / }).first().click();
  await expect(rows(page)).toHaveCount(1);
});

test('business details and logo carry into the next invoice, with the next number', async ({ page }) => {
  await googleSignIn(page, uniqueEmail('profile'));
  await page.goto('/invoice-generator');
  await expect(page.getByLabel('Invoice number')).toHaveValue('INV-0001');
  await fillInvoice(page, 'Profile Client', 'Remembered Studio');
  await saveNew(page);
  await page.getByRole('button', { name: 'Start new' }).click();
  await expect(page.getByLabel('Your business name')).toHaveValue('Remembered Studio');
  await expect(page.getByLabel('Client name')).toHaveValue('');
  await expect(page.getByLabel('Invoice number')).toHaveValue('INV-0002');
});

test(`free save limit (test-only override: ${E2E_SAVE_LIMIT}) — Save off, clear message, PDF still works`, async ({ page }) => {
  await googleSignIn(page, uniqueEmail('limit'));
  await page.goto('/invoice-generator');
  const invoice = { number: 'L', issueDate: '2026-10-21', dueDate: '', currency: 'INR', seller: {}, client: { name: 'L' }, items: [] };
  for (let i = 0; i < E2E_SAVE_LIMIT; i++) {
    expect((await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice } })).status()).toBe(201);
  }
  const over = await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice } });
  expect(over.status()).toBe(403);
  expect(((await over.json()) as { error: string }).error).toBe('limit');

  await page.goto('/invoice-generator');
  await expect(page.getByText(`You’ve saved ${E2E_SAVE_LIMIT} invoices — the free limit.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByText(/Pro/)).toHaveCount(0); // no Pro mention in Stage 1
  await expect(page.getByRole('button', { name: 'Download PDF' }).first()).toBeEnabled();
});

test('another user’s invoice is a 404 for read, update, delete and copy', async ({ page, browser }) => {
  await googleSignIn(page, uniqueEmail('owner'));
  const made = await page.request.post('/api/invoices', {
    headers: ORIGIN,
    data: { invoice: { number: 'A-1', currency: 'INR', seller: {}, client: { name: 'Secret Client' }, items: [] } },
  });
  const { id } = (await made.json()) as { id: string };

  const other = await (browser as Browser).newContext({ baseURL: BASE });
  const otherPage = await other.newPage();
  await googleSignIn(otherPage, uniqueEmail('intruder'));
  const r = otherPage.request;
  expect((await r.get(`/api/invoices/${id}`)).status()).toBe(404);
  expect((await r.put(`/api/invoices/${id}`, { headers: ORIGIN, data: { invoice: { currency: 'INR', items: [] } } })).status()).toBe(404);
  expect((await r.delete(`/api/invoices/${id}`, { headers: ORIGIN })).status()).toBe(404);
  expect((await r.post(`/api/invoices/${id}/duplicate`, { headers: ORIGIN, data: {} })).status()).toBe(404);
  expect(JSON.stringify(await (await r.get('/api/invoices')).json())).not.toContain('Secret Client');
  await other.close();

  expect((await page.request.get(`/api/invoices/${id}`)).status()).toBe(200);
});

test('list and /api/me never return the logo or invoice documents; cross-site writes are refused', async ({ page }) => {
  await googleSignIn(page, uniqueEmail('shape'));
  const logo = `data:image/png;base64,${'A'.repeat(400)}`;
  await page.request.put('/api/business-profile', { headers: ORIGIN, data: { name: 'Logo Co', address: '', email: '', phone: '', logo } });
  await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: { number: 'S-1', currency: 'INR', seller: {}, client: {}, items: [], logo } } });

  const list = await (await page.request.get('/api/invoices')).text();
  const me = await (await page.request.get('/api/me')).text();
  for (const body of [list, me]) {
    expect(body).not.toContain('data:image');
    expect(body).not.toContain('"data"');
  }
  expect(await (await page.request.get('/api/business-profile')).text()).toContain('data:image/png');

  const crossSite = await page.request.post('/api/invoices', { headers: { origin: 'https://evil.example' }, data: { invoice: {} } });
  expect(crossSite.status()).toBe(403);
});

test('deleting the account removes everything; signing in again starts fresh', async ({ page }) => {
  const email = uniqueEmail('delete');
  const firstId = await googleSignIn(page, email);
  await page.request.post('/api/invoices', { headers: ORIGIN, data: { invoice: { number: 'D-1', currency: 'INR', seller: {}, client: {}, items: [] } } });

  await page.goto('/app/account');
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.waitForURL(/\/\?account=deleted$/);
  expect(await meId(page)).toBeNull();

  const secondId = await googleSignIn(page, email);
  expect(secondId).not.toBe(firstId);
  const me = (await (await page.request.get('/api/me')).json()) as { usage: { invoiceSave: number } };
  expect(me.usage.invoiceSave).toBe(0);
});

test('signed-out visits to /app pages go to log in, and come back after', async ({ page }) => {
  await page.goto('/app/invoices');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Finvoices$/);
  await page.goto('/app/account');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Faccount$/);
  await page.goto('/login?next=//evil.example');
  await expect(page.getByRole('heading', { name: 'Log in or sign up' })).toBeVisible();
});

test('"Continue with Google" goes to Google with our callback address (request stopped before it leaves)', async ({ page }) => {
  let googleUrl = '';
  await page.route('https://accounts.google.com/**', (route) => {
    googleUrl = route.request().url();
    return route.abort();
  });
  await page.goto('/login?next=%2Fapp%2Finvoices');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect.poll(() => googleUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
  const url = new URL(googleUrl);
  expect(url.searchParams.get('redirect_uri')).toBe(`${BASE}/api/auth/callback/google`);
  expect(url.searchParams.get('client_id')).toBe('e2e-dummy.apps.googleusercontent.com');
  expect(url.searchParams.get('prompt')).toBe('select_account');
  expect(url.searchParams.get('state')).toBeTruthy();
  expect(url.searchParams.get('code_challenge')).toBeTruthy(); // PKCE
});

test('the test-only sign-in route is a 404 without the secret or with a wrong one', async ({ request }) => {
  expect((await request.post('/api/test/oauth-sign-in', { data: { email: 'x@example.test' } })).status()).toBe(404);
  expect(
    (await request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': `${SECRET}x` }, data: { email: 'x@example.test' } })).status(),
  ).toBe(404);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, width, height] of [['desktop', 1280, 900], ['phone', 375, 812]] as const) {
    test(`screenshots ${label} ${scheme}: log in, my invoices, editor, account`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await page.goto('/login?next=%2Fapp%2Finvoices');
      await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${SHOTS}/accounts-login-${label}-${scheme}.png`, fullPage: true });

      await googleSignIn(page, uniqueEmail(`shot-${label}-${scheme}`));
      await page.goto('/invoice-generator');
      await fillInvoice(page, 'Acme Traders Pvt Ltd', 'Sharma Design Studio');
      await saveNew(page);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.screenshot({ path: `${SHOTS}/accounts-editor-${label}-${scheme}.png` });

      await page.request.post('/api/invoices', {
        headers: ORIGIN,
        data: { invoice: { number: 'INV-0002', issueDate: '2026-10-21', currency: 'INR', seller: {}, client: { name: 'Bright Foods LLP' }, items: [{ id: '1', description: 'Menu design', qty: '1', rate: '12000' }] } },
      });
      await page.goto('/app/invoices');
      await expect(rows(page)).toHaveCount(2);
      await page.screenshot({ path: `${SHOTS}/accounts-list-${label}-${scheme}.png`, fullPage: true });

      await page.goto('/app/account');
      await expect(page.getByText('Free account')).toBeVisible();
      if (label === 'desktop') await page.getByRole('button', { name: /^Account menu for/ }).click();
      await page.screenshot({ path: `${SHOTS}/accounts-account-${label}-${scheme}.png`, fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
