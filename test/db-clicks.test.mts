/**
 * Phase 2b.1 — click recording and link controls, against real Postgres
 * (in-memory PGlite with the real migrations applied).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { clickEvents, links } from '../db/schema.ts';
import {
  createShortLink,
  getClickBreakdown,
  getLinkByCode,
  recordClick,
  resolveShortLink,
  setLinkStatus,
  type Db,
} from '../db/links.ts';
import type { ClickMeta } from '../app/lib/click-meta.ts';
import { makeTestDb } from './helpers/test-db.mts';

const human: ClickMeta = { deviceClass: 'mobile', referrerHost: 'web.whatsapp.com', country: 'IN' };
const bot: ClickMeta = { deviceClass: 'bot', referrerHost: null, country: 'US' };

async function withDb(fn: (db: Db) => Promise<void>) {
  const { db, close } = await makeTestDb();
  try {
    await fn(db);
  } finally {
    await close();
  }
}

const linkRow = async (db: Db, id: string) =>
  (await db.select().from(links).where(eq(links.id, id)))[0];
const eventsFor = (db: Db, id: string) =>
  db.select().from(clickEvents).where(eq(clickEvents.linkId, id));

// ---------------------------------------------------------------- recording

test('a human click writes one event with exactly the designed fields', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await recordClick(db, link.id, human);

    const events = await eventsFor(db, link.id);
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.linkId, link.id);
    assert.equal(e.deviceClass, 'mobile');
    assert.equal(e.referrerHost, 'web.whatsapp.com');
    assert.equal(e.country, 'IN');
    assert.ok(e.occurredAt instanceof Date);
    // Nothing else is stored — no IP, UA or full referrer column exists.
    assert.deepEqual(Object.keys(e).sort(), [
      'country',
      'deviceClass',
      'id',
      'linkId',
      'occurredAt',
      'referrerHost',
    ]);
  });
});

test('a human click increments click_count and sets last_clicked_at', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await recordClick(db, link.id, human);
    await recordClick(db, link.id, { ...human, deviceClass: 'desktop' });

    const after = await linkRow(db, link.id);
    assert.equal(after.clickCount, 2);
    assert.ok(after.lastClickedAt instanceof Date);
    assert.equal((await eventsFor(db, link.id)).length, 2);
  });
});

test('a bot is logged as an event but does not count as a click', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await recordClick(db, link.id, bot);

    const after = await linkRow(db, link.id);
    assert.equal(after.clickCount, 0);
    assert.equal(after.lastClickedAt, null);
    const events = await eventsFor(db, link.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].deviceClass, 'bot');
  });
});

test('null referrer and country are stored as null', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await recordClick(db, link.id, { deviceClass: 'unknown', referrerHost: null, country: null });
    const [e] = await eventsFor(db, link.id);
    assert.equal(e.referrerHost, null);
    assert.equal(e.country, null);
    assert.equal(e.deviceClass, 'unknown');
  });
});

test('nothing is recorded for a disabled link', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await setLinkStatus(db, link.shortCode, 'disabled');
    await recordClick(db, link.id, human);
    await recordClick(db, link.id, bot);

    assert.equal((await linkRow(db, link.id)).clickCount, 0);
    assert.equal((await eventsFor(db, link.id)).length, 0);
  });
});

test('nothing is recorded for an expired link', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, {
      destination: 'https://example.com',
      expiresAt: new Date(Date.now() - 1000),
    });
    await recordClick(db, link.id, human);

    assert.equal((await linkRow(db, link.id)).clickCount, 0);
    assert.equal((await eventsFor(db, link.id)).length, 0);
  });
});

test('recording against an unknown link id is a silent no-op', async () => {
  await withDb(async (db) => {
    await recordClick(db, '00000000-0000-0000-0000-000000000000', human);
    assert.equal((await db.select().from(clickEvents)).length, 0);
  });
});

test('a database failure is swallowed, never thrown to the redirect', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    // Fails the country CHECK constraint → the insert errors inside recordClick.
    await assert.doesNotReject(recordClick(db, link.id, { ...human, country: 'india' }));
    // The statement is atomic: the failed event insert rolled back the count too.
    assert.equal((await linkRow(db, link.id)).clickCount, 0);
  });
});

test('the database itself rejects a malformed country or oversized referrer host', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await assert.rejects(db.insert(clickEvents).values({ linkId: link.id, country: 'IND' }));
    await assert.rejects(
      db.insert(clickEvents).values({ linkId: link.id, referrerHost: 'a'.repeat(254) }),
    );
  });
});

test('deleting a link cascades to its click events', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await recordClick(db, link.id, human);
    await db.delete(links).where(eq(links.id, link.id));
    assert.equal((await db.select().from(clickEvents)).length, 0);
  });
});

test('getClickBreakdown groups events by device class, largest first', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await recordClick(db, link.id, human);
    await recordClick(db, link.id, human);
    await recordClick(db, link.id, bot);

    assert.deepEqual(await getClickBreakdown(db, link.id), [
      { deviceClass: 'mobile', events: 2 },
      { deviceClass: 'bot', events: 1 },
    ]);
  });
});

// ----------------------------------------------------------------- controls

test('setLinkStatus disables a link and the redirect then reports it disabled', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    const updated = await setLinkStatus(db, link.shortCode, 'disabled');

    assert.equal(updated?.status, 'disabled');
    assert.ok(updated!.updatedAt.getTime() >= link.updatedAt.getTime());
    assert.deepEqual(await resolveShortLink(db, link.shortCode), { outcome: 'disabled' });
  });
});

test('setLinkStatus re-enables a link and it redirects again', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com/back' });
    await setLinkStatus(db, link.shortCode, 'disabled');
    await setLinkStatus(db, link.shortCode, 'active');

    const res = await resolveShortLink(db, link.shortCode);
    assert.equal(res.outcome, 'redirect');
  });
});

test('setLinkStatus returns null for an unknown code and changes nothing', async () => {
  await withDb(async (db) => {
    assert.equal(await setLinkStatus(db, 'nope123', 'disabled'), null);
  });
});

test('re-enabling does not resurrect an expired link', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, {
      destination: 'https://example.com',
      expiresAt: new Date(Date.now() - 1000),
    });
    await setLinkStatus(db, link.shortCode, 'disabled');
    await setLinkStatus(db, link.shortCode, 'active');
    assert.deepEqual(await resolveShortLink(db, link.shortCode), { outcome: 'expired' });
  });
});

test('disabled takes precedence over expired', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, {
      destination: 'https://example.com',
      expiresAt: new Date(Date.now() - 1000),
    });
    await setLinkStatus(db, link.shortCode, 'disabled');
    assert.deepEqual(await resolveShortLink(db, link.shortCode), { outcome: 'disabled' });
  });
});

test('createShortLink persists a chosen expiry exactly', async () => {
  await withDb(async (db) => {
    const at = new Date('2030-01-02T03:04:05.000Z');
    const link = await createShortLink(db, { destination: 'https://example.com', expiresAt: at });
    assert.equal(link.expiresAt?.toISOString(), at.toISOString());
    assert.equal((await getLinkByCode(db, link.shortCode))?.expiresAt?.toISOString(), at.toISOString());
  });
});

test('getLinkByCode returns null for an unknown code', async () => {
  await withDb(async (db) => {
    assert.equal(await getLinkByCode(db, 'nope123'), null);
  });
});
