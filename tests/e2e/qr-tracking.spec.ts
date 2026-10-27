import { expect, test, type Page } from '@playwright/test';

/**
 * Tracked QR codes (first slice) on the throwaway e2e database: the studio's
 * "Count scans" panel, the free limit of 3, All QR codes, scans counted from
 * real requests to /{code} (people yes, bots no), pause / resume / delete, and
 * what the printed code does. Emails starting "pro-" get a test-only manual Pro
 * grant (which gives them no QR limit).
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const SHOTS = 'test-results/screenshots';
const ORIGIN = { origin: BASE };
const SITE = 'https://kaamsolv.com';

const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const email = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signIn(page: Page, address: string) {
  const res = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(res.status(), await res.text()).toBe(200);
}

const payload = (url: string) => ({ kind: 'url', url });

async function track(page: Page, name: string, url = 'https://example.com/menu') {
  const res = await page.request.post('/api/qr', { headers: ORIGIN, data: { name, payload: payload(url), design: {} } });
  return { status: res.status(), body: (await res.json()) as { id?: string; shortCode?: string; shortUrl?: string; error?: string; message?: string } };
}

/** What a phone does when it scans: GET the short link, don't follow the redirect. */
async function scan(page: Page, code: string, ua = PHONE_UA, extra: Record<string, string> = {}) {
  return page.request.get(`/${code}`, { maxRedirects: 0, headers: { 'user-agent': ua, ...extra } });
}

async function scansOf(page: Page, id: string, want: number) {
  // Scans are recorded just after the redirect is sent, so wait for the count to settle.
  await expect
    .poll(async () => ((await (await page.request.get(`/api/qr/${id}`)).json()) as { qr: { scans: number } }).qr.scans, { timeout: 10_000 })
    .toBe(want);
}

test('signed out: the link types show only a free sign-in hint; other types show nothing', async ({ page }) => {
  await page.goto('/qr-code-generator');
  await expect(page.getByRole('heading', { name: 'Want to know how many people scan this?' }), 'shown even before anything is typed').toBeVisible();
  await page.getByLabel('Website address').fill('https://example.com/menu');
  await expect(page.getByRole('heading', { name: 'Want to know how many people scan this?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in (it’s free)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save tracked QR' })).toHaveCount(0);

  for (const type of ['Text', 'Wi-Fi', 'Location', 'Event', 'UPI', 'Contact']) {
    await page.getByRole('button', { name: type, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Want to know how many people scan this?' }), type).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Count scans' }), type).toHaveCount(0);
  }
  expect((await page.request.post('/api/qr', { headers: ORIGIN, data: { name: 'x', payload: payload('https://example.com'), design: {} } })).status()).toBe(401);
});

test('signed in: save a tracked QR, the QR now holds the short link, and the destination stays the same', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await signIn(page, email('free-qr'));
  await page.goto('/qr-code-generator');
  await page.getByLabel('Website address').fill('example.com/menu');
  await expect(page.getByRole('heading', { name: 'Count scans' })).toBeVisible();
  await expect(page.getByLabel('Name it, so you can find it')).toHaveValue('example.com');
  await expect(page.getByText('You’re tracking 0 of 3.')).toBeVisible();

  await page.getByRole('button', { name: 'Copy encoded text' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText()), 'before saving the QR holds the link itself').toBe('https://example.com/menu');

  await page.getByLabel('Name it, so you can find it').fill('Cafe menu');
  await page.getByRole('button', { name: 'Save tracked QR' }).click();
  await expect(page.getByText(/^Tracked\. Download your QR below/)).toBeVisible();
  await page.getByRole('button', { name: 'Copy encoded text' }).click();
  const encoded = await page.evaluate(() => navigator.clipboard.readText());
  expect(encoded).toMatch(new RegExp(`^${SITE}/[0-9A-Za-z]{7}$`));

  // The saved code redirects to the destination, and is listed with that link.
  const code = encoded.slice(SITE.length + 1);
  const hit = await scan(page, code);
  expect(hit.status()).toBe(302);
  expect(hit.headers()['location']).toBe('https://example.com/menu');
  await page.goto('/app/qr/codes');
  const row = page.getByRole('list', { name: 'Tracked QR codes' }).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Cafe menu');
  await expect(row).toContainText('Website');
  await expect(page.getByText('1 of 3 tracked')).toBeVisible();

  // Changing the link afterwards drops the tracking: the QR can't silently point somewhere it wasn't saved for.
  await page.goto('/qr-code-generator');
  await page.getByLabel('Website address').fill('https://example.com/menu');
  await page.getByLabel('Name it, so you can find it').fill('Second');
  await page.getByRole('button', { name: 'Save tracked QR' }).click();
  await expect(page.getByText(/^Tracked\./)).toBeVisible();
  await page.getByLabel('Website address').fill('https://example.com/other');
  await expect(page.getByText('You changed the link — save again to track the new one.')).toBeVisible();
  await page.getByRole('button', { name: 'Copy encoded text' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://example.com/other');
});

// Every QR type the generator offers, and whether a phone can be made to count scans for it.
const TRACKABLE: { chip: string; label: string; value: string; kind: string }[] = [
  { chip: 'Website', label: 'Website address', value: 'https://example.com/a', kind: 'url' },
  { chip: 'WhatsApp', label: 'WhatsApp number', value: '+91 98765 43210', kind: 'whatsapp' },
  { chip: 'Social', label: 'Profile or page URL', value: 'https://instagram.com/kaamsolv', kind: 'social' },
  { chip: 'PDF', label: 'File URL', value: 'https://example.com/doc.pdf', kind: 'file' },
];
const NOT_TRACKABLE = ['Text', 'Wi-Fi', 'Email', 'Phone', 'SMS', 'Contact', 'Location', 'Event', 'UPI'];

test('every link-type QR shows "Save tracked QR" from the start: disabled with a reason until it can work, then saves', async ({ page }) => {
  await signIn(page, email('qrpro-types'));
  await page.goto('/qr-code-generator');
  const save = page.getByRole('button', { name: 'Save tracked QR' });
  const hint = page.getByText('Finish the details above first');

  for (const t of TRACKABLE) {
    await page.getByRole('group', { name: 'QR type' }).getByRole('button', { name: t.chip, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Count scans' }), `${t.chip}: panel shows before anything is typed`).toBeVisible();
    await expect(save, `${t.chip}: button is there but disabled while empty`).toBeDisabled();
    await expect(hint, `${t.chip}: says what is missing`).toBeVisible();
    if (t.kind === 'url') await page.getByRole('region', { name: 'Count scans' }).screenshot({ path: `${SHOTS}/qr-track-empty.png` });

    await page.getByLabel(t.label).fill('not valid');
    await expect(save, `${t.chip}: still disabled while invalid`).toBeDisabled();
    await expect(hint).toBeVisible();

    await page.getByLabel(t.label).fill(t.value);
    await expect(save, `${t.chip}: enabled once valid`).toBeEnabled();
    await expect(hint).toHaveCount(0);

    await save.click();
    const trackedMsg = page.getByText(/^Tracked\. Download your QR below/);
    await expect(trackedMsg, `${t.chip}: saved`).toBeVisible();

    // The "Tracked." state belongs to the code just saved for THIS type: its page link points at a stored code of this kind,
    // and the short link the message shows is that code's own.
    const href = await page.getByRole('link', { name: 'its page' }).getAttribute('href');
    const id = href?.replace('/app/qr/', '') ?? '';
    const stored = ((await (await page.request.get('/api/qr')).json()) as { qr: { id: string; kind: string; shortUrl: string }[] }).qr.find((c) => c.id === id);
    expect(stored, `${t.chip}: the page link points at a saved code`).toBeTruthy();
    expect(stored!.kind, `${t.chip}: and it is a ${t.kind} code`).toBe(t.kind);
    await expect(trackedMsg).toContainText(stored!.shortUrl.replace(/^https?:\/\//, ''));
  }

  // The four saves are real tracked codes, one per type, and nothing else was saved.
  const list = (await (await page.request.get('/api/qr')).json()) as { qr: { kind: string }[] };
  const kinds = list.qr.map((c) => c.kind).sort();
  expect(kinds).toEqual(TRACKABLE.map((t) => t.kind).sort());
});

test('QR types that a phone reads directly show no tracking action at all — signed in', async ({ page }) => {
  await signIn(page, email('free-nottrack'));
  await page.goto('/qr-code-generator');
  for (const chip of NOT_TRACKABLE) {
    await page.getByRole('group', { name: 'QR type' }).getByRole('button', { name: chip, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save tracked QR' }), chip).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Count scans' }), chip).toHaveCount(0);
  }
  expect(((await (await page.request.get('/api/qr')).json()) as { qr: unknown[] }).qr, 'nothing was saved').toHaveLength(0);
});

test('a free account tracks 3; the 4th is refused calmly and nothing is orphaned; deleting frees a slot', async ({ page }) => {
  await signIn(page, email('free-limit'));
  const made = [];
  for (const n of [1, 2, 3]) {
    const r = await track(page, `Code ${n}`, `https://example.com/${n}`);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    made.push(r.body);
  }
  const four = await track(page, 'Code 4', 'https://example.com/4');
  expect(four.status).toBe(403);
  expect(four.body.error).toBe('limit');
  expect(four.body.message).toContain('Your codes keep working either way');

  // In the studio, the panel explains instead of offering a button.
  await page.goto('/qr-code-generator');
  await page.getByLabel('Website address').fill('https://example.com/4');
  await expect(page.getByText('You’re tracking 3 QR codes — the free limit.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save tracked QR' }), 'still there, but disabled at the limit').toBeDisabled();
  await expect(page.getByLabel('Name it, so you can find it'), 'the name field is disabled too').toBeDisabled();

  // Pausing doesn't free a slot, deleting does — and the printed copies of the other codes still work.
  await page.goto('/app/qr/codes');
  await page.getByRole('button', { name: 'Pause Code 1' }).click();
  await expect(page.getByText(/^Paused “Code 1”\./)).toBeVisible();
  expect((await track(page, 'Code 4')).status).toBe(403);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete Code 2' }).click();
  await expect(page.getByText('Deleted “Code 2”.')).toBeVisible();
  expect((await track(page, 'Code 4', 'https://example.com/4')).status).toBe(201);
  expect((await scan(page, made[2].shortCode!)).headers()['location']).toBe('https://example.com/3');
  expect((await scan(page, made[1].shortCode!)).status(), 'a deleted code is "not found"').toBe(404);
});

test('scans: people count, bots do not; the detail page shows the total and chart; pause and resume work', async ({ page }) => {
  await signIn(page, email('pro-scans'));
  const { body } = await track(page, 'Flyer', 'https://example.com/offer');
  const id = body.id!;
  const code = body.shortCode!;

  await scan(page, code, PHONE_UA, { 'x-vercel-ip-country': 'IN' });
  await scan(page, code, DESKTOP_UA, { referer: 'https://www.instagram.com/p/abc?x=1' });
  await scan(page, code, BOT_UA);
  await scansOf(page, id, 2);

  await page.goto(`/app/qr/${id}`);
  await expect(page.getByTestId('scan-total')).toHaveText('2');
  await expect(page.getByRole('img', { name: /^2 scans in the last 30 days\./ })).toBeVisible();
  await expect(page.getByText('It’s scans, not unique visitors.')).toBeVisible();
  await expect(page.getByText(/^Last scan /)).toBeVisible();
  await expect(page.getByText(new RegExp(`${SITE.replace('https://', '')}/${code}`)).first()).toBeVisible();
  await expect(page.getByText('https://example.com/offer')).toBeVisible();

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText(/^Paused\. Scanning it shows/)).toBeVisible();
  const paused = await scan(page, code);
  expect(paused.status()).toBe(302);
  expect(paused.headers()['location']).toContain('/link-unavailable?reason=disabled');
  await page.reload();
  await expect(page.getByTestId('scan-total')).toHaveText('2'); // a paused code isn't counted as a scan

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText(/^Resumed\./)).toBeVisible();
  expect((await scan(page, code)).headers()['location']).toBe('https://example.com/offer');
  await scansOf(page, id, 3);

  await page.getByLabel('Name').fill('Flyer — Mall A');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByText('Renamed.')).toBeVisible();
  await page.goto('/app/qr/codes');
  await expect(page.getByRole('list', { name: 'Tracked QR codes' })).toContainText('Flyer — Mall A');
  await expect(page.getByRole('list', { name: 'Tracked QR codes' })).toContainText('3 scans');
});

test('detail page: download again gives a PNG; delete removes it and the printed code stops', async ({ page }) => {
  await signIn(page, email('free-detail'));
  const { body } = await track(page, 'Table 5', 'https://example.com/table5');
  await page.goto(`/app/qr/${body.id}`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /PNG/ }).first().click()]);
  expect(dl.suggestedFilename()).toBe('kaamsolv-qr-code.png');

  page.once('dialog', (d) => {
    expect(d.message()).toContain('a printed copy will stop working');
    void d.accept();
  });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForURL('**/app/qr/codes');
  await expect(page.getByText('No tracked QR codes yet')).toBeVisible();
  expect((await scan(page, body.shortCode!)).status()).toBe(404);
  expect((await page.request.get(`/api/qr/${body.id}`)).status()).toBe(404);
});

test('safety: other people’s codes are 404; other shorteners, non-links and bad input are refused', async ({ page, browser }) => {
  await signIn(page, email('own-a'));
  const mine = (await track(page, 'Mine')).body;

  const other = await browser.newContext({ baseURL: BASE });
  const op = await other.newPage();
  await signIn(op, email('own-b'));
  expect((await op.request.get(`/api/qr/${mine.id}`)).status()).toBe(404);
  expect((await op.request.put(`/api/qr/${mine.id}`, { headers: ORIGIN, data: { status: 'disabled' } })).status()).toBe(404);
  expect((await op.request.delete(`/api/qr/${mine.id}`, { headers: ORIGIN })).status()).toBe(404);
  expect(((await (await op.request.get('/api/qr')).json()) as { qr: unknown[] }).qr).toEqual([]);
  await op.goto(`/app/qr/${mine.id}`);
  await expect(op.getByText('That QR code isn’t here')).toBeVisible();
  await other.close();
  expect((await scan(page, mine.shortCode!)).headers()['location']).toBe('https://example.com/menu');

  const bad = async (data: unknown, status: number, error: string) => {
    const r = await page.request.post('/api/qr', { headers: ORIGIN, data });
    expect(r.status(), JSON.stringify(data)).toBe(status);
    expect(((await r.json()) as { error: string }).error).toBe(error);
  };
  await bad({ name: 'Short', payload: payload('https://bit.ly/abc123'), design: {} }, 400, 'blocked_url');
  await bad({ name: 'Wifi', payload: { kind: 'wifi', ssid: 'home', password: 'secret' }, design: {} }, 400, 'not_trackable');
  await bad({ name: 'Geo', payload: { kind: 'location', latitude: '1', longitude: '2' }, design: {} }, 400, 'not_trackable');
  await bad({ name: '   ', payload: payload('https://example.com'), design: {} }, 400, 'invalid_name');
  await bad({ name: 'Js', payload: payload('javascript:alert(1)'), design: {} }, 400, 'invalid_url');
  await bad({ name: 'Nothing', payload: payload(''), design: {} }, 400, 'invalid_url');
  expect((await page.request.post('/api/qr', { data: { name: 'x', payload: payload('https://example.com'), design: {} } })).status(), 'not same-origin').toBe(403);

  // A logo in the design is never kept.
  const withLogo = await page.request.post('/api/qr', {
    headers: ORIGIN,
    data: { name: 'Logo', payload: payload('https://example.com/logo'), design: { logo: { dataUrl: `data:image/png;base64,${'A'.repeat(50_000)}`, size: 'l' } } },
  });
  expect(withLogo.status()).toBe(201);
  const saved = (await (await page.request.get(`/api/qr/${((await withLogo.json()) as { id: string }).id}`)).json()) as { qr: { design: Record<string, unknown> } };
  expect('logo' in saved.qr.design).toBe(false);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, width, height] of [['desktop', 1280, 900], ['phone', 375, 812]] as const) {
    test(`screenshots ${label} ${scheme}: studio panel, All QR codes, detail`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      const noSideways = async (what: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${what} sideways scroll`).toBeLessThanOrEqual(0);
      };

      // Signed out.
      await page.goto('/qr-code-generator');
      await page.getByLabel('Website address').fill('https://example.com/menu');
      await expect(page.getByRole('link', { name: 'Sign in (it’s free)' })).toBeVisible();
      await noSideways('studio signed out');
      await page.locator('section[aria-labelledby="track-h"]').screenshot({ path: `${SHOTS}/qr-panel-signedout-${label}-${scheme}.png` });

      // Signed in, empty list, then a saved code with scans.
      await signIn(page, email(`qr-shot-${label}-${scheme}`));
      await page.goto('/app/qr/codes');
      await expect(page.getByText('No tracked QR codes yet')).toBeVisible();
      await noSideways('empty list');
      await page.screenshot({ path: `${SHOTS}/qr-list-empty-${label}-${scheme}.png`, fullPage: true });

      await page.goto('/qr-code-generator');
      await page.getByLabel('Website address').fill('https://example.com/menu');
      await expect(page.getByRole('button', { name: 'Save tracked QR' })).toBeVisible();
      await page.locator('section[aria-labelledby="track-h"]').screenshot({ path: `${SHOTS}/qr-panel-ready-${label}-${scheme}.png` });
      await page.getByLabel('Name it, so you can find it').fill('Cafe menu');
      await page.getByRole('button', { name: 'Save tracked QR' }).click();
      await expect(page.getByText(/^Tracked\./)).toBeVisible();
      await noSideways('studio saved');
      await page.locator('section[aria-labelledby="track-h"]').screenshot({ path: `${SHOTS}/qr-panel-saved-${label}-${scheme}.png` });

      const list = (await (await page.request.get('/api/qr')).json()) as { qr: { id: string; shortCode: string }[] };
      const { id, shortCode } = list.qr[0];
      for (let i = 0; i < 3; i++) await scan(page, shortCode);
      await scansOf(page, id, 3);
      await track(page, 'Poster — Mall A', 'https://example.com/poster');

      await page.goto('/app/qr/codes');
      await expect(page.getByRole('list', { name: 'Tracked QR codes' }).getByRole('listitem')).toHaveCount(2);
      await noSideways('list');
      await page.screenshot({ path: `${SHOTS}/qr-list-${label}-${scheme}.png`, fullPage: true });

      await page.goto(`/app/qr/${id}`);
      await expect(page.getByTestId('scan-total')).toHaveText('3');
      await expect(page.getByRole('img', { name: /scans in the last 30 days/ })).toBeVisible();
      await noSideways('detail');
      await page.screenshot({ path: `${SHOTS}/qr-detail-${label}-${scheme}.png`, fullPage: true });
    });
  }
}
