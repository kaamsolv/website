/**
 * Invoice Pro packaging on real Postgres (PGlite, real migrations): which plan grants each Pro feature, and what
 * happens to access as a subscription starts, is cancelled, lapses or is replaced. No prices or live billing involved:
 * rows are manual subscriptions, the same shape the checkout webhook writes.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, subscriptions } from '../db/schema.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { entitlementsFrom } from '../app/lib/entitlements.ts';
import { getReminderSettings, saveReminderSettings } from '../db/reminders.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

/** Every Invoice Pro feature the new work gates on, and the one thing each protects. */
const PRO_KEYS = ['invoice_reminders', 'invoice_recurring', 'invoice_dashboard', 'invoice_csv_export'] as const;

async function user(tag: string): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: tag, email: `${tag}@example.test`, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}
async function can(id: string, key: (typeof PRO_KEYS)[number], now?: Date): Promise<boolean> {
  return entitlementsFrom(await getEntitlements(db, id, now)).can(key);
}
async function allCan(id: string, now?: Date): Promise<boolean[]> {
  return Promise.all(PRO_KEYS.map((k) => can(id, k, now)));
}

test('a free account has none of the Pro features, and a signed-out visitor has nothing at all', async () => {
  const id = await user('free1');
  assert.deepEqual(await allCan(id), [false, false, false, false]);
  assert.deepEqual((await getEntitlements(db, null)).keys, []);
});

test('Invoice Pro grants all of them; a different product’s plan grants none (no moving between plans)', async () => {
  const pro = await user('pro1');
  const qr = await user('qr1');
  await db.insert(subscriptions).values({ userId: pro, provider: 'manual', providerRef: 'manual:life-pro1', planKey: 'invoice_pro', status: 'active' });
  await db.insert(subscriptions).values({ userId: qr, provider: 'manual', providerRef: 'manual:life-qr1', planKey: 'qr_pro', status: 'active' });
  assert.deepEqual(await allCan(pro), [true, true, true, true]);
  assert.deepEqual(await allCan(qr), [false, false, false, false], 'QR Pro is not Invoice Pro');
});

test('access follows the subscription: it ends when cancelled, when the period ends, and returns on a new subscription', async () => {
  const id = await user('life1');
  const future = new Date(Date.now() + 30 * 86_400_000);
  const [sub] = await db.insert(subscriptions).values({ userId: id, provider: 'manual', providerRef: 'manual:life-1', planKey: 'invoice_pro', status: 'active', currentPeriodEnd: future }).returning({ id: subscriptions.id });
  assert.deepEqual(await allCan(id), [true, true, true, true], 'upgrade: all on');

  // The period runs out (a missed webhook cannot leave access behind).
  assert.deepEqual(await allCan(id, new Date(future.getTime() + 60_000)), [false, false, false, false], 'expiry: all off');
  assert.deepEqual(await allCan(id, new Date(future.getTime() - 60_000)), [true, true, true, true], 'just before the end: still on');

  // Cancelled or failed at the provider.
  for (const status of ['cancelled', 'halted', 'pending', 'paused']) {
    await db.update(subscriptions).set({ status }).where(eq(subscriptions.id, sub.id));
    assert.deepEqual(await allCan(id), [false, false, false, false], `${status}: all off`);
  }

  // Downgrade then upgrade again.
  await db.update(subscriptions).set({ status: 'active' }).where(eq(subscriptions.id, sub.id));
  assert.deepEqual(await allCan(id), [true, true, true, true], 're-activated: all on');
});

test('a lapsed account keeps its data and can still switch things off', async () => {
  const id = await user('life2');
  const [sub] = await db.insert(subscriptions).values({ userId: id, provider: 'manual', providerRef: 'manual:life-2', planKey: 'invoice_pro', status: 'active' }).returning({ id: subscriptions.id });
  await saveReminderSettings(db, id, { enabled: true, days: [3, 10] });
  await db.update(subscriptions).set({ status: 'cancelled' }).where(eq(subscriptions.id, sub.id));
  assert.equal(await can(id, 'invoice_reminders'), false);
  const kept = await getReminderSettings(db, id);
  assert.equal(kept.enabled, true, 'the setting is kept, not erased, so a returning customer finds it as they left it');
  assert.deepEqual(kept.days, [3, 10]);
  await saveReminderSettings(db, id, { enabled: false, days: [3, 10] });
  assert.equal((await getReminderSettings(db, id)).enabled, false, 'and turning it off needs no plan');
});

test('two active plans add up; ending one leaves the other', async () => {
  const id = await user('life3');
  const [a] = await db.insert(subscriptions).values({ userId: id, provider: 'manual', providerRef: 'manual:life-3a', planKey: 'invoice_pro', status: 'active' }).returning({ id: subscriptions.id });
  await db.insert(subscriptions).values({ userId: id, provider: 'manual', providerRef: 'manual:life-3b', planKey: 'qr_pro', status: 'active' });
  assert.equal(await can(id, 'invoice_reminders'), true);
  await db.update(subscriptions).set({ status: 'cancelled' }).where(eq(subscriptions.id, a.id));
  assert.equal(await can(id, 'invoice_reminders'), false, 'the QR plan does not carry Invoice Pro features');
});
