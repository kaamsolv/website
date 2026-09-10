import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { links } from '../db/schema.ts';
import { createShortLink, recordClick, resolveShortLink } from '../db/links.ts';
import { isValidShortCodeShape } from '../app/lib/short-code.ts';
import { isReservedCode } from '../app/lib/reserved-routes.ts';
import { makeTestDb } from './helpers/test-db.mts';

test('createShortLink persists a row and returns a usable short code', async () => {
  const { db, close } = await makeTestDb();
  try {
    const row = await createShortLink(db, { destination: 'https://example.com/a' });

    assert.equal(row.destination, 'https://example.com/a');
    assert.equal(row.status, 'active');
    assert.equal(row.isCustom, false);
    assert.equal(row.clickCount, 0);
    assert.ok(isValidShortCodeShape(row.shortCode));
    assert.ok(!isReservedCode(row.shortCode));

    const found = await db.select().from(links).where(eq(links.shortCode, row.shortCode));
    assert.equal(found.length, 1);
    assert.equal(found[0].id, row.id);
  } finally {
    await close();
  }
});

test('createShortLink stores the IP hash when given, null otherwise', async () => {
  const { db, close } = await makeTestDb();
  try {
    const withHash = await createShortLink(db, {
      destination: 'https://example.com',
      createdIpHash: 'deadbeef',
    });
    const without = await createShortLink(db, { destination: 'https://example.com' });
    assert.equal(withHash.createdIpHash, 'deadbeef');
    assert.equal(without.createdIpHash, null);
  } finally {
    await close();
  }
});

test('createShortLink never returns a duplicate across many inserts', async () => {
  const { db, close } = await makeTestDb();
  try {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const row = await createShortLink(db, { destination: `https://example.com/${i}` });
      assert.ok(!seen.has(row.shortCode), `duplicate: ${row.shortCode}`);
      seen.add(row.shortCode);
    }
  } finally {
    await close();
  }
});

test('the unique index actually rejects a duplicate short_code', async () => {
  const { db, close } = await makeTestDb();
  try {
    await db.insert(links).values({ shortCode: 'abcd123', destination: 'https://a.com' });
    await assert.rejects(
      db.insert(links).values({ shortCode: 'abcd123', destination: 'https://b.com' }),
    );
  } finally {
    await close();
  }
});

test('resolveShortLink → redirect for an active link', async () => {
  const { db, close } = await makeTestDb();
  try {
    const row = await createShortLink(db, { destination: 'https://example.com/dest' });
    const res = await resolveShortLink(db, row.shortCode);
    assert.equal(res.outcome, 'redirect');
    if (res.outcome === 'redirect') {
      assert.equal(res.destination, 'https://example.com/dest');
      assert.equal(res.id, row.id);
    }
  } finally {
    await close();
  }
});

test('resolveShortLink → not_found for an unknown code', async () => {
  const { db, close } = await makeTestDb();
  try {
    const res = await resolveShortLink(db, 'nope123');
    assert.equal(res.outcome, 'not_found');
  } finally {
    await close();
  }
});

test('resolveShortLink → disabled for a disabled link', async () => {
  const { db, close } = await makeTestDb();
  try {
    const row = await createShortLink(db, { destination: 'https://example.com' });
    await db.update(links).set({ status: 'disabled' }).where(eq(links.id, row.id));
    const res = await resolveShortLink(db, row.shortCode);
    assert.equal(res.outcome, 'disabled');
  } finally {
    await close();
  }
});

test('resolveShortLink → expired once expiresAt is in the past', async () => {
  const { db, close } = await makeTestDb();
  try {
    const past = new Date(Date.now() - 60_000);
    const row = await createShortLink(db, { destination: 'https://example.com', expiresAt: past });
    const res = await resolveShortLink(db, row.shortCode);
    assert.equal(res.outcome, 'expired');
  } finally {
    await close();
  }
});

test('resolveShortLink still redirects when expiresAt is in the future', async () => {
  const { db, close } = await makeTestDb();
  try {
    const future = new Date(Date.now() + 3_600_000);
    const row = await createShortLink(db, { destination: 'https://example.com', expiresAt: future });
    const res = await resolveShortLink(db, row.shortCode);
    assert.equal(res.outcome, 'redirect');
  } finally {
    await close();
  }
});

test('recordClick increments clickCount and sets lastClickedAt, best-effort', async () => {
  const { db, close } = await makeTestDb();
  try {
    const row = await createShortLink(db, { destination: 'https://example.com' });
    await recordClick(db, row.id);
    await recordClick(db, row.id);

    const [after] = await db.select().from(links).where(eq(links.id, row.id));
    assert.equal(after.clickCount, 2);
    assert.ok(after.lastClickedAt instanceof Date);

    // Unknown id: must not throw.
    await recordClick(db, '00000000-0000-0000-0000-000000000000');
  } finally {
    await close();
  }
});

test('recordClick does not count a click on a disabled link', async () => {
  const { db, close } = await makeTestDb();
  try {
    const row = await createShortLink(db, { destination: 'https://example.com' });
    await db.update(links).set({ status: 'disabled' }).where(eq(links.id, row.id));
    await recordClick(db, row.id);
    const [after] = await db.select().from(links).where(eq(links.id, row.id));
    assert.equal(after.clickCount, 0);
  } finally {
    await close();
  }
});

test('updatedAt / createdAt are populated by the schema defaults', async () => {
  const { db, close } = await makeTestDb();
  try {
    const row = await createShortLink(db, { destination: 'https://example.com' });
    assert.ok(row.createdAt instanceof Date);
    assert.ok(row.updatedAt instanceof Date);
    const [check] = await db
      .select({ n: sql<number>`1` })
      .from(links)
      .where(eq(links.id, row.id));
    assert.equal(check.n, 1);
  } finally {
    await close();
  }
});
