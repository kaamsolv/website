import { expect, test } from '@playwright/test';

/**
 * Server-side Pro gates on the new Invoice Pro features, seen from a free account: every start-something action is
 * refused with a plain 403 (never a 500, never silently allowed), and every stop-something action still works, so a
 * lapsed account is never stuck with something it can't switch off. The entitlement rules themselves are tested
 * against real Postgres in test/pro-lifecycle.test.mts.
 */

const BASE = process.env.KK_E2E_BASE ?? 'http://localhost:3000';
const SECRET = process.env.KK_E2E_SECRET ?? '';
const ORIGIN = { origin: BASE };
const RND = '11111111-1111-4111-8111-111111111111';

test('a free account is refused every Pro action and may still stop things', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const address = `free-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const si = await page.request.post('/api/test/oauth-sign-in', { headers: { 'x-kk-e2e-secret': SECRET }, data: { email: address, name: 'Pat' } });
  expect(si.status()).toBe(200);
  const r = page.request;

  // Starting things: a clear 403 and a "part of Pro" message.
  const refused = async (res: Promise<import('@playwright/test').APIResponse>, what: string) => {
    const x = await res;
    expect(x.status(), `${what} gave ${x.status()}`).toBe(403);
    expect(((await x.json()) as { message?: string }).message ?? '', what).toMatch(/Pro/);
  };
  await refused(r.put('/api/invoices/reminder-settings', { headers: ORIGIN, data: { enabled: true, days: [3] } }), 'turn on scheduled reminders');
  await refused(r.post(`/api/invoices/${RND}/reminders`, { headers: ORIGIN, data: {} }), 'send a reminder');
  await refused(r.put(`/api/invoices/${RND}/followup`, { headers: ORIGIN, data: { promisedOn: '2099-01-01' } }), 'record a promise');
  await refused(r.get('/api/invoices/promises'), 'list promises');
  await refused(r.put(`/api/invoices/${RND}/automation`, { headers: ORIGIN, data: { autoCreate: true } }), 'turn on automatic recurring invoices');
  await refused(r.put('/api/accountant', { headers: ORIGIN, data: { name: 'CA', email: 'ca@example.test', enabled: true, day: 5, hour: 9, sections: ['register'] } }), 'turn on the accountant pack');
  await refused(r.post('/api/accountant/verify', { headers: ORIGIN, data: {} }), 'confirm an accountant');
  await refused(r.get('/api/accountant/pack'), 'build a pack');
  await refused(r.post('/api/accountant-access/invite', { headers: ORIGIN, data: { name: 'CA', email: 'ca2@example.test' } }), 'invite an accountant');

  // Stopping things: allowed without Pro.
  expect((await r.put('/api/invoices/reminder-settings', { headers: ORIGIN, data: { enabled: false, days: [3] } })).status()).toBe(200);
  expect((await r.post('/api/accountant/revoke', { headers: ORIGIN, data: {} })).status()).toBe(200);
  expect((await r.post('/api/accountant-access/revoke', { headers: ORIGIN, data: { id: RND } })).status(), 'nothing to end, but not blocked by the plan').toBe(404);
  expect((await r.put(`/api/invoices/${RND}/followup`, { headers: ORIGIN, data: { promisedOn: null } })).status(), 'clearing is not blocked by the plan').toBe(404);

  // The settings screens say what Pro adds instead of failing.
  const mine = (await (await r.get('/api/accountant')).json()) as { plan: boolean };
  expect(mine.plan).toBe(false);
  expect(((await (await r.get('/api/accountant-access')).json()) as { plan: boolean }).plan).toBe(false);
  await ctx.close();
});
