/**
 * Migration 0009 on a database that already holds data. Builds a database as
 * production is today (migrations 0000–0008) with tracked QR codes, links and
 * scans, applies 0009 with the real migrator, and checks that nothing that
 * existed has changed. Then runs the rollback SQL **taken from the docs**
 * (docs/infra/deployment.md) and checks the data again. Runs on a throwaway
 * in-memory PGlite — never against Neon.
 */

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const REAL = resolve(import.meta.dirname, '../db/migrations');
const journal = JSON.parse(readFileSync(join(REAL, 'meta/_journal.json'), 'utf8')) as { version: string; dialect: string; entries: { idx: number; tag: string }[] };
const tmp = mkdtempSync(join(tmpdir(), 'kk-mig-'));
const folder = join(tmp, 'migrations');

let client: PGlite;
before(() => {
  mkdirSync(join(folder, 'meta'), { recursive: true });
});
after(async () => {
  await client?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const upTo = (tag: string) => journal.entries.filter((e) => e.idx <= journal.entries.find((x) => x.tag === tag)!.idx);
function stage(tag: string) {
  for (const e of upTo(tag)) cpSync(join(REAL, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
  writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: upTo(tag) }));
}
const rows = async <T,>(q: string, params: unknown[] = []) => (await client.query<T>(q, params)).rows;

test('0009 on a database that already has QR codes, links and scans: nothing existing changes; deleting a campaign only ungroups', async () => {
  client = new PGlite();
  const db = drizzle(client);

  // Production today: everything up to and including 0008.
  stage('0008_qr_tracking');
  await migrate(db, { migrationsFolder: folder });
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_name = 'qr_codes' and column_name = 'campaign_id'`))[0].n, 0, 'no campaign column yet');

  const [{ id: user }] = await rows<{ id: string }>(`insert into auth_users (name, email, email_verified) values ('', 'mig@example.test', true) returning id`);
  const make = async (name: string, code: string, dest: string, status: 'active' | 'disabled', scans: number) => {
    const [{ id: link }] = await rows<{ id: string }>(
      `insert into links (short_code, destination, account_id, status, click_count, last_clicked_at) values ($1, $2, $3, $4::link_status, $5, now()) returning id`,
      [code, dest, user, status, scans],
    );
    for (let i = 0; i < scans; i++) await client.query(`insert into click_events (link_id, device_class, country) values ($1, 'mobile', 'IN')`, [link]);
    await client.query(`insert into click_events (link_id, device_class) values ($1, 'bot')`, [link]);
    const [{ id }] = await rows<{ id: string }>(
      `insert into qr_codes (user_id, link_id, name, kind, payload, design) values ($1, $2, $3, 'url', $4::jsonb, '{"colors":{"fg":"#0C2248"}}'::jsonb) returning id`,
      [user, link, name, JSON.stringify({ kind: 'url', url: dest })],
    );
    return { id, link };
  };
  const a = await make('Printed menu', 'MigA001', 'https://example.com/menu', 'active', 3);
  const b = await make('Paused flyer', 'MigB002', 'https://example.com/flyer', 'disabled', 1);
  await client.query(`insert into links (short_code, destination) values ('AnonLnk', 'https://example.org')`); // an anonymous shortener link

  const snapshot = async () => ({
    links: await rows(`select id, short_code, destination, status, click_count, last_clicked_at, account_id, expires_at, screened_at, created_at from links order by short_code`),
    qr: await rows(`select id, user_id, link_id, name, kind, payload, design, created_at from qr_codes order by name`),
    clicks: await rows(`select id, link_id, occurred_at, referrer_host, country, device_class from click_events order by id`),
    plans: await rows(`select plan_key, feature_key, limit_value from plan_features where feature_key like 'qr_dynamic' order by plan_key`),
  });
  const before = await snapshot();
  assert.equal(before.qr.length, 2);
  assert.equal(before.clicks.length, 6);

  // Production gets 0009.
  stage('0009_qr_campaigns');
  await migrate(db, { migrationsFolder: folder });

  assert.deepEqual(await snapshot(), before, 'every existing link, code, scan and plan row is exactly as it was');
  const withCampaign = await rows<{ campaign_id: string | null }>(`select campaign_id from qr_codes`);
  assert.deepEqual(withCampaign.map((r) => r.campaign_id), [null, null], 'existing codes start with no campaign');
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from plan_features where plan_key = 'qr_pro' and feature_key in ('qr_campaigns','qr_breakdowns','qr_export')`))[0].n, 3);
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from plan_features where plan_key = 'free_account' and feature_key in ('qr_campaigns','qr_breakdowns','qr_export')`))[0].n, 0, 'the free plan gets none of the Pro keys');

  // Redirect data is intact: the lookup the redirect route does.
  const hit = await rows<{ destination: string; status: string }>(`select destination, status from links where short_code = 'MigA001'`);
  assert.deepEqual(hit[0], { destination: 'https://example.com/menu', status: 'active' });

  // A campaign groups; deleting it only ungroups.
  const [{ id: camp }] = await rows<{ id: string }>(`insert into qr_campaigns (user_id, name) values ($1, 'Diwali') returning id`, [user]);
  await client.query(`update qr_codes set campaign_id = $1 where id in ($2, $3)`, [camp, a.id, b.id]);
  assert.deepEqual(await snapshot(), before, 'grouping codes changes nothing about links, scans or the codes themselves');
  await client.query(`delete from qr_campaigns where id = $1`, [camp]);
  assert.deepEqual((await rows<{ campaign_id: string | null }>(`select campaign_id from qr_codes`)).map((r) => r.campaign_id), [null, null]);
  assert.deepEqual(await snapshot(), before, 'deleting the campaign touched no link, scan or code');
  // A campaign can't outlive its user, and a name is unique per user (any case).
  await client.query(`insert into qr_campaigns (user_id, name) values ($1, 'Holi')`, [user]);
  await assert.rejects(client.query(`insert into qr_campaigns (user_id, name) values ($1, 'HOLI')`, [user]));

  // ─── The rollback SQL from the docs ───────────────────────────────────────
  const doc = readFileSync(resolve(import.meta.dirname, '../docs/infra/deployment.md'), 'utf8');
  const block = /\*\*Rolling back 0009\*\*[^`]*```sql\n([\s\S]*?)```/.exec(doc)?.[1];
  assert.ok(block, 'the rollback block is in the deployment doc');
  assert.match(block, /DROP TRIGGER qr_codes_enforce_limit/);
  for (const statement of block.split(';').map((s) => s.trim()).filter(Boolean)) await client.query(statement);

  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = 'qr_campaigns'`))[0].n, 0, 'campaigns table gone');
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_name = 'qr_codes' and column_name = 'campaign_id'`))[0].n, 0, 'campaign column gone');
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from pg_trigger where tgname = 'qr_codes_enforce_limit'`))[0].n, 0, 'trigger gone');
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'qr_codes_enforce_limit'`))[0].n, 0, 'function gone');
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from plan_features where feature_key in ('qr_campaigns','qr_breakdowns','qr_export')`))[0].n, 0);
  const afterRollback = await snapshot();
  assert.deepEqual(afterRollback.links, before.links, 'after the rollback every link is as it was');
  assert.deepEqual(afterRollback.clicks, before.clicks, 'and every scan');
  assert.deepEqual(afterRollback.qr, before.qr, 'and every QR code (the 0008 columns)');
  assert.deepEqual(afterRollback.plans, before.plans, 'and the free limit of 3 is still there');
  // 0008 is still recorded as applied (the rollback removes only 0009's row).
  const recorded = await rows<{ n: number }>(`select count(*)::int as n from drizzle.__drizzle_migrations`);
  assert.equal(recorded[0].n, upTo('0008_qr_tracking').length);
});
