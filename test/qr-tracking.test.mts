/**
 * Tracked QR codes (first slice): which QR types can be tracked, the saved
 * design (never a logo), the free limit under parallel creates, ownership,
 * pause / delete, scan stats by day, and what survives a plan change or an
 * account deletion. Real Postgres (PGlite) with the real migrations.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import { authUsers, clickEvents, links, qrCodes, subscriptions } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import { recordClick, resolveShortLink } from '../db/links.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { deleteAccount } from '../db/accounts.ts';
import { countQr, createTrackedQr, dailyScans, deleteQr, getQr, lastDays, listQr, renameQr, setQrStatus } from '../db/qr.ts';
import { entitlementsFrom } from '../app/lib/entitlements.ts';
import { canonicalPayload, encodePayload, resolveEncodeTarget } from '../app/lib/qr/encode.ts';
import { cleanQrName, cleanTrackablePayload, designForSaving, isTrackableKind, validTimeZone } from '../app/lib/qr/tracking.ts';
import { DEFAULT_QR_DESIGN } from '../app/lib/qr/design.ts';
import type { QrPayload } from '../app/lib/qr/types.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

async function makeUser(email: string): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}
const input = (name: string, url = 'https://example.com/menu') => ({
  name,
  kind: 'url' as const,
  payload: { kind: 'url', url } as QrPayload,
  design: designForSaving({}),
  destination: url,
});
const HUMAN = { deviceClass: 'mobile', referrerHost: null, country: 'IN' } as const;

// ─── What can be tracked ────────────────────────────────────────────────────

test('only QR types whose content is an https link can be tracked', () => {
  for (const kind of ['url', 'whatsapp', 'social', 'file']) assert.equal(isTrackableKind(kind), true, kind);
  for (const kind of ['text', 'wifi', 'email', 'phone', 'sms', 'vcard', 'location', 'event', 'upi', 'nope', 7, null]) {
    assert.equal(isTrackableKind(kind), false, String(kind));
  }
  // The four really do encode https links; Location is a geo: URI, so it stays static.
  const links4: QrPayload[] = [
    { kind: 'url', url: 'example.com' },
    { kind: 'whatsapp', phone: '+91 98100 00000', message: 'Hi' },
    { kind: 'social', platform: 'instagram', url: 'https://instagram.com/kaamsolv' },
    { kind: 'file', url: 'https://example.com/menu.pdf', label: 'Menu' },
  ];
  for (const p of links4) {
    const c = canonicalPayload(p);
    assert.ok(c.ok && /^https?:\/\//.test(c.text), p.kind);
  }
  const geo = canonicalPayload({ kind: 'location', latitude: '18.52', longitude: '73.85', name: '', mapsUrl: '' });
  assert.ok(geo.ok && geo.text.startsWith('geo:'));
});

test('the saved payload keeps only the fields of a trackable type', () => {
  assert.deepEqual(cleanTrackablePayload({ kind: 'url', url: 'https://a.example', extra: 'x', password: 'p' }), { kind: 'url', url: 'https://a.example' });
  assert.equal(cleanTrackablePayload({ kind: 'wifi', ssid: 'home', password: 'secret' }), null, 'Wi-Fi passwords are never stored');
  assert.equal(cleanTrackablePayload({ kind: 'social', platform: 'myspace', url: 'https://x.example' }), null);
  assert.equal(cleanTrackablePayload('url'), null);
  assert.equal(cleanTrackablePayload(null), null);
  assert.equal((cleanTrackablePayload({ kind: 'url', url: 'x'.repeat(5000) }) as { url: string }).url.length, 2100);
});

test('the saved design has no logo and only known options', () => {
  const saved = designForSaving({
    ...DEFAULT_QR_DESIGN,
    logo: { dataUrl: 'data:image/png;base64,' + 'A'.repeat(100_000), size: 'l' },
    colors: { fg: '#fe6336', bg: 'url(x)', transparent: true },
    modules: { shape: 'dots' },
    frame: { id: 'scan-me', ctaText: 'x'.repeat(60) },
    evil: '<script>',
  });
  assert.equal('logo' in saved, false);
  assert.equal('evil' in saved, false);
  assert.equal(saved.colors.fg, '#FE6336');
  assert.equal(saved.colors.bg, DEFAULT_QR_DESIGN.colors.bg, 'a bad colour falls back');
  assert.equal(saved.modules.shape, 'dots');
  assert.equal(saved.frame.ctaText?.length, 24);
  assert.deepEqual(designForSaving('nonsense'), designForSaving({}));
  assert.ok(JSON.stringify(saved).length < 2_000);
});

test('names: trimmed, one line, 1–80 characters', () => {
  assert.equal(cleanQrName('  Table   5\n menu '), 'Table 5 menu');
  assert.equal(cleanQrName(''), null);
  assert.equal(cleanQrName('   '), null);
  assert.equal(cleanQrName('x'.repeat(81)), null);
  assert.equal(cleanQrName('x'.repeat(80))?.length, 80);
  assert.equal(cleanQrName(5), null);
});

test('the QR encodes the payload (static) or the short link (tracked) — nothing else changes', () => {
  const p: QrPayload = { kind: 'url', url: 'https://example.com/a' };
  const plain = encodePayload(p);
  assert.ok(plain.ok && plain.text === 'https://example.com/a' && plain.mode === 'static');
  const tracked = encodePayload(p, 'https://kaamsolv.com/abc1234');
  assert.ok(tracked.ok && tracked.text === 'https://kaamsolv.com/abc1234' && tracked.mode === 'tracked' && tracked.kind === 'url');
  assert.deepEqual(resolveEncodeTarget('x'), { text: 'x', mode: 'static' });
  assert.deepEqual(resolveEncodeTarget('x', null), { text: 'x', mode: 'static' });
  assert.equal(encodePayload({ kind: 'url', url: '' }, 'https://kaamsolv.com/abc1234').ok, false, 'an invalid payload is still an error');
});

test('time zones: real IANA zones pass, anything else is India', () => {
  assert.equal(validTimeZone('America/New_York'), 'America/New_York');
  assert.equal(validTimeZone('UTC'), 'UTC');
  assert.equal(validTimeZone('Asia/Kolkata'), 'Asia/Kolkata');
  for (const bad of ['', 'Nowhere/Land', "x'; drop table links;--", 5, undefined, 'a'.repeat(100)]) assert.equal(validTimeZone(bad), 'Asia/Kolkata');
});

// ─── Saving, limits, ownership ──────────────────────────────────────────────

test('saving makes an owned link and a QR row together, and the code redirects', async () => {
  const id = await makeUser('qr-save@example.test');
  const r = await createTrackedQr(db, id, input('Poster'), 3);
  assert.ok(r.ok);
  assert.match(r.shortCode, /^[0-9A-Za-z]{7}$/);
  const [link] = await db.select().from(links).where(eq(links.shortCode, r.shortCode));
  assert.equal(link.accountId, id, 'the link is owned by the user');
  assert.equal(link.destination, 'https://example.com/menu');
  assert.equal(link.status, 'active');
  assert.equal(link.clickCount, 0);
  const res = await resolveShortLink(db, r.shortCode);
  assert.deepEqual(res.outcome === 'redirect' && res.destination, 'https://example.com/menu');
  const [row] = await listQr(db, id);
  assert.deepEqual([row.name, row.kind, row.scans, row.status, row.shortCode], ['Poster', 'url', 0, 'active', r.shortCode]);
  assert.equal(await countQr(db, id), 1);
});

test('the free limit of 3 holds (saves queued together here; PGlite runs them one at a time), and a refused save leaves no orphan link', async () => {
  const id = await makeUser('qr-limit@example.test');
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => createTrackedQr(db, id, input(`Code ${i}`), 3)));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.equal(results.filter((r) => !r.ok).length, 3);
  assert.equal(await countQr(db, id), 3);
  const owned = await db.select({ id: links.id }).from(links).where(eq(links.accountId, id));
  assert.equal(owned.length, 3, 'no orphan links from refused saves');

  const four = await createTrackedQr(db, id, input('Fourth'), 3);
  assert.deepEqual(four, { ok: false, reason: 'limit' });
  const [first] = await listQr(db, id);
  assert.equal(await deleteQr(db, id, first.id), true);
  assert.equal((await createTrackedQr(db, id, input('Fourth'), 3)).ok, true, 'deleting frees a slot');
});

test('pausing does not free a slot; unlimited (null) still has the account-wide cap', async () => {
  const id = await makeUser('qr-pause-limit@example.test');
  const a = await createTrackedQr(db, id, input('A'), 1);
  assert.ok(a.ok);
  const [row] = await listQr(db, id);
  await setQrStatus(db, id, row.id, 'disabled');
  assert.deepEqual(await createTrackedQr(db, id, input('B'), 1), { ok: false, reason: 'limit' });
  assert.equal((await createTrackedQr(db, id, input('B'), null)).ok, true, 'a null limit means unlimited');
});

test('plans: a free account may track 3; qr_pro has no limit; losing a plan never touches the codes', async () => {
  const free = await makeUser('qr-plan-free@example.test');
  assert.equal(entitlementsFrom(await getEntitlements(db, free)).limit('qr_dynamic'), 3);
  const pro = await makeUser('qr-plan-pro@example.test');
  await db.insert(subscriptions).values({ userId: pro, provider: 'manual', providerRef: 'manual:qr-pro', planKey: 'qr_pro', status: 'active' });
  assert.equal(entitlementsFrom(await getEntitlements(db, pro)).limit('qr_dynamic'), null);

  // Pro makes 5; the subscription lapses; the 5 codes keep redirecting and stay listed.
  const codes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await createTrackedQr(db, pro, input(`P${i}`), null);
    assert.ok(r.ok);
    codes.push(r.shortCode);
  }
  await db.update(subscriptions).set({ status: 'canceled' }).where(eq(subscriptions.userId, pro));
  assert.equal(entitlementsFrom(await getEntitlements(db, pro)).limit('qr_dynamic'), 3);
  assert.equal(await countQr(db, pro), 5);
  for (const code of codes) assert.equal((await resolveShortLink(db, code)).outcome, 'redirect', 'the redirect never looks at plans');
  assert.deepEqual(await createTrackedQr(db, pro, input('More'), 3), { ok: false, reason: 'limit' }, 'but no new ones above the free limit');
});

test('another user can’t read, rename, pause or delete a code — it is simply not found', async () => {
  const a = await makeUser('qr-own-a@example.test');
  const b = await makeUser('qr-own-b@example.test');
  const made = await createTrackedQr(db, a, input('Mine'), 3);
  assert.ok(made.ok);
  assert.equal(await getQr(db, b, made.id), null);
  assert.deepEqual(await listQr(db, b), []);
  assert.equal(await renameQr(db, b, made.id, 'Pwned'), false);
  assert.equal(await setQrStatus(db, b, made.id, 'disabled'), false);
  assert.equal(await deleteQr(db, b, made.id), false);
  assert.equal(await dailyScans(db, b, made.id), null);
  const mine = await getQr(db, a, made.id);
  assert.equal(mine?.name, 'Mine');
  assert.equal(mine?.status, 'active');
  assert.deepEqual(mine?.payload, { kind: 'url', url: 'https://example.com/menu' });
  assert.equal((await resolveShortLink(db, made.shortCode)).outcome, 'redirect');
});

// ─── Pause, resume, delete, account deletion ────────────────────────────────

test('pause → link unavailable, resume → redirects again, rename keeps the link', async () => {
  const id = await makeUser('qr-pause@example.test');
  const made = await createTrackedQr(db, id, input('Flyer'), 3);
  assert.ok(made.ok);
  assert.equal(await setQrStatus(db, id, made.id, 'disabled'), true);
  assert.equal((await resolveShortLink(db, made.shortCode)).outcome, 'disabled');
  assert.equal((await getQr(db, id, made.id))?.status, 'disabled');
  assert.equal(await setQrStatus(db, id, made.id, 'active'), true);
  assert.equal((await resolveShortLink(db, made.shortCode)).outcome, 'redirect');
  assert.equal(await renameQr(db, id, made.id, 'Flyer v2'), true);
  assert.equal((await getQr(db, id, made.id))?.name, 'Flyer v2');
  assert.equal((await resolveShortLink(db, made.shortCode)).outcome, 'redirect');
});

test('deleting removes the code, its link and its scans; the printed copy is "not found"', async () => {
  const id = await makeUser('qr-delete@example.test');
  const made = await createTrackedQr(db, id, input('Gone'), 3);
  assert.ok(made.ok);
  const [link] = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, made.shortCode));
  await recordClick(db, link.id, HUMAN);
  assert.equal(await deleteQr(db, id, made.id), true);
  assert.equal((await resolveShortLink(db, made.shortCode)).outcome, 'not_found');
  assert.equal((await db.select().from(qrCodes).where(eq(qrCodes.id, made.id))).length, 0);
  assert.equal((await db.select().from(clickEvents).where(eq(clickEvents.linkId, link.id))).length, 0);
  assert.equal(await deleteQr(db, id, made.id), false);
});

test('deleting an account removes its tracked links, QR rows and scans — and leaves others alone', async () => {
  const gone = await makeUser('qr-acct-gone@example.test');
  const keep = await makeUser('qr-acct-keep@example.test');
  const g = await createTrackedQr(db, gone, input('G'), 3);
  const k = await createTrackedQr(db, keep, input('K'), 3);
  assert.ok(g.ok && k.ok);
  const [gl] = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, g.shortCode));
  await recordClick(db, gl.id, HUMAN);
  // An anonymous shortener link (no owner) is untouched by anyone's deletion.
  await db.insert(links).values({ shortCode: 'AnonLnk', destination: 'https://example.org' });

  await deleteAccount(db, gone, 'qr-acct-gone@example.test');
  assert.equal((await resolveShortLink(db, g.shortCode)).outcome, 'not_found');
  assert.equal((await db.select().from(qrCodes).where(eq(qrCodes.userId, gone))).length, 0);
  assert.equal((await db.select().from(clickEvents).where(eq(clickEvents.linkId, gl.id))).length, 0);
  assert.equal((await resolveShortLink(db, k.shortCode)).outcome, 'redirect');
  assert.equal((await resolveShortLink(db, 'AnonLnk')).outcome, 'redirect');
});

// ─── Scans ──────────────────────────────────────────────────────────────────

test('scans: people are counted, bots and previews are not; the total matches the list', async () => {
  const id = await makeUser('qr-scans@example.test');
  const made = await createTrackedQr(db, id, input('Counter'), 3);
  assert.ok(made.ok);
  const [link] = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, made.shortCode));
  await recordClick(db, link.id, HUMAN);
  await recordClick(db, link.id, { deviceClass: 'desktop', referrerHost: null, country: null });
  await recordClick(db, link.id, { deviceClass: 'bot', referrerHost: null, country: null });
  const [row] = await listQr(db, id);
  assert.equal(row.scans, 2);
  assert.ok(row.lastScanAt);
  const days = await dailyScans(db, id, made.id);
  assert.equal(days?.length, 30);
  assert.equal(days?.reduce((n, d) => n + d.scans, 0), 2, 'the chart leaves the bot out too');
});

test('days are cut in the visitor’s time zone: 11:30 PM UTC on the 24th is already the 25th in India', async () => {
  const id = await makeUser('qr-tz@example.test');
  const made = await createTrackedQr(db, id, input('Midnight'), 3);
  assert.ok(made.ok);
  const [link] = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, made.shortCode));
  const now = new Date(Date.UTC(2026, 9, 25, 6, 0, 0)); // 25 Oct 2026, 11:30 AM IST
  const at = (iso: string) => db.insert(clickEvents).values({ linkId: link.id, occurredAt: new Date(iso), deviceClass: 'mobile' });
  await at('2026-10-24T23:30:00Z'); // 25 Oct 05:00 IST · 24 Oct UTC
  await at('2026-10-25T01:00:00Z'); // 25 Oct IST and UTC
  await at('2026-10-24T10:00:00Z'); // 24 Oct IST and UTC

  const ist = await dailyScans(db, id, made.id, 'Asia/Kolkata', 30, now);
  const day = (d: string, list = ist) => list?.find((x) => x.day === d)?.scans;
  assert.equal(ist?.at(-1)?.day, '2026-10-25');
  assert.equal(day('2026-10-25'), 2, 'India: the 23:30 UTC scan belongs to the 25th');
  assert.equal(day('2026-10-24'), 1);

  const utc = await dailyScans(db, id, made.id, 'UTC', 30, now);
  assert.equal(day('2026-10-25', utc), 1, 'UTC: only the 01:00 scan is on the 25th');
  assert.equal(day('2026-10-24', utc), 2);

  const ny = await dailyScans(db, id, made.id, 'America/New_York', 30, now);
  assert.equal(ny?.at(-1)?.day, '2026-10-25');
  assert.equal(day('2026-10-24', ny), 3, 'New York is still on the 24th for all three');
});

test('last days: 30 consecutive days ending today in the zone, across a month end and a leap day', () => {
  const list = lastDays(30, 'Asia/Kolkata', new Date(Date.UTC(2026, 9, 25, 6, 0, 0)));
  assert.equal(list.length, 30);
  assert.equal(list[0], '2026-09-26');
  assert.equal(list.at(-1), '2026-10-25');
  const leap = lastDays(3, 'UTC', new Date(Date.UTC(2028, 2, 1, 5, 0, 0)));
  assert.deepEqual(leap, ['2028-02-28', '2028-02-29', '2028-03-01']);
  // Just after midnight in India the local day has already turned.
  assert.equal(lastDays(1, 'Asia/Kolkata', new Date(Date.UTC(2026, 9, 31, 19, 0, 0)))[0], '2026-11-01');
});
