import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { onlyTestAccounts, runAffiliateSmoke } from '../db/affiliate-smoke.ts';
import { authUsers } from '../db/schema.ts';
import { makeTestDb } from './helpers/test-db.mts';

const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;

test('the staging smoke test passes on a fully migrated database, and leaves nothing behind', async () => {
  const { db, close } = await makeTestDb();
  try {
    const results = await runAffiliateSmoke(db, 'unit1');
    const failed = results.filter((r) => !r.ok);
    assert.deepEqual(failed, [], failed.map((f) => `${f.name}: ${f.detail}`).join('\n'));
    assert.ok(results.length >= 15, `expected the full set of checks, got ${results.length}`);
    assert.equal(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from auth_users`))[0].n, 0);
    for (const t of ['merchants', 'programme_applications', 'affiliate_events', 'portal_reports', 'affiliate_links', 'affiliate_clicks', 'store_connections', 'affiliate_coupon_codes', 'affiliate_coupon_periods', 'affiliate_orders', 'outbox', 'subscriptions']) {
      assert.equal(rows<{ n: number }>(await db.execute(sql.raw(`select count(*)::int as n from ${t}`)))[0].n, 0, `${t} is empty again`);
    }
    // And it can be run again, on the same database, with another tag.
    assert.deepEqual((await runAffiliateSmoke(db, 'unit2')).filter((r) => !r.ok), []);
  } finally {
    await close();
  }
});

test('when something is wrong it says which check failed, and still cleans up', async () => {
  const { db, close } = await makeTestDb();
  try {
    await db.execute(sql`drop table portal_reports`);
    const results = await runAffiliateSmoke(db, 'unit3');
    const failed = results.filter((r) => !r.ok).map((r) => r.name);
    assert.ok(failed.some((n) => n.startsWith('migrations 0018 to 0023')), 'the missing table is reported');
    assert.ok(failed.some((n) => n.startsWith('report a portal')), 'the check that needed it is reported');
    assert.ok(!failed.some((n) => n.startsWith('clean-up')), 'clean-up still worked');
    assert.equal(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from auth_users`))[0].n, 0);
    assert.equal(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from merchants`))[0].n, 0);
  } finally {
    await close();
  }
});

test('the real-database backstop: any account that is not a throwaway @example.test address stops it', async () => {
  const { db, close } = await makeTestDb();
  try {
    assert.deepEqual(await onlyTestAccounts(db), { ok: true, total: 0 });
    await db.insert(authUsers).values({ name: 'T', email: 'someone@example.test' });
    assert.deepEqual(await onlyTestAccounts(db), { ok: true, total: 1 });
    await db.insert(authUsers).values({ name: 'Real', email: 'customer@gmail.com' });
    assert.deepEqual(await onlyTestAccounts(db), { ok: false, total: 2 });
  } finally {
    await close();
  }
});

test('the modules the operator commands load import under plain Node (explicit .ts extensions), not just under the test runner', async () => {
  const { execFileSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const root = resolve(import.meta.dirname, '..');
  const modules = ['db/schema.ts', 'db/merchant-scope.ts', 'db/affiliate-scope.ts', 'db/affiliate-operator.ts', 'db/portal-reports.ts', 'db/affiliate-smoke.ts', 'db/affiliate-mail.ts', 'db/affiliate-links.ts', 'db/affiliate-orders.ts'];
  const code = `${modules.map((m) => `await import('./${m}');`).join(' ')} console.log('imported ${modules.length}');`;
  const out = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', code], { cwd: root, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8' });
  assert.match(out, new RegExp(`imported ${modules.length}`));
});

test('the staging command refuses safely, before contacting anything, when the host or the non-production flag is wrong', async () => {
  const { spawnSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const root = resolve(import.meta.dirname, '..');
  // A URL that could never connect: if the command tried, it would hang or fail on DNS, not print a refusal.
  const env = { ...process.env, NODE_OPTIONS: '', DATABASE_URL: 'postgresql://user:secret@staging-host.invalid/db?sslmode=require' };
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'db/affiliate-staging-smoke.mts', ...args], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });

  const noHost = run('--non-production');
  assert.equal(noHost.status, 1);
  assert.match(noHost.stderr, /--expect-host is missing or does not match/);
  assert.match(noHost.stderr, /Nothing was contacted/);

  const wrongHost = run('--expect-host', 'some-other-host.invalid', '--non-production');
  assert.equal(wrongHost.status, 1);
  assert.match(wrongHost.stderr, /does not match/);
  assert.ok(!/staging-host\.invalid|secret/.test(wrongHost.stdout + wrongHost.stderr), 'the refusal never prints the host or the password');

  const noFlag = run('--expect-host', 'staging-host.invalid');
  assert.equal(noFlag.status, 1);
  assert.match(noFlag.stderr, /pass --non-production/);
  assert.match(noFlag.stderr, /Nothing was contacted/);
});

// ─── The redirect checks over HTTP (referral links, Phase 3A) ────────────────
// A stub app built from the real functions: it answers first and writes the click afterwards, like the route does
// with after(). The smoke test must see the 302 and then find the click in the database by polling.
const STUB_MASTER = 'stub-master-for-tests';
async function stubApp(db: import('../db/links.ts').Db, writeAfterResponse: boolean) {
  const { createServer } = await import('node:http');
  const { resolveAffiliateLink, recordAffiliateClick } = await import('../db/affiliate-links.ts');
  const { withRef } = await import('../app/lib/affiliate/link.ts');
  const { clickMetaFromRequest } = await import('../app/lib/click-meta.ts');
  const { handleWooDelivery } = await import('../app/lib/affiliate/woo-webhook.ts');
  const server = createServer(async (req, res) => {
    const hook = /^\/api\/affiliate\/woo\/([^/]+)$/.exec(req.url ?? '');
    if (hook) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const request = new Request(`http://stub.test${req.url}`, { method: 'POST', headers: Object.fromEntries(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))), body: Buffer.concat(chunks) });
      const r = await handleWooDelivery(db, hook[1], request, STUB_MASTER);
      res.writeHead(r.status, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: r.status < 300, code: r.code }));
      return;
    }
    const [, slug, code] = /^\/([^/]+)\/([^/]+)$/.exec(req.url ?? '') ?? [];
    const link = slug ? await resolveAffiliateLink(db, slug, code) : ({ outcome: 'not_found' } as const);
    if (link.outcome === 'not_found') {
      res.writeHead(404).end();
      return;
    }
    const headers = new Headers(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])));
    const click = clickMetaFromRequest(req.method ?? 'GET', headers);
    res.writeHead(302, { Location: link.paused ? link.destination : withRef(link.destination, code), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }).end();
    if (writeAfterResponse && click && !link.paused) setTimeout(() => void recordAffiliateClick(db, link.linkId, click), 300);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('the redirect checks pass when the click is written after the response', async () => {
  const { db, close } = await makeTestDb();
  const app = await stubApp(db, true);
  try {
    const results = await runAffiliateSmoke(db, 'http1', { redirectBaseUrl: app.url, waitMs: 5000, webhookMaster: STUB_MASTER });
    const failed = results.filter((r) => !r.ok);
    assert.deepEqual(failed, [], failed.map((f) => `${f.name}: ${f.detail}`).join('\n'));
    assert.ok(results.some((r) => r.name.startsWith('the click written AFTER the response persisted')), 'the persistence check ran');
    assert.ok(results.some((r) => r.name.startsWith('a signed WooCommerce order posted to the app')), 'the signed-order check ran');
  } finally {
    await app.close();
    await close();
  }
});

test('the persistence check fails, and says so, when the post-response write never lands', async () => {
  const { db, close } = await makeTestDb();
  const app = await stubApp(db, false);
  try {
    const results = await runAffiliateSmoke(db, 'http2', { redirectBaseUrl: app.url, waitMs: 1500, webhookMaster: STUB_MASTER });
    const failed = results.filter((r) => !r.ok);
    assert.deepEqual(failed.map((f) => f.name.startsWith('the click written AFTER the response persisted')), [true]);
    assert.match(failed[0].detail, /did not persist/);
    assert.equal(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from auth_users`))[0].n, 0, 'it still cleaned up');
  } finally {
    await app.close();
    await close();
  }
});
