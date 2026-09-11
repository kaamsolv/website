/**
 * 2b.2 data layer against real Postgres (in-memory PGlite, real migrations):
 * shared rate limiting, abuse reports, and screened_at.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { linkReports, links, rateLimits } from '../db/schema.ts';
import { createShortLink, type Db } from '../db/links.ts';
import { consumeRateLimits, pruneRateLimits } from '../db/rate-limits.ts';
import { createReport, getReportSummary, listRecentReports } from '../db/reports.ts';
import { rateLimitChecks } from '../app/lib/rate-limit.ts';
import { makeTestDb } from './helpers/test-db.mts';

async function withDb(fn: (db: Db) => Promise<void>) {
  const { db, close } = await makeTestDb();
  try {
    await fn(db);
  } finally {
    await close();
  }
}

const check = (key: string, limit: number, windowSeconds = 60) => ({ key, limit, windowSeconds });

// ---------------------------------------------------------------- rate limits

test('allows up to the limit, then blocks with a reset time in the future', async () => {
  await withDb(async (db) => {
    for (let i = 1; i <= 3; i += 1) {
      assert.deepEqual(await consumeRateLimits(db, [check('k', 3)]), { allowed: true }, `call ${i}`);
    }
    const blocked = await consumeRateLimits(db, [check('k', 3)]);
    assert.equal(blocked.allowed, false);
    if (!blocked.allowed) assert.ok(blocked.resetAt.getTime() > Date.now());
  });
});

test('a window that has ended starts again from 1', async () => {
  await withDb(async (db) => {
    for (let i = 0; i < 4; i += 1) await consumeRateLimits(db, [check('k', 3)]);
    // Simulate the window ending.
    await db.update(rateLimits).set({ resetAt: sql`now() - interval '1 second'` }).where(eq(rateLimits.key, 'k'));
    assert.deepEqual(await consumeRateLimits(db, [check('k', 3)]), { allowed: true });
    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, 'k'));
    assert.equal(row.count, 1);
  });
});

test('concurrent requests are counted exactly', async () => {
  await withDb(async (db) => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => consumeRateLimits(db, [check('burst', 10)])),
    );
    assert.equal(results.filter((r) => r.allowed).length, 10);
    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, 'burst'));
    assert.equal(row.count, 25);
  });
});

test('any exceeded window blocks, even if another has room', async () => {
  await withDb(async (db) => {
    const checks = [check('min', 100, 60), check('day', 2, 86400)];
    await consumeRateLimits(db, checks);
    await consumeRateLimits(db, checks);
    const third = await consumeRateLimits(db, checks);
    assert.equal(third.allowed, false);
    // Blocked until the *day* window resets, not the minute one.
    if (!third.allowed) assert.ok(third.resetAt.getTime() > Date.now() + 3600_000);
  });
});

test('keys from rateLimitChecks never collide across actions or callers', async () => {
  await withDb(async (db) => {
    await consumeRateLimits(db, rateLimitChecks('url-shortener', 'create', 'caller-a'));
    await consumeRateLimits(db, rateLimitChecks('url-shortener', 'report', 'caller-a'));
    await consumeRateLimits(db, rateLimitChecks('url-shortener', 'create', 'caller-b'));
    const keys = (await db.select({ key: rateLimits.key }).from(rateLimits)).map((r) => r.key).sort();
    assert.equal(keys.length, 5);
    assert.ok(keys.every((k) => !/\d+\.\d+\.\d+\.\d+/.test(k)), 'no raw IPs in keys');
  });
});

test('pruneRateLimits deletes only long-expired windows', async () => {
  await withDb(async (db) => {
    await consumeRateLimits(db, [check('old', 5), check('live', 5)]);
    await db.update(rateLimits).set({ resetAt: sql`now() - interval '2 hours'` }).where(eq(rateLimits.key, 'old'));
    await pruneRateLimits(db);
    const keys = (await db.select({ key: rateLimits.key }).from(rateLimits)).map((r) => r.key);
    assert.deepEqual(keys, ['live']);
  });
});

// ------------------------------------------------------------------- reports

test('createReport stores a report against an existing link', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    const stored = await createReport(db, {
      shortCode: link.shortCode,
      reason: 'phishing',
      details: 'fake bank login',
      reporterIpHash: 'h1',
    });
    assert.equal(stored, true);
    const [row] = await db.select().from(linkReports);
    assert.equal(row.linkId, link.id);
    assert.equal(row.reason, 'phishing');
    assert.equal(row.details, 'fake bank login');
    assert.equal(row.reporterIpHash, 'h1');
  });
});

test('createReport for an unknown code stores nothing and does not throw', async () => {
  await withDb(async (db) => {
    const stored = await createReport(db, {
      shortCode: 'nope123',
      reason: 'spam',
      details: null,
      reporterIpHash: null,
    });
    assert.equal(stored, false);
    assert.equal((await db.select().from(linkReports)).length, 0);
  });
});

test('a report never changes the link status', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    for (let i = 0; i < 5; i += 1) {
      await createReport(db, { shortCode: link.shortCode, reason: 'malware', details: null, reporterIpHash: null });
    }
    const [row] = await db.select().from(links).where(eq(links.id, link.id));
    assert.equal(row.status, 'active');
  });
});

test('the database rejects over-long details', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await assert.rejects(
      db.insert(linkReports).values({ linkId: link.id, reason: 'other', details: 'x'.repeat(501) }),
    );
  });
});

test('getReportSummary and listRecentReports', async () => {
  await withDb(async (db) => {
    const a = await createShortLink(db, { destination: 'https://a.example.com' });
    const b = await createShortLink(db, { destination: 'https://b.example.com' });
    await createReport(db, { shortCode: a.shortCode, reason: 'spam', details: null, reporterIpHash: null });
    await createReport(db, { shortCode: a.shortCode, reason: 'spam', details: null, reporterIpHash: null });
    await createReport(db, { shortCode: a.shortCode, reason: 'phishing', details: 'x', reporterIpHash: null });
    await createReport(db, { shortCode: b.shortCode, reason: 'illegal', details: null, reporterIpHash: null });

    const summary = await getReportSummary(db, a.id);
    assert.equal(summary.total, 3);
    assert.deepEqual(summary.byReason, [
      { reason: 'spam', reports: 2 },
      { reason: 'phishing', reports: 1 },
    ]);
    assert.ok(summary.latestAt instanceof Date);

    const none = await getReportSummary(db, (await createShortLink(db, { destination: 'https://c.example.com' })).id);
    assert.deepEqual(none, { total: 0, latestAt: null, byReason: [] });

    const recent = await listRecentReports(db, 10);
    assert.equal(recent.length, 4);
    assert.equal(recent[0].shortCode, b.shortCode); // newest first
    assert.equal(recent[0].destination, 'https://b.example.com');
  });
});

test('deleting a link cascades to its reports', async () => {
  await withDb(async (db) => {
    const link = await createShortLink(db, { destination: 'https://example.com' });
    await createReport(db, { shortCode: link.shortCode, reason: 'spam', details: null, reporterIpHash: null });
    await db.delete(links).where(eq(links.id, link.id));
    assert.equal((await db.select().from(linkReports)).length, 0);
  });
});

// --------------------------------------------------------------- screened_at

test('screenedAt is stored when given and null by default', async () => {
  await withDb(async (db) => {
    const at = new Date('2026-09-11T10:00:00.000Z');
    const screened = await createShortLink(db, { destination: 'https://example.com', screenedAt: at });
    const unscreened = await createShortLink(db, { destination: 'https://example.com' });
    assert.equal(screened.screenedAt?.toISOString(), at.toISOString());
    assert.equal(unscreened.screenedAt, null);
  });
});
