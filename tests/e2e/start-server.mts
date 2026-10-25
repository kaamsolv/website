/**
 * Playwright's web server for e2e runs (playwright.config.ts).
 *
 * 1. Builds a throwaway database in `.pglite-e2e/` from the real migrations —
 *    never the dev database (`.pglite/`) and never Neon.
 * 2. TEST-ONLY OVERRIDE: lowers the free account's `invoice_save` limit from 20
 *    to 3 in that throwaway database, so the limit test needs 3 saves, not 20.
 *    The real seed (migration 0003) is untouched; test/accounts.test.mts
 *    asserts it is still 20.
 * 3. Starts `next dev` against it (KK_PGLITE_DIR), with KK_E2E=1 and the
 *    per-run KK_E2E_SECRET from playwright.config.ts.
 * 4. Teardown: when Playwright stops the server, `.pglite-e2e/` is deleted.
 *
 * Run with Node's native TypeScript support: node tests/e2e/start-server.mts
 */

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

export const E2E_DB_DIR = '.pglite-e2e';
export const E2E_SAVE_LIMIT = 3;

const root = resolve(import.meta.dirname, '../..');
const dir = resolve(root, E2E_DB_DIR);

rmSync(dir, { recursive: true, force: true });
const client = new PGlite(dir);
await migrate(drizzle(client), { migrationsFolder: resolve(root, 'db/migrations') });
await client.query(`update plan_features set limit_value = $1 where plan_key = 'free_account' and feature_key = 'invoice_save'`, [E2E_SAVE_LIMIT]);
// TEST-ONLY: accounts whose email starts with "pro-" get a manual Invoice Pro
// grant ("qrpro-": QR Pro) when created — the e2e stand-in for `npm run account:grant`. Exists
// only in this throwaway database.
await client.exec(`
  create function e2e_grant_pro() returns trigger language plpgsql as $$
  begin
    if new.email like 'pro-%' then
      insert into subscriptions (user_id, provider, provider_ref, plan_key, status)
      values (new.id, 'manual', 'manual:e2e:' || new.id, 'invoice_pro', 'active');
    elsif new.email like 'qrpro-%' then
      insert into subscriptions (user_id, provider, provider_ref, plan_key, status)
      values (new.id, 'manual', 'manual:e2e:qr:' || new.id, 'qr_pro', 'active');
    end if;
    return new;
  end $$;
  create trigger e2e_grant_pro after insert on auth_users for each row execute function e2e_grant_pro();
`);
await client.close();
console.log(`[e2e] fresh database in ${E2E_DB_DIR}/ (free save limit ${E2E_SAVE_LIMIT}; "pro-" emails get Pro — test-only)`);

// Same flags as `npm run dev` (incl. --hostname 0.0.0.0), so tests see what you see.
const port = process.env.KK_E2E_PORT ?? '3000';
const child = spawn('npx', ['next', 'dev', '--hostname', '0.0.0.0', '--port', port], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, KK_PGLITE_DIR: E2E_DB_DIR },
});

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  child.kill();
  // Give next dev a moment to release the PGlite lock, then delete the database.
  setTimeout(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  }, 1500);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
child.on('exit', () => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
});
