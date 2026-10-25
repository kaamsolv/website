/**
 * QR workspace: campaigns, scan statistics, exports. Real Postgres (PGlite)
 * with the real migrations. The integrity rules under test: a campaign only
 * groups codes (never changes a destination, pause or scan), another user's
 * codes and campaigns are untouchable, and "scans" mean one thing everywhere —
 * non-bot events, which is also what `links.click_count` counts.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq, sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { makeTestDb } from './helpers/test-db.mts';
import { authUsers, clickEvents, links, qrCampaigns, qrCodes, subscriptions } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import { recordClick } from '../db/links.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { entitlementsFrom } from '../app/lib/entitlements.ts';
import { createTrackedQr, deleteQr, getQr, isLimitError, listQr, renameQr, setQrStatus } from '../db/qr.ts';
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, setQrCampaign, updateCampaign, countCampaigns } from '../db/qr-campaigns.ts';
import { exportCodes, exportScans, getQrStats } from '../db/qr-stats.ts';
import { CAMPAIGN_CAP, cleanCampaign, parseRange } from '../app/lib/qr/campaigns.ts';
import { designForSaving } from '../app/lib/qr/tracking.ts';
import type { QrPayload } from '../app/lib/qr/types.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

async function makeUser(email: string): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}
async function qr(userId: string, name: string, url = `https://example.com/${encodeURIComponent(name)}`, campaignId: string | null = null) {
  const r = await createTrackedQr(db, userId, { name, kind: 'url', payload: { kind: 'url', url } as QrPayload, design: designForSaving({}), destination: url, campaignId }, null);
  assert.ok(r.ok, `${name} saved`);
  const [link] = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, r.shortCode));
  return { id: r.id, shortCode: r.shortCode, linkId: link.id };
}
const camp = async (userId: string, name: string) => {
  const r = await createCampaign(db, userId, { name, description: '', startsOn: null, endsOn: null });
  assert.ok(r.ok, `campaign ${name}`);
  return r.id;
};
const PHONE = { deviceClass: 'mobile', referrerHost: 'instagram.com', country: 'IN' } as const;
const DESKTOP = { deviceClass: 'desktop', referrerHost: null, country: 'US' } as const;
const BOT = { deviceClass: 'bot', referrerHost: null, country: null } as const;
const destinationOf = async (linkId: string) => (await db.select({ d: links.destination }).from(links).where(eq(links.id, linkId)))[0].d;

// ─── Rules ──────────────────────────────────────────────────────────────────

test('campaign input: name 1–80, description ≤ 500, real dates, end not before start', () => {
  assert.deepEqual(cleanCampaign({ name: '  Diwali   flyers ', description: ' Print run 1 ', startsOn: '2026-11-01', endsOn: '2026-11-15' }), {
    ok: true, value: { name: 'Diwali flyers', description: 'Print run 1', startsOn: '2026-11-01', endsOn: '2026-11-15' },
  });
  assert.deepEqual(cleanCampaign({ name: 'Open ended' }), { ok: true, value: { name: 'Open ended', description: '', startsOn: null, endsOn: null } });
  for (const bad of [{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(81) }, { name: 5 }, null, 'x']) assert.equal(cleanCampaign(bad).ok, false, JSON.stringify(bad));
  assert.equal(cleanCampaign({ name: 'A', description: 'x'.repeat(501) }).ok, false);
  assert.equal(cleanCampaign({ name: 'A', startsOn: '2026-02-30' }).ok, false);
  assert.equal(cleanCampaign({ name: 'A', startsOn: '2026-11-10', endsOn: '2026-11-01' }).ok, false);
  assert.equal(cleanCampaign({ name: 'A', startsOn: '1 Nov' }).ok, false);
});

test('ranges: only 7, 30 and 90 days', () => {
  assert.equal(parseRange('7'), 7);
  assert.equal(parseRange(30), 30);
  assert.equal(parseRange('90'), 90);
  for (const bad of [0, 1, 14, 365, '', 'x', null, undefined]) assert.equal(parseRange(bad), null, String(bad));
});

test('plans: campaigns, breakdowns and export are QR Pro only; the free account keeps its 3 codes', async () => {
  const free = entitlementsFrom(await getEntitlements(db, await makeUser('ws-free@example.test')));
  const proId = await makeUser('ws-pro@example.test');
  await db.insert(subscriptions).values({ userId: proId, provider: 'manual', providerRef: 'manual:ws-pro', planKey: 'qr_pro', status: 'active' });
  const pro = entitlementsFrom(await getEntitlements(db, proId));
  for (const key of ['qr_campaigns', 'qr_breakdowns', 'qr_export'] as const) {
    assert.equal(free.can(key), false, `${key} free`);
    assert.equal(pro.can(key), true, `${key} Pro`);
  }
  assert.equal(free.limit('qr_dynamic'), 3);
  assert.equal(pro.limit('qr_dynamic'), null);
});

// ─── Campaigns: grouping only ───────────────────────────────────────────────

test('a campaign groups codes; assigning, moving and renaming never change a destination, status or scan count', async () => {
  const u = await makeUser('ws-group@example.test');
  const a = await qr(u, 'Poster A', 'https://example.com/a');
  const b = await qr(u, 'Poster B', 'https://example.com/b');
  await recordClick(db, a.linkId, PHONE);
  await setQrStatus(db, u, b.id, 'disabled');
  const c1 = await camp(u, 'Diwali');
  const c2 = await camp(u, 'Holi');

  const snapshot = async () => (await db.select({ d: links.destination, s: links.status, n: links.clickCount, code: links.shortCode, upd: links.updatedAt }).from(links).where(eq(links.accountId, u))).sort((x, y) => x.code.localeCompare(y.code));
  const before = await snapshot();
  assert.equal(await setQrCampaign(db, u, a.id, c1), true);
  assert.equal(await setQrCampaign(db, u, b.id, c1), true);
  assert.equal(await setQrCampaign(db, u, a.id, c2), true, 'moving between campaigns');
  assert.equal(await renameQr(db, u, a.id, 'Poster A (renamed)'), true);
  const upd = await updateCampaign(db, u, c1, { name: 'Diwali 2026', description: 'x', startsOn: '2026-11-01', endsOn: null });
  assert.ok(upd.ok);
  assert.deepEqual(await snapshot(), before, 'links (destination, status, scans, codes, updated_at) are exactly as they were');

  const list = await listQr(db, u);
  assert.equal(list.find((x) => x.id === a.id)?.campaignName, 'Holi');
  assert.equal(list.find((x) => x.id === b.id)?.campaignName, 'Diwali 2026');
  assert.equal((await getQr(db, u, b.id))?.status, 'disabled', 'a paused code stays paused');
  assert.equal(await setQrCampaign(db, u, a.id, null), true);
  assert.equal((await getQr(db, u, a.id))?.campaignId, null, 'taken out again');
});

test('deleting a campaign ungroups its codes and keeps their links, destinations and scans', async () => {
  const u = await makeUser('ws-delcamp@example.test');
  const a = await qr(u, 'Keep me', 'https://example.com/keep');
  await recordClick(db, a.linkId, PHONE);
  const c = await camp(u, 'Temporary');
  await setQrCampaign(db, u, a.id, c);
  assert.equal(await deleteCampaign(db, u, c), true);
  const after = await getQr(db, u, a.id);
  assert.equal(after?.campaignId, null);
  assert.equal(after?.scans, 1);
  assert.equal(after?.destination, 'https://example.com/keep');
  assert.equal(after?.status, 'active');
  assert.equal(await deleteCampaign(db, u, c), false);
  assert.equal((await db.select().from(clickEvents).where(eq(clickEvents.linkId, a.linkId))).length, 1);
});

test('ownership: another user can’t assign into your campaign, move your code, or see or change either', async () => {
  const a = await makeUser('ws-own-a@example.test');
  const b = await makeUser('ws-own-b@example.test');
  const mine = await qr(a, 'Mine', 'https://example.com/mine');
  const theirs = await qr(b, 'Theirs', 'https://example.com/theirs');
  const campA = await camp(a, 'A campaign');
  const campB = await camp(b, 'B campaign');

  assert.equal(await setQrCampaign(db, b, theirs.id, campA), false, 'B can’t put a code into A’s campaign');
  assert.equal(await setQrCampaign(db, a, mine.id, campB), false, 'A can’t use B’s campaign');
  assert.equal(await setQrCampaign(db, b, mine.id, campB), false, 'B can’t move A’s code');
  assert.equal(await setQrCampaign(db, b, mine.id, null), false, 'or ungroup it');
  assert.equal(await deleteCampaign(db, b, campA), false);
  assert.deepEqual(await updateCampaign(db, b, campA, { name: 'Pwned', description: '', startsOn: null, endsOn: null }), { ok: false, reason: 'not_found' });
  assert.equal(await getCampaign(db, b, campA), null);
  assert.deepEqual((await listCampaigns(db, b)).map((c) => c.name), ['B campaign']);
  assert.equal((await getQr(db, a, mine.id))?.campaignId, null);
  assert.equal((await getQr(db, b, theirs.id))?.campaignId, null);
  assert.equal((await getQr(db, a, mine.id))?.destination, 'https://example.com/mine');

  // A duplicate made into someone else's campaign just stays ungrouped.
  const dup = await qr(b, 'Dup', 'https://example.com/dup', campA);
  assert.equal((await getQr(db, b, dup.id))?.campaignId, null);
  const ok = await qr(b, 'Dup 2', 'https://example.com/dup2', campB);
  assert.equal((await getQr(db, b, ok.id))?.campaignId, campB);
});

test('campaign names are unique per user (any case); the cap holds; 50 per account', async () => {
  const u = await makeUser('ws-names@example.test');
  const o = await makeUser('ws-names-other@example.test');
  await camp(u, 'Spring Sale');
  assert.deepEqual(await createCampaign(db, u, { name: 'spring sale', description: '', startsOn: null, endsOn: null }), { ok: false, reason: 'duplicate_name' });
  assert.ok((await createCampaign(db, o, { name: 'Spring Sale', description: '', startsOn: null, endsOn: null })).ok, 'another user may reuse the name');
  const other = await camp(u, 'Other');
  assert.deepEqual(await updateCampaign(db, u, other, { name: 'SPRING SALE', description: '', startsOn: null, endsOn: null }), { ok: false, reason: 'duplicate_name' });
  for (let i = 0; i < CAMPAIGN_CAP - 2; i++) await camp(u, `Bulk ${i}`);
  assert.equal(await countCampaigns(db, u), CAMPAIGN_CAP);
  assert.deepEqual(await createCampaign(db, u, { name: 'One too many', description: '', startsOn: null, endsOn: null }), { ok: false, reason: 'cap' });
});

test('deleting a code removes it from its campaign’s totals; deleting the user removes the campaigns', async () => {
  const u = await makeUser('ws-cascade@example.test');
  const c = await camp(u, 'Run 1');
  const a = await qr(u, 'A', 'https://example.com/a', c);
  const b = await qr(u, 'B', 'https://example.com/b', c);
  await recordClick(db, a.linkId, PHONE);
  await recordClick(db, b.linkId, PHONE);
  await recordClick(db, b.linkId, DESKTOP);
  assert.deepEqual((await getCampaign(db, u, c)), { ...(await getCampaign(db, u, c))!, codes: 2, scans: 3 });
  await deleteQr(db, u, b.id);
  const now = await getCampaign(db, u, c);
  assert.equal(now?.codes, 1);
  assert.equal(now?.scans, 1);
  await db.delete(authUsers).where(eq(authUsers.id, u));
  assert.equal((await db.select().from(qrCampaigns).where(eq(qrCampaigns.userId, u))).length, 0);
  assert.equal((await db.select().from(qrCodes).where(eq(qrCodes.userId, u))).length, 0);
});

// ─── Statistics ─────────────────────────────────────────────────────────────

test('scans mean one thing: all-time `click_count` equals non-bot events, with bots and pauses mixed in', async () => {
  const u = await makeUser('ws-consistency@example.test');
  const a = await qr(u, 'Mixed');
  for (const meta of [PHONE, DESKTOP, BOT, PHONE, { deviceClass: 'unknown', referrerHost: null, country: null } as const, BOT]) await recordClick(db, a.linkId, meta);
  await setQrStatus(db, u, a.id, 'disabled');
  await recordClick(db, a.linkId, PHONE); // paused: recorded nowhere
  await setQrStatus(db, u, a.id, 'active');
  await recordClick(db, a.linkId, DESKTOP);

  const stats = await getQrStats(db, u, { days: 90, timeZone: 'Asia/Kolkata', breakdowns: true });
  const events = await db.select().from(clickEvents).where(eq(clickEvents.linkId, a.linkId));
  const people = events.filter((e) => e.deviceClass !== 'bot').length;
  assert.equal(events.length, 7, 'bots are logged as events; the paused click wasn’t');
  assert.equal(people, 5);
  assert.equal(stats.totals.allTime, people, 'click_count agrees with the event rule');
  assert.equal(stats.totals.inRange, people, 'the 90-day series agrees too');
  assert.equal(stats.series.reduce((n, d) => n + d.scans, 0), people);
  assert.equal(stats.codes[0].allTime, people);
  assert.equal(stats.codes[0].inRange, people);
  const bk = stats.breakdowns!;
  assert.equal(bk.devices.reduce((n, d) => n + d.scans, 0), people, 'breakdowns add up to the same figure');
  assert.equal(bk.countries.reduce((n, d) => n + d.scans, 0), people);
  assert.equal(bk.referrers.reduce((n, d) => n + d.scans, 0), people);
  assert.deepEqual(bk.devices.find((d) => d.label === 'bot'), undefined);
});

test('dashboard figures: codes, active, paused, all-time, this month, range — and range labels', async () => {
  const u = await makeUser('ws-kpi@example.test');
  const a = await qr(u, 'A');
  const b = await qr(u, 'B');
  await qr(u, 'C');
  await setQrStatus(db, u, b.id, 'disabled');
  const now = new Date(Date.UTC(2026, 9, 25, 6, 0, 0)); // 25 Oct 2026, 11:30 IST
  const at = (linkId: string, iso: string, deviceClass: 'mobile' | 'bot' = 'mobile') => db.insert(clickEvents).values({ linkId, occurredAt: new Date(iso), deviceClass });
  await at(a.linkId, '2026-10-24T10:00:00Z');
  await at(a.linkId, '2026-10-02T10:00:00Z'); // this month, outside 7 days
  await at(a.linkId, '2026-09-20T10:00:00Z'); // last month, inside 90 days
  await at(a.linkId, '2026-10-24T11:00:00Z', 'bot');
  await db.update(links).set({ clickCount: 3 }).where(eq(links.id, a.linkId));

  const s7 = await getQrStats(db, u, { days: 7, timeZone: 'Asia/Kolkata', breakdowns: false, now });
  assert.deepEqual([s7.totals.codes, s7.totals.active, s7.totals.paused], [3, 2, 1]);
  assert.equal(s7.totals.allTime, 3, 'lifetime');
  assert.equal(s7.totals.thisMonth, 2, 'calendar month (Oct) in India');
  assert.equal(s7.totals.inRange, 1, 'last 7 days');
  assert.deepEqual([s7.range.days, s7.range.from, s7.range.to], [7, '2026-10-19', '2026-10-25']);
  assert.equal(s7.series.length, 7);
  assert.equal(s7.breakdowns, null, 'no breakdowns unless asked for');
  const s30 = await getQrStats(db, u, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: false, now });
  assert.equal(s30.totals.inRange, 2);
  const s90 = await getQrStats(db, u, { days: 90, timeZone: 'Asia/Kolkata', breakdowns: false, now });
  assert.equal(s90.totals.inRange, 3);
  assert.equal(s90.series.length, 90);
  assert.equal(s90.codes.find((c) => c.id === a.id)?.inRange, 3);
});

test('"this month" and days follow the visitor’s zone: 00:15 on 1 Nov in India is still October in UTC', async () => {
  const u = await makeUser('ws-month@example.test');
  const a = await qr(u, 'Edge');
  const now = new Date(Date.UTC(2026, 9, 31, 19, 0, 0)); // 1 Nov 00:30 IST · 31 Oct 19:00 UTC
  await db.insert(clickEvents).values({ linkId: a.linkId, occurredAt: new Date('2026-10-31T17:00:00Z'), deviceClass: 'mobile' }); // 22:30 IST on 31 Oct
  await db.insert(clickEvents).values({ linkId: a.linkId, occurredAt: new Date('2026-10-31T18:45:00Z'), deviceClass: 'mobile' }); // 00:15 IST on 1 Nov
  const ist = await getQrStats(db, u, { days: 7, timeZone: 'Asia/Kolkata', breakdowns: false, now });
  assert.equal(ist.range.to, '2026-11-01');
  assert.equal(ist.totals.thisMonth, 1, 'India: only the 00:15 scan is in November');
  assert.equal(ist.series.at(-1)?.scans, 1);
  assert.equal(ist.series.at(-2)?.scans, 1);
  const utc = await getQrStats(db, u, { days: 7, timeZone: 'UTC', breakdowns: false, now });
  assert.equal(utc.range.to, '2026-10-31');
  assert.equal(utc.totals.thisMonth, 2, 'UTC: both scans are in October');
});

test('campaign totals count each code once, follow a code when it moves, and the campaign scope excludes other codes', async () => {
  const u = await makeUser('ws-camptotal@example.test');
  const c1 = await camp(u, 'One');
  const c2 = await camp(u, 'Two');
  const a = await qr(u, 'A', 'https://example.com/a', c1);
  const b = await qr(u, 'B', 'https://example.com/b', c1);
  const loose = await qr(u, 'Loose', 'https://example.com/loose');
  for (const l of [a, a, b, loose, loose, loose]) await recordClick(db, l.linkId, PHONE);

  const one = await getQrStats(db, u, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: false, scope: { campaignId: c1 } });
  assert.equal(one.totals.codes, 2);
  assert.equal(one.totals.allTime, 3);
  assert.equal(one.totals.inRange, 3, 'each scan counted once (no join fan-out)');
  assert.equal((await getCampaign(db, u, c1))?.scans, 3);
  const all = await getQrStats(db, u, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: false });
  assert.equal(all.totals.inRange, 6);
  assert.equal(all.totals.allTime, 6);

  await setQrCampaign(db, u, a.id, c2);
  assert.equal((await getCampaign(db, u, c1))?.scans, 1);
  assert.equal((await getCampaign(db, u, c2))?.scans, 2);
  const single = await getQrStats(db, u, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: false, scope: { qrId: loose.id } });
  assert.deepEqual([single.totals.codes, single.totals.inRange], [1, 3]);
});

test('statistics never include another user’s codes or scans', async () => {
  const a = await makeUser('ws-iso-a@example.test');
  const b = await makeUser('ws-iso-b@example.test');
  const ca = await camp(a, 'Private');
  const qa = await qr(a, 'A only', 'https://example.com/a', ca);
  const qb = await qr(b, 'B only', 'https://example.com/b');
  await recordClick(db, qa.linkId, PHONE);
  await recordClick(db, qb.linkId, DESKTOP);
  await recordClick(db, qb.linkId, DESKTOP);

  const sa = await getQrStats(db, a, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: true });
  const sb = await getQrStats(db, b, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: true });
  assert.deepEqual([sa.totals.codes, sa.totals.allTime, sa.totals.inRange], [1, 1, 1]);
  assert.deepEqual([sb.totals.codes, sb.totals.allTime, sb.totals.inRange], [1, 2, 2]);
  assert.deepEqual(sb.breakdowns?.countries, [{ label: 'US', scans: 2 }]);
  // Asking for A's campaign or code as B finds nothing.
  const probe = await getQrStats(db, b, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: true, scope: { campaignId: ca } });
  assert.equal(probe.totals.codes, 0);
  const probe2 = await getQrStats(db, b, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: true, scope: { qrId: qa.id } });
  assert.deepEqual([probe2.totals.codes, probe2.totals.inRange], [0, 0]);
  assert.deepEqual((await exportScans(db, b, { timeZone: 'UTC' }, 100, { qrId: qa.id })), []);
});

test('breakdowns: country, device and referrer, with plain labels for the unknown', async () => {
  const u = await makeUser('ws-breakdown@example.test');
  const a = await qr(u, 'B');
  await recordClick(db, a.linkId, PHONE);
  await recordClick(db, a.linkId, PHONE);
  await recordClick(db, a.linkId, DESKTOP);
  await recordClick(db, a.linkId, { deviceClass: 'tablet', referrerHost: null, country: null });
  const { breakdowns } = await getQrStats(db, u, { days: 30, timeZone: 'Asia/Kolkata', breakdowns: true });
  assert.deepEqual(breakdowns?.countries, [{ label: 'IN', scans: 2 }, { label: 'US', scans: 1 }, { label: 'Unknown', scans: 1 }]);
  assert.deepEqual(breakdowns?.devices, [{ label: 'mobile', scans: 2 }, { label: 'desktop', scans: 1 }, { label: 'tablet', scans: 1 }]);
  assert.deepEqual(breakdowns?.referrers, [{ label: 'Direct or unknown', scans: 2 }, { label: 'instagram.com', scans: 2 }], 'ties are ordered by label, so the order is stable');
});

// ─── Exports ────────────────────────────────────────────────────────────────

test('export: code rows carry names, campaign, all-time and range scans; scan rows leave bots out and respect the range and scope', async () => {
  const u = await makeUser('ws-export@example.test');
  const c = await camp(u, '=Campaign');
  const a = await qr(u, '+Poster', 'https://example.com/a', c);
  const b = await qr(u, 'Plain', 'https://example.com/b');
  const at = (linkId: string, iso: string, country: string | null, deviceClass: 'mobile' | 'bot' = 'mobile') =>
    db.insert(clickEvents).values({ linkId, occurredAt: new Date(iso), deviceClass, country, referrerHost: country ? 'example.org' : null });
  await at(a.linkId, '2026-10-10T10:00:00Z', 'IN');
  await at(a.linkId, '2026-10-20T10:00:00Z', 'US');
  await at(a.linkId, '2026-10-20T11:00:00Z', null, 'bot');
  await at(b.linkId, '2026-10-20T12:00:00Z', 'IN');
  await db.update(links).set({ clickCount: 2 }).where(eq(links.id, a.linkId));

  const codes = await exportCodes(db, u, { timeZone: 'Asia/Kolkata', from: '2026-10-15', to: '2026-10-31' });
  const ca = codes.find((x) => x.name === '+Poster')!;
  assert.deepEqual([ca.campaign, ca.allTime, ca.inRange, ca.status], ['=Campaign', 2, 1, 'active']);
  assert.equal(codes.find((x) => x.name === 'Plain')?.inRange, 1);
  assert.equal(codes.find((x) => x.name === 'Plain')?.campaign, null);

  const scans = await exportScans(db, u, { timeZone: 'Asia/Kolkata' }, 100);
  assert.equal(scans.length, 3, 'the bot is not a scan');
  assert.deepEqual(scans.map((s) => s.country), ['IN', 'US', 'IN']);
  const ranged = await exportScans(db, u, { timeZone: 'Asia/Kolkata', from: '2026-10-15', to: '2026-10-20' }, 100);
  assert.equal(ranged.length, 2, '`to` is inclusive of the whole local day');
  const one = await exportScans(db, u, { timeZone: 'Asia/Kolkata' }, 100, { campaignId: c });
  assert.deepEqual(one.map((s) => [s.name, s.campaign]), [['+Poster', '=Campaign'], ['+Poster', '=Campaign']]);
  const capped = await exportScans(db, u, { timeZone: 'Asia/Kolkata' }, 2);
  assert.equal(capped.length, 3, 'reads one past the limit so the caller can refuse instead of cutting');
});

test('pause, resume and redirect behave exactly as before for a code in a campaign', async () => {
  const u = await makeUser('ws-pause@example.test');
  const c = await camp(u, 'Live');
  const a = await qr(u, 'Printed', 'https://example.com/printed', c);
  const { resolveShortLink } = await import('../db/links.ts');
  assert.equal((await resolveShortLink(db, a.shortCode)).outcome, 'redirect');
  await setQrStatus(db, u, a.id, 'disabled');
  assert.equal((await resolveShortLink(db, a.shortCode)).outcome, 'disabled');
  await setQrStatus(db, u, a.id, 'active');
  const r = await resolveShortLink(db, a.shortCode);
  assert.deepEqual(r.outcome === 'redirect' && r.destination, 'https://example.com/printed');
  await deleteCampaign(db, u, c);
  assert.equal((await resolveShortLink(db, a.shortCode)).outcome, 'redirect', 'even after its campaign is deleted');
  assert.equal(await destinationOf(a.linkId), 'https://example.com/printed');
});

// ─── The destination check Save and Duplicate share ─────────────────────────

test('Save and Duplicate use one destination check: it works the link out afresh, refuses flagged and shortener links, and re-screens each time', async () => {
  const { checkTrackedDestination } = await import('../app/lib/qr/destination.ts');
  const realFetch = globalThis.fetch;
  const realKey = process.env.WEB_RISK_API_KEY;
  const calls: string[] = [];
  const answer = (body: unknown, ok = true) => (async (url: string) => { calls.push(String(url)); return { ok, status: ok ? 200 : 500, json: async () => body }; }) as unknown as typeof fetch;
  try {
    process.env.WEB_RISK_API_KEY = 'test-key';
    const payload = { kind: 'url', url: 'example.com/offer' } as QrPayload;

    globalThis.fetch = answer({});
    const safe = await checkTrackedDestination(payload, 'test');
    assert.ok(safe.ok && safe.destination === 'https://example.com/offer' && safe.screenedAt instanceof Date, 'cleared: worked out from the payload and stamped');

    globalThis.fetch = answer({ threat: { threatTypes: ['SOCIAL_ENGINEERING'] } });
    const flagged = await checkTrackedDestination(payload, 'test');
    assert.deepEqual(flagged.ok === false && flagged.error, 'blocked_url', 'a link flagged since the original was saved is refused on a copy');

    globalThis.fetch = answer({}, false);
    const down = await checkTrackedDestination(payload, 'test');
    assert.ok(down.ok && down.screenedAt === null, 'screening down: allowed, and left unscreened (fails open, like the shortener)');

    assert.equal(calls.length, 3, 'every check screens again');
    const shortener = await checkTrackedDestination({ kind: 'url', url: 'https://bit.ly/abc123' } as QrPayload, 'test');
    assert.equal(shortener.ok === false && shortener.error, 'blocked_url');
    const bad = await checkTrackedDestination({ kind: 'url', url: 'javascript:alert(1)' } as QrPayload, 'test');
    assert.equal(bad.ok === false && bad.error, 'invalid_url');
    assert.equal(calls.length, 3, 'refused links never reach the screening call');
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.WEB_RISK_API_KEY;
    else process.env.WEB_RISK_API_KEY = realKey;
  }
});

// ─── The QR limit is enforced by the database, not just checked by the app ──

/** An insert that skips the app's own check entirely — what a save that lost a race looks like to the database. */
async function rawSave(userId: string, code: string) {
  const l = await db.execute(sql`insert into links (short_code, destination, account_id) values (${code}, 'https://example.com/raw', ${userId}::uuid) returning id`);
  const linkId = (l as unknown as { rows: { id: string }[] }).rows[0].id;
  await db.execute(sql`insert into qr_codes (user_id, link_id, name, kind, payload, design) values (${userId}::uuid, ${linkId}::uuid, 'raw', 'url', '{}'::jsonb, '{}'::jsonb)`);
}
const setLimit = (v: string) => db.execute(sql`select set_config('kk.qr_limit', ${v}, false)`);

test('the trigger refuses a save past the plan limit even when the app’s pre-check is skipped (what a lost race looks like)', async () => {
  const u = await makeUser('ws-trigger@example.test');
  const other = await makeUser('ws-trigger-other@example.test');
  try {
    await setLimit('2');
    await rawSave(u, 'RawA001');
    await rawSave(u, 'RawA002');
    await assert.rejects(rawSave(u, 'RawA003'), (e) => isLimitError(e), 'the third insert is refused by the database (the trigger’s qr_limit error, wrapped by the driver)');
    await rawSave(other, 'RawB001'); // the limit is per user
  } finally {
    await setLimit('');
  }
  const mine = await db.select().from(qrCodes).where(eq(qrCodes.userId, u));
  assert.equal(mine.length, 2, 'only the two that fit are stored');
});

test('a save that passes the app’s check but loses to the trigger: the production statement is refused whole, leaving no link and no partial QR', async () => {
  const u = await makeUser('ws-lost-race@example.test');
  const input = (n: number) => ({ name: `L${n}`, kind: 'url' as const, payload: { kind: 'url', url: `https://example.com/l${n}` } as QrPayload, design: designForSaving({}), destination: `https://example.com/l${n}` });
  await qr(u, 'Seed A');
  await qr(u, 'Seed B');
  // The real createTrackedQr statement, with only its in-statement count check blinded (as a stale snapshot would blind it).
  const dialect = new PgDialect();
  let refusal: unknown = null; // what the database itself said, before createTrackedQr turned it into { ok: false }
  const blinded = {
    execute: async (q: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(q);
      const blindedText = text.replace('where (select count(*) from', 'where (select 0 * count(*) from');
      assert.notEqual(blindedText, text, 'the pre-check was found and blinded');
      try {
        return await (db as unknown as { $client: { query: (t: string, p: unknown[]) => Promise<unknown> } }).$client.query(blindedText, params as unknown[]);
      } catch (e) {
        refusal = e;
        throw e;
      }
    },
  } as unknown as Db;
  const before = { links: (await db.select().from(links).where(eq(links.accountId, u))).length, qrs: (await db.select().from(qrCodes).where(eq(qrCodes.userId, u))).length };
  assert.deepEqual(before, { links: 2, qrs: 2 });
  assert.deepEqual(await createTrackedQr(blinded, u, input(1), 2), { ok: false, reason: 'limit' }, 'refused by the trigger and reported as the ordinary limit response');
  assert.ok(refusal && isLimitError(refusal), 'the refusal came from the database (the statement ran and the trigger raised qr_limit), not from the app pre-check');
  assert.equal((await db.select().from(links).where(eq(links.accountId, u))).length, 2, 'no orphan link');
  assert.equal((await db.select().from(qrCodes).where(eq(qrCodes.userId, u))).length, 2, 'no partial QR');
  assert.ok((await createTrackedQr(blinded, u, input(2), 3)).ok, 'the same statement saves when there is room');
});

test('moving a code to another user goes through the same limit: the trigger also guards UPDATE OF user_id', async () => {
  const from = await makeUser('ws-move-from@example.test');
  const to = await makeUser('ws-move-to@example.test');
  const mine = await qr(from, 'Mine');
  await qr(to, 'Theirs 1');
  await qr(to, 'Theirs 2');
  try {
    await setLimit('2');
    await assert.rejects(db.execute(sql`update qr_codes set user_id = ${to}::uuid where id = ${mine.id}::uuid`), (e) => isLimitError(e), 'the destination account is full');
    assert.equal((await db.select().from(qrCodes).where(eq(qrCodes.userId, from))).length, 1, 'the code stayed where it was');
    await setLimit('3');
    await db.execute(sql`update qr_codes set user_id = ${to}::uuid where id = ${mine.id}::uuid`);
    assert.equal((await db.select().from(qrCodes).where(eq(qrCodes.userId, to))).length, 3, 'allowed when there is room');
  } finally {
    await setLimit('');
  }
  // Ordinary updates (rename, campaign, pause) are not touched by it.
  const c = await camp(to, 'Still fine');
  assert.ok(await renameQr(db, to, mine.id, 'Renamed'));
  assert.ok(await setQrCampaign(db, to, mine.id, c));
});

test('each save sets its own transaction-local limit, so a stale session value can neither block nor bypass it', async () => {
  const u = await makeUser('ws-orphan@example.test');
  const first = await qr(u, 'One');
  assert.ok(first.id);
  try {
    // A leftover session value of 1 must not apply: the statement sets its own (transaction-local) limit, here 5.
    await setLimit('1');
    const r = await createTrackedQr(db, u, { name: 'Two', kind: 'url', payload: { kind: 'url', url: 'https://example.com/two' } as QrPayload, design: designForSaving({}), destination: 'https://example.com/two' }, 5);
    assert.ok(r.ok, 'saved under the statement’s own limit');
  } finally {
    await setLimit('');
  }
  const links1 = await db.select().from(links).where(eq(links.accountId, u));
  const qrs = await db.select().from(qrCodes).where(eq(qrCodes.userId, u));
  assert.equal(links1.length, qrs.length, 'every owned link has its QR row');
});

test('Save and Duplicate at the limit: queued together they never exceed it, and links match codes', async () => {
  const u = await makeUser('ws-queued@example.test');
  const c = await camp(u, 'Cap');
  const make = (n: number) => createTrackedQr(db, u, { name: `C${n}`, kind: 'url', payload: { kind: 'url', url: `https://example.com/q${n}` } as QrPayload, design: designForSaving({}), destination: `https://example.com/q${n}`, campaignId: n % 2 ? c : null }, 3);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => make(i)));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.equal(results.filter((r) => !r.ok && r.reason === 'limit').length, 7);
  assert.equal((await listQr(db, u)).length, 3);
  assert.equal((await db.select().from(links).where(eq(links.accountId, u))).length, 3, 'no orphan links from the 7 refusals');
});

test('the 2,000-code hard cap is separate from the plan limit and holds for an unlimited plan', async () => {
  const u = await makeUser('ws-hardcap@example.test');
  const other = await makeUser('ws-hardcap-other@example.test');
  await db.execute(sql`
    with l as (
      insert into links (short_code, destination, account_id)
      select 'Hc' || lpad(g::text, 6, '0'), 'https://example.com/bulk', ${u}::uuid from generate_series(1, 2000) g
      returning id
    )
    insert into qr_codes (user_id, link_id, name, kind, payload, design)
    select ${u}::uuid, l.id, 'bulk', 'url', '{}'::jsonb, '{}'::jsonb from l`);
  assert.equal((await db.execute(sql`select count(*)::int as n from qr_codes where user_id = ${u}::uuid`) as unknown as { rows: { n: number }[] }).rows[0].n, 2000);
  const over = await createTrackedQr(db, u, { name: 'Past the cap', kind: 'url', payload: { kind: 'url', url: 'https://example.com/over' } as QrPayload, design: designForSaving({}), destination: 'https://example.com/over' }, null);
  assert.deepEqual(over, { ok: false, reason: 'limit' }, 'unlimited plan, still capped at 2,000');
  assert.equal((await db.select().from(links).where(eq(links.accountId, u))).length, 2000, 'nothing was left behind');
  assert.ok((await createTrackedQr(db, other, { name: 'Fine', kind: 'url', payload: { kind: 'url', url: 'https://example.com/fine' } as QrPayload, design: designForSaving({}), destination: 'https://example.com/fine' }, null)).ok, 'other accounts are unaffected');
});
