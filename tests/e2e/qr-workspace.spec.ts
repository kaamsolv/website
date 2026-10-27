import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * QR workspace: dashboard, All QR codes, campaigns, scan analytics, CSV exports.
 * Throwaway e2e database. "qrpro-" emails get a test-only QR Pro grant; any other
 * email is a free account, which must see none of the Pro parts and be refused by
 * every Pro route (the checks are server-side, not just hidden buttons).
 * Scans are made the way a phone makes them: a GET of /{code}, redirect not followed.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const NIL = '00000000-0000-4000-8000-000000000000';

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}
const choose = async (radio: Locator) => {
  await radio.locator('xpath=..').click();
  await expect(radio).toBeChecked();
};

type Made = { id: string; shortCode: string };
async function track(page: Page, name: string, url = `https://example.com/${name.replace(/\W+/g, '-').toLowerCase()}`): Promise<Made> {
  const res = await page.request.post('/api/qr', { headers: ORIGIN, data: { name, payload: { kind: 'url', url }, design: {} } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as Made;
}
const scan = (page: Page, code: string, ua = PHONE, extra: Record<string, string> = {}) =>
  page.request.get(`/${code}`, { maxRedirects: 0, headers: { 'user-agent': ua, ...extra } });
async function scans(page: Page, id: string, want: number) {
  await expect.poll(async () => ((await (await page.request.get(`/api/qr/${id}`)).json()) as { qr: { scans: number } }).qr.scans, { timeout: 10_000 }).toBe(want);
}
const detail = async (page: Page, id: string) => ((await (await page.request.get(`/api/qr/${id}`)).json()) as { qr: { destination: string; status: string; scans: number; campaignId: string | null; campaignName: string | null; shortCode: string; name: string } }).qr;
async function newCampaign(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/qr/campaigns', { headers: ORIGIN, data: { name } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Your workspace' });

test('free account: Dashboard, All QR codes and Scan analytics only — every Pro route says no, on the server', async ({ page }) => {
  await signIn(page, email('free-ws'));
  const a = await track(page, 'Poster A');
  const b = await track(page, 'Poster B');
  await scan(page, a.shortCode);
  await scan(page, a.shortCode, DESKTOP);
  await scan(page, a.shortCode, BOT);
  await scans(page, a.id, 2);

  await page.goto('/app/qr');
  await expect(page.getByTestId('kpi-codes')).toHaveText('2');
  await expect(page.getByTestId('kpi-active')).toHaveText('2');
  await expect(page.getByTestId('kpi-paused')).toHaveText('0');
  await expect(page.getByTestId('kpi-all-time')).toHaveText('2');
  await expect(page.getByTestId('kpi-month')).toHaveText('2');
  await expect(page.getByTestId('kpi-campaigns')).toHaveCount(0);
  await expect(page.getByTestId('range-summary')).toContainText('2 scans in the last 30 days');
  await expect(page.getByText('Scans are people who scanned — not bots or link previews, and not unique visitors.')).toBeVisible();
  await expect(page.getByRole('radio', { name: '7 days' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '30 days' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '90 days' })).toHaveCount(0);
  await expect(page.getByTestId('top-codes')).toContainText('Poster A');
  await expect(page.getByTestId('recent-activity')).toContainText('Poster A');
  await expect(page.getByTestId('newest-codes')).toContainText('Poster B');
  await expect(page.getByRole('link', { name: 'Start a campaign' })).toHaveCount(0);
  for (const name of ['Dashboard', 'All QR codes', 'Scan analytics']) await expect(nav(page).getByRole('link', { name })).toBeVisible();
  for (const name of ['Campaigns', 'Reports & exports']) await expect(nav(page).getByRole('link', { name })).toHaveCount(0);
  await choose(page.getByRole('radio', { name: '7 days' }));
  await expect(page.getByTestId('range-summary')).toContainText('2 scans in the last 7 days');

  await page.goto('/app/qr/analytics');
  await expect(page.getByTestId('an-range')).toHaveText('2');
  await expect(page.getByTestId('an-all-time')).toHaveText('2');
  await expect(page.getByTestId('by-code')).toContainText('Poster A');
  await expect(page.getByTestId('bk-country')).toHaveCount(0);
  await expect(page.getByTestId('bk-device')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Campaign' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: '90 days' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Scans by campaign' })).toHaveCount(0);

  // The Pro pages send a free account to the dashboard — no dead end, no teaser.
  for (const path of ['/app/qr/campaigns', `/app/qr/campaigns/${NIL}`, '/app/qr/exports']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/app\/qr$/);
  }

  // And the server refuses, whatever the page shows.
  const stats = (await (await page.request.get('/api/qr/stats?range=30')).json()) as { breakdowns: unknown; campaignCount: unknown; can: Record<string, boolean>; codes: { campaignId: string | null }[] };
  expect(stats.breakdowns).toBeNull();
  expect(stats.campaignCount).toBeNull();
  expect(stats.can).toEqual({ campaigns: false, breakdowns: false, export: false });
  const status = async (p: Promise<{ status(): number }>) => (await p).status();
  expect(await status(page.request.get('/api/qr/stats?range=90'))).toBe(403);
  expect(await status(page.request.get(`/api/qr/stats?range=30&campaign=${NIL}`))).toBe(403);
  expect(await status(page.request.get('/api/qr/campaigns'))).toBe(403);
  expect(await status(page.request.post('/api/qr/campaigns', { headers: ORIGIN, data: { name: 'Nope' } }))).toBe(403);
  expect(await status(page.request.put(`/api/qr/campaigns/${NIL}`, { headers: ORIGIN, data: { name: 'Nope' } }))).toBe(403);
  expect(await status(page.request.delete(`/api/qr/campaigns/${NIL}`, { headers: ORIGIN }))).toBe(403);
  expect(await status(page.request.put(`/api/qr/${b.id}`, { headers: ORIGIN, data: { campaignId: NIL } }))).toBe(403);
  expect(await status(page.request.put(`/api/qr/${b.id}`, { headers: ORIGIN, data: { campaignId: null } }))).toBe(403);
  expect(await status(page.request.get('/api/qr/export?type=codes'))).toBe(403);
  expect(await status(page.request.get('/api/qr/export?type=scans'))).toBe(403);
  expect(await status(page.request.get('/api/qr/stats?range=14'))).toBe(400);
  expect(await status(page.request.get('/api/qr/stats?range=30&qr=not-a-uuid'))).toBe(400);
  const list = (await (await page.request.get('/api/qr')).json()) as { qr: { campaignId: string | null; campaignName: string | null }[] };
  expect(list.qr.every((c) => c.campaignId === null && c.campaignName === null)).toBe(true);
});

test('Duplicate (free): an independent copy that counts against the limit of 3, with the original untouched', async ({ page }) => {
  await signIn(page, email('free-dup'));
  const a = await track(page, 'Original', 'https://example.com/original');
  await scan(page, a.shortCode);
  await scans(page, a.id, 1);
  const before = await detail(page, a.id);

  await page.goto('/app/qr/codes');
  await page.getByRole('button', { name: 'Duplicate Original', exact: true }).click();
  await expect(page.getByText('Made a copy of “Original”. The original is unchanged.')).toBeVisible();
  const rows = page.getByRole('list', { name: 'Tracked QR codes' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Original (copy)' })).toContainText('0 scans');
  await expect(page.getByTestId('list-count')).toHaveText('2 of 3 tracked');

  const list = (await (await page.request.get('/api/qr')).json()) as { qr: { id: string; name: string; shortCode: string; destination: string }[] };
  const copy = list.qr.find((c) => c.name === 'Original (copy)')!;
  expect(copy.shortCode).not.toBe(a.shortCode);
  expect(copy.destination).toBe('https://example.com/original');
  expect(await detail(page, a.id)).toEqual(before); // destination, status, scans, short link — exactly as they were
  expect((await scan(page, a.shortCode)).headers()['location']).toBe('https://example.com/original');

  // The third fits; the fourth is refused like a Save would be, and leaves nothing behind.
  expect((await page.request.post(`/api/qr/${a.id}/duplicate`, { headers: ORIGIN })).status()).toBe(201);
  const four = await page.request.post(`/api/qr/${a.id}/duplicate`, { headers: ORIGIN });
  expect(four.status()).toBe(403);
  expect(((await four.json()) as { error: string }).error).toBe('limit');
  expect(((await (await page.request.get('/api/qr')).json()) as { qr: unknown[] }).qr).toHaveLength(3);
  await page.reload();
  await page.getByRole('button', { name: 'Duplicate Original', exact: true }).click();
  await expect(page.getByText(/You’re tracking 3 QR codes — the free limit/)).toBeVisible();
  expect(await (await page.request.post(`/api/qr/${NIL}/duplicate`, { headers: ORIGIN })).status()).toBe(404);
});

test('simultaneous Save and Duplicate requests can never pass the free limit of 3', async ({ page }) => {
  await signIn(page, email('free-race'));
  const save = (n: number) => page.request.post('/api/qr', { headers: ORIGIN, data: { name: `Race ${n}`, payload: { kind: 'url', url: `https://example.com/r${n}` }, design: {} } });
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => save(i)));
  const codes = results.map((r) => r.status());
  expect(codes.filter((c) => c === 201)).toHaveLength(3);
  expect(codes.filter((c) => c === 403)).toHaveLength(5);
  const list = (await (await page.request.get('/api/qr')).json()) as { qr: { id: string }[] };
  expect(list.qr).toHaveLength(3);

  // Duplicate shares the same path: a fresh account with one code, six duplicates at once → two fit, four are refused.
  await signIn(page, email('free-race-dup'));
  const seed = await track(page, 'Seed', 'https://example.com/seed');
  const dups = await Promise.all(Array.from({ length: 6 }, () => page.request.post(`/api/qr/${seed.id}/duplicate`, { headers: ORIGIN })));
  const d = dups.map((r) => r.status());
  expect(d.filter((c) => c === 201)).toHaveLength(2);
  expect(d.filter((c) => c === 403)).toHaveLength(4);
  const after = (await (await page.request.get('/api/qr')).json()) as { qr: { id: string; destination: string }[] };
  expect(after.qr).toHaveLength(3);
  expect(after.qr.every((c) => c.destination === 'https://example.com/seed')).toBe(true);
  expect(await detail(page, seed.id)).toMatchObject({ destination: 'https://example.com/seed', status: 'active', scans: 0 });
});

test('All QR codes: search, filters, sorting and pagination (25 per page)', async ({ page }) => {
  await signIn(page, email('free-list'));
  const kinds = ['url', 'whatsapp', 'social', 'file'] as const;
  const items = Array.from({ length: 30 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Code ${String(i + 1).padStart(2, '0')}`,
    kind: kinds[i % 4],
    shortUrl: `https://kaamsolv.com/Mock${i}`,
    destination: i === 6 ? 'https://special.example.org/page' : `https://example.com/p${i}`,
    status: i % 5 === 0 ? 'disabled' : 'active',
    scans: (i * 7) % 11,
    lastScanAt: i % 3 === 0 ? null : new Date(Date.UTC(2026, 9, 1 + (i % 25))).toISOString(),
    createdAt: new Date(Date.UTC(2026, 8, 1) + i * 86_400_000).toISOString(),
    campaignId: null,
    campaignName: null,
  }));
  await page.route(/\/api\/qr$/, (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { ok: true, limit: null, qr: items } }) : route.continue()));

  await page.goto('/app/qr/codes');
  const rows = page.getByRole('list', { name: 'Tracked QR codes' }).getByRole('listitem');
  await expect(rows).toHaveCount(25);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(rows.first()).toContainText('Code 30'); // newest first
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();

  await page.getByLabel('Search').fill('special.example');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Code 07');
  await expect(page.getByTestId('list-count')).toHaveText('1 of 30 shown');
  await page.getByLabel('Search').fill('code 1');
  await expect(rows).toHaveCount(10); // Code 10–19
  await page.getByLabel('Search').fill('');

  await page.getByLabel('Status').selectOption('disabled');
  await expect(rows).toHaveCount(6);
  for (const r of await rows.all()) await expect(r).toContainText('Paused');
  await page.getByLabel('Type').selectOption('url');
  await expect(rows).toHaveCount(2); // i = 0 and i = 20 (paused, type url)
  await page.getByLabel('Status').selectOption('all');
  await page.getByLabel('Type').selectOption('all');

  await page.getByLabel('Sort').selectOption('scans');
  const top = Math.max(...items.map((i) => i.scans));
  await expect(rows.first()).toContainText(`${top} scans`);
  await page.getByLabel('Sort').selectOption('name');
  await expect(rows.first()).toContainText('Code 01');
  await page.getByLabel('Sort').selectOption('oldest');
  await expect(rows.first()).toContainText('Code 01');
  await page.getByLabel('Sort').selectOption('recent');
  await expect(rows.last()).toContainText('no scans yet');

  await page.getByLabel('Made').selectOption('7');
  await expect(page.getByText('Nothing matches.')).toBeVisible(); // everything here was "made" long before
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('Made')).toHaveValue('all');
  await expect(rows).toHaveCount(25);
  await expect(page.getByRole('combobox', { name: 'Campaign' })).toHaveCount(0); // a free account has no campaign filter
});

test('Pro: campaigns group codes and total their scans once; nothing about a code changes', async ({ page }) => {
  await signIn(page, email('qrpro-camp'));
  const a = await track(page, 'Flyer A', 'https://example.com/a');
  const b = await track(page, 'Flyer B', 'https://example.com/b');
  const loose = await track(page, 'Loose', 'https://example.com/loose');
  await scan(page, a.shortCode, PHONE, { 'x-vercel-ip-country': 'IN', referer: 'https://www.instagram.com/p/1' });
  await scan(page, a.shortCode, DESKTOP, { 'x-vercel-ip-country': 'US' });
  await scan(page, b.shortCode, PHONE, { 'x-vercel-ip-country': 'IN' });
  await scan(page, b.shortCode, BOT);
  for (let i = 0; i < 3; i++) await scan(page, loose.shortCode);
  await scans(page, a.id, 2);
  await scans(page, b.id, 1);
  await scans(page, loose.id, 3);

  await expect(nav(page).getByRole('link', { name: 'Campaigns' })).toHaveCount(0); // (not on a QR page yet)
  await page.goto('/app/qr/campaigns');
  for (const name of ['Dashboard', 'All QR codes', 'Campaigns', 'Scan analytics', 'Reports & exports']) await expect(nav(page).getByRole('link', { name })).toBeVisible();
  await expect(page.getByText('No campaigns yet')).toBeVisible();
  await page.getByRole('button', { name: '+ New campaign' }).click();
  await page.getByLabel('Campaign name').fill('   ');
  await expect(page.getByRole('button', { name: 'Create campaign' })).toBeDisabled();
  await page.getByLabel('Campaign name').fill('Diwali flyers');
  await page.getByLabel('Description').fill('Print run 1');
  await page.getByLabel('Starts').fill('2026-11-10');
  await page.getByLabel('Ends').fill('2026-11-01');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByText('The end date can’t be before the start.')).toBeVisible();
  await page.getByLabel('Ends').fill('2026-11-30');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.waitForURL(/\/app\/qr\/campaigns\/[0-9a-f-]{36}$/);
  const campId = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { name: 'Diwali flyers' })).toBeVisible();

  const before = { a: await detail(page, a.id), b: await detail(page, b.id), loose: await detail(page, loose.id) };
  for (const name of ['Flyer A', 'Flyer B']) {
    await page.getByLabel('Add a code').selectOption({ label: name });
    await page.getByRole('button', { name: 'Add to campaign' }).click();
    await expect(page.getByText(`Added “${name}”.`)).toBeVisible();
  }
  await expect(page.getByTestId('camp-codes')).toHaveText('2');
  await expect(page.getByTestId('camp-all-time')).toHaveText('3'); // each code once; the bot scan and the loose code are not in it
  await expect(page.getByTestId('camp-range')).toHaveText('3');
  await expect(page.getByTestId('camp-code-list')).toContainText('Flyer A');
  await expect(page.getByTestId('camp-code-list')).toContainText('Flyer B');
  await expect(page.getByTestId('camp-code-list')).not.toContainText('Loose');
  // Assigning changed nothing about the codes themselves.
  expect({ a: { ...(await detail(page, a.id)), campaignId: null, campaignName: null }, b: { ...(await detail(page, b.id)), campaignId: null, campaignName: null }, loose: await detail(page, loose.id) }).toEqual(before);
  expect((await detail(page, a.id)).campaignName).toBe('Diwali flyers');

  // A code moves between campaigns, and the totals follow.
  const holi = await newCampaign(page, 'Holi');
  await page.goto(`/app/qr/${b.id}`);
  await page.getByLabel('Campaign').selectOption({ label: 'Holi' });
  await expect(page.getByText('Moved into the campaign. Where the code goes is unchanged.')).toBeVisible();
  await page.goto(`/app/qr/campaigns/${campId}`);
  await expect(page.getByTestId('camp-all-time')).toHaveText('2');
  await page.goto(`/app/qr/campaigns/${holi}`);
  await expect(page.getByTestId('camp-all-time')).toHaveText('1');
  await page.getByRole('button', { name: 'Remove Flyer B from this campaign' }).click();
  await expect(page.getByText('Took “Flyer B” out of the campaign.')).toBeVisible();
  await expect(page.getByTestId('camp-codes')).toHaveText('0');

  // Names are unique per account (any case).
  const dup = await page.request.post('/api/qr/campaigns', { headers: ORIGIN, data: { name: 'diwali FLYERS' } });
  expect(dup.status()).toBe(409);

  // All QR codes filters by campaign.
  await page.goto('/app/qr/codes');
  await page.getByLabel('Campaign').selectOption({ label: 'Diwali flyers' });
  const rows = page.getByRole('list', { name: 'Tracked QR codes' }).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Flyer A');
  await page.getByLabel('Campaign').selectOption('none');
  await expect(rows).toHaveCount(2);

  // Deleting the campaign ungroups its codes — never deletes or changes them.
  await page.goto('/app/qr/campaigns');
  page.once('dialog', (d) => {
    expect(d.message()).toContain('stay exactly as they are');
    void d.accept();
  });
  await page.getByRole('button', { name: 'Delete Diwali flyers' }).click();
  await expect(page.getByText('Deleted “Diwali flyers”. Its codes are untouched.')).toBeVisible();
  const after = await detail(page, a.id);
  expect([after.campaignId, after.destination, after.status, after.scans, after.shortCode]).toEqual([null, before.a.destination, 'active', 2, before.a.shortCode]);
  expect((await scan(page, a.shortCode)).headers()['location']).toBe('https://example.com/a');
});

test('Pro: dashboard, analytics and breakdowns add up; the 90-day range and campaign filter work', async ({ page }) => {
  await signIn(page, email('qrpro-stats'));
  const a = await track(page, 'North', 'https://example.com/north');
  const b = await track(page, 'South', 'https://example.com/south');
  const camp = await newCampaign(page, 'Spring');
  expect((await page.request.put(`/api/qr/${a.id}`, { headers: ORIGIN, data: { campaignId: camp } })).status()).toBe(200);
  await scan(page, a.shortCode, PHONE, { 'x-vercel-ip-country': 'IN', referer: 'https://www.instagram.com/p/1' });
  await scan(page, a.shortCode, PHONE, { 'x-vercel-ip-country': 'IN' });
  await scan(page, a.shortCode, DESKTOP, { 'x-vercel-ip-country': 'US' });
  await scan(page, b.shortCode, DESKTOP, { 'x-vercel-ip-country': 'US' });
  await scan(page, b.shortCode, BOT, { 'x-vercel-ip-country': 'US' });
  await scans(page, a.id, 3);
  await scans(page, b.id, 1);
  await page.request.put(`/api/qr/${b.id}`, { headers: ORIGIN, data: { status: 'disabled' } });
  await scan(page, b.shortCode, PHONE); // paused: not recorded anywhere
  await scans(page, b.id, 1);

  await page.goto('/app/qr');
  await expect(page.getByTestId('kpi-codes')).toHaveText('2');
  await expect(page.getByTestId('kpi-active')).toHaveText('1');
  await expect(page.getByTestId('kpi-paused')).toHaveText('1');
  await expect(page.getByTestId('kpi-all-time')).toHaveText('4');
  await expect(page.getByTestId('kpi-month')).toHaveText('4');
  await expect(page.getByTestId('kpi-campaigns')).toHaveText('1');
  await expect(page.getByRole('link', { name: 'Start a campaign' })).toBeVisible();
  await choose(page.getByRole('radio', { name: '90 days' }));
  await expect(page.getByTestId('range-summary')).toContainText('4 scans in the last 90 days');

  await page.goto('/app/qr/analytics');
  await expect(page.getByTestId('an-range')).toHaveText('4');
  await choose(page.getByRole('radio', { name: '90 days' }));
  await expect(page.getByTestId('bk-country')).toContainText('India (IN)');
  await expect(page.getByTestId('bk-country')).toContainText('2 · 50%');
  await expect(page.getByTestId('bk-country')).toContainText('United States (US)');
  await expect(page.getByTestId('bk-device')).toContainText('mobile');
  await expect(page.getByTestId('bk-device')).toContainText('desktop');
  await expect(page.getByTestId('bk-device')).not.toContainText('bot');
  await expect(page.getByTestId('bk-referrer')).toContainText('www.instagram.com');
  await expect(page.getByTestId('bk-referrer')).toContainText('Direct or unknown');
  await expect(page.getByTestId('bk-country')).toContainText('Approximate');
  await expect(page.getByTestId('by-campaign')).toContainText('Spring');
  await expect(page.getByTestId('by-campaign')).toContainText('No campaign');

  await page.getByRole('combobox', { name: 'Campaign' }).selectOption({ label: 'Spring' });
  await expect(page.getByTestId('an-range')).toHaveText('3');
  await expect(page.getByTestId('an-codes')).toHaveText('1');
  await expect(page.getByTestId('by-code')).not.toContainText('South');
  await page.getByRole('combobox', { name: 'Campaign' }).selectOption('');
  await page.getByRole('combobox', { name: 'QR code' }).selectOption({ label: 'South' });
  await expect(page.getByTestId('an-range')).toHaveText('1');
});

test('Pro: CSV exports — only your rows, formula-safe, bots left out, filtered and capped', async ({ page, browser }) => {
  await signIn(page, email('qrpro-export'));
  const evil = await track(page, '=HYPERLINK("http://x")', 'https://example.com/evil');
  const plain = await track(page, 'Plain, with comma', 'https://example.com/plain');
  const camp = await newCampaign(page, '+Run');
  await page.request.put(`/api/qr/${evil.id}`, { headers: ORIGIN, data: { campaignId: camp } });
  await scan(page, evil.shortCode, PHONE, { 'x-vercel-ip-country': 'IN', referer: 'https://t.co/x' });
  await scan(page, evil.shortCode, BOT);
  await scan(page, plain.shortCode, DESKTOP, { 'x-vercel-ip-country': 'US' });
  await scans(page, evil.id, 1);
  await scans(page, plain.id, 1);

  const other = await browser.newContext({ baseURL: BASE });
  const op = await other.newPage();
  await signIn(op, email('qrpro-export-other'));
  const theirs = await track(op, 'Their secret', 'https://example.com/theirs');
  await scan(op, theirs.shortCode);
  await scans(op, theirs.id, 1);

  const csv = async (qs: string) => {
    const r = await page.request.get(`/api/qr/export?${qs}`);
    expect(r.status(), qs).toBe(200);
    expect(r.headers()['content-type']).toContain('text/csv');
    return (await r.text()).replace(/^﻿/, '').trim().split('\r\n');
  };
  const codes = await csv('type=codes&tz=Asia/Kolkata');
  expect(codes[0]).toBe('Name,Short link,Destination,Type,Campaign,Status,Scans (all time),Scans (in date range),Last scan (UTC),Created (UTC)');
  expect(codes).toHaveLength(3);
  expect(codes.join('\n')).not.toContain('Their secret');
  expect(codes.find((l) => l.includes('example.com/evil'))).toMatch(/^"'=HYPERLINK\(""http:\/\/x""\)",https:\/\/kaamsolv\.com\/\w{7},https:\/\/example\.com\/evil,url,'\+Run,Active,1,1,/);
  expect(codes.find((l) => l.startsWith('"Plain, with comma"'))).toContain(',Active,1,1,');

  const scansCsv = await csv('type=scans&tz=Asia/Kolkata');
  expect(scansCsv[0]).toBe('Scanned at (UTC),QR code,Short link,Campaign,Country,Device,Referring site');
  expect(scansCsv).toHaveLength(3); // header + 2 people; the bot is not a scan
  expect(scansCsv.join('\n')).not.toMatch(/bot/i);
  expect(scansCsv.join('\n')).not.toContain('Their secret');
  expect(scansCsv.find((l) => l.includes('example.com/evil') === false && l.includes('Plain'))).toContain(',US,desktop,');
  expect(scansCsv.find((l) => l.includes('HYPERLINK'))).toMatch(/,'\+Run,IN,mobile,t\.co$/);

  expect(await csv(`type=scans&campaign=${camp}`)).toHaveLength(2);
  expect(await csv(`type=scans&qr=${plain.id}`)).toHaveLength(2);
  expect((await csv('type=scans&from=2099-01-01')).length).toBe(1); // a future range: header only
  expect((await csv('type=codes&to=2000-01-01'))[1]).toContain(',Active,1,0,'); // all-time 1, none in range
  expect((await page.request.get(`/api/qr/export?type=scans&qr=${theirs.id}`)).status()).toBe(200);
  expect(await csv(`type=scans&qr=${theirs.id}`)).toHaveLength(1); // someone else's code: nothing
  expect((await page.request.get('/api/qr/export?type=codes&from=nope')).status()).toBe(400);
  expect((await page.request.get('/api/qr/export?type=codes&from=2026-02-01&to=2026-01-01')).status()).toBe(400);

  // From the page: pick a type and download.
  await page.goto('/app/qr/exports');
  await page.getByRole('combobox', { name: 'QR code' }).selectOption({ label: 'Plain, with comma' });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(dl.suggestedFilename()).toBe('kaamsolv-qr-codes.csv');
  expect((await readFile(await dl.path(), 'utf8')).split('\n').length).toBeGreaterThan(1);
  await choose(page.getByRole('radio', { name: 'Every scan' }));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(dl2.suggestedFilename()).toBe('kaamsolv-qr-scans.csv');
  await other.close();
});

test('isolation: nobody can put a code in, read, change or total another account’s campaign or codes', async ({ page, browser }) => {
  await signIn(page, email('qrpro-iso-a'));
  const mine = await track(page, 'Mine', 'https://example.com/mine');
  const campA = await newCampaign(page, 'A private');
  await scan(page, mine.shortCode);
  await scans(page, mine.id, 1);

  const other = await browser.newContext({ baseURL: BASE });
  const op = await other.newPage();
  await signIn(op, email('qrpro-iso-b'));
  const theirs = await track(op, 'Theirs', 'https://example.com/theirs');
  const campB = await newCampaign(op, 'B private');

  expect((await op.request.put(`/api/qr/${theirs.id}`, { headers: ORIGIN, data: { campaignId: campA } })).status(), 'B into A’s campaign').toBe(404);
  expect((await page.request.put(`/api/qr/${mine.id}`, { headers: ORIGIN, data: { campaignId: campB } })).status(), 'A into B’s campaign').toBe(404);
  expect((await op.request.put(`/api/qr/${mine.id}`, { headers: ORIGIN, data: { campaignId: campB } })).status(), 'B moves A’s code').toBe(404);
  expect((await op.request.put(`/api/qr/campaigns/${campA}`, { headers: ORIGIN, data: { name: 'Pwned' } })).status()).toBe(404);
  expect((await op.request.delete(`/api/qr/campaigns/${campA}`, { headers: ORIGIN })).status()).toBe(404);
  expect((await op.request.post(`/api/qr/${mine.id}/duplicate`, { headers: ORIGIN })).status()).toBe(404);
  const bCampaigns = (await (await op.request.get('/api/qr/campaigns')).json()) as { campaigns: { name: string }[] };
  expect(bCampaigns.campaigns.map((c) => c.name)).toEqual(['B private']);
  const probe = (await (await op.request.get(`/api/qr/stats?range=30&campaign=${campA}`)).json()) as { totals: { codes: number; allTime: number } };
  expect([probe.totals.codes, probe.totals.allTime]).toEqual([0, 0]);
  const probe2 = (await (await op.request.get(`/api/qr/stats?range=30&qr=${mine.id}`)).json()) as { totals: { codes: number } };
  expect(probe2.totals.codes).toBe(0);
  await op.goto(`/app/qr/campaigns/${campA}`);
  await expect(op.getByText('That campaign isn’t here')).toBeVisible();
  const intact = await detail(page, mine.id);
  expect([intact.campaignId, intact.destination, intact.scans, intact.status]).toEqual([null, 'https://example.com/mine', 1, 'active']);
  expect(((await (await page.request.get('/api/qr/campaigns')).json()) as { campaigns: { name: string }[] }).campaigns.map((c) => c.name)).toEqual(['A private']);
  await other.close();
});

test('empty states: a new account sees a clear first step on the dashboard, analytics and the list', async ({ page }) => {
  await signIn(page, email('free-empty'));
  await page.goto('/app/qr');
  await expect(page.getByText('Count your first scan')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Make a QR code' })).toBeVisible();
  await page.goto('/app/qr/codes');
  await expect(page.getByText('No tracked QR codes yet')).toBeVisible();
  await page.goto('/app/qr/analytics');
  await expect(page.getByText('Nothing to measure yet')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, width, height] of [['desktop', 1280, 900], ['phone', 375, 812]] as const) {
    test(`screenshots ${label} ${scheme}: dashboard, All QR codes, campaigns, analytics, exports`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      const noSideways = async (what: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${what} sideways scroll`).toBeLessThanOrEqual(0);
      };
      const shot = async (what: string, name: string) => {
        await noSideways(what);
        await page.screenshot({ path: `${SHOTS}/qrws-${name}-${label}-${scheme}.png`, fullPage: true });
      };

      await signIn(page, email(`qrpro-shot-${label}-${scheme}`));
      await page.goto('/app/qr');
      await expect(page.getByText('Count your first scan')).toBeVisible();
      await shot('empty dashboard', 'dashboard-empty');

      const a = await track(page, 'Menu — Table 5', 'https://example.com/menu');
      const b = await track(page, 'Poster — Mall A', 'https://example.com/poster');
      await track(page, 'Paused flyer', 'https://example.com/flyer');
      const camp = await newCampaign(page, 'Diwali flyers');
      for (const c of [a, b]) await page.request.put(`/api/qr/${c.id}`, { headers: ORIGIN, data: { campaignId: camp } });
      for (let i = 0; i < 4; i++) await scan(page, a.shortCode, i % 2 ? PHONE : DESKTOP, { 'x-vercel-ip-country': i % 3 ? 'IN' : 'US', referer: i === 0 ? 'https://www.instagram.com/p/1' : '' });
      await scan(page, b.shortCode, PHONE, { 'x-vercel-ip-country': 'IN' });
      await scans(page, a.id, 4);
      const list = (await (await page.request.get('/api/qr')).json()) as { qr: { id: string; name: string }[] };
      await page.request.put(`/api/qr/${list.qr.find((q) => q.name === 'Paused flyer')!.id}`, { headers: ORIGIN, data: { status: 'disabled' } });

      await page.goto('/app/qr');
      await expect(page.getByTestId('kpi-all-time')).toHaveText('5');
      await shot('dashboard', 'dashboard');
      await page.goto('/app/qr/codes');
      await expect(page.getByRole('list', { name: 'Tracked QR codes' }).getByRole('listitem')).toHaveCount(3);
      await shot('all codes', 'codes');
      await page.goto('/app/qr/campaigns');
      await expect(page.getByText('Diwali flyers').first()).toBeVisible();
      await shot('campaigns', 'campaigns');
      await page.goto(`/app/qr/campaigns/${camp}`);
      await expect(page.getByTestId('camp-all-time')).toHaveText('5');
      await shot('campaign', 'campaign');
      await page.goto('/app/qr/analytics');
      await choose(page.getByRole('radio', { name: '90 days' }));
      await expect(page.getByTestId('bk-country')).toBeVisible();
      await shot('analytics', 'analytics');
      await page.goto('/app/qr/exports');
      await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();
      await shot('exports', 'exports');
    });
  }
}
