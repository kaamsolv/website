/**
 * Affiliate smoke test against a NON-PRODUCTION Neon database, through the real Neon HTTP driver (the same driver
 * production uses). It settles what PGlite can't: that the affiliate migrations (0018 to 0021) and the one-statement
 * writes behave on Neon. The checks live in db/affiliate-smoke.ts (also proved on PGlite in the unit tests).
 *
 *   DATABASE_URL=<non-production Neon database, already migrated> npm run affiliate:smoke -- --expect-host <host> --non-production
 *       Dry run. Checks the database holds no real accounts, then says what it would do. Changes nothing.
 *
 *   … --expect-host <host> --non-production --confirm
 *       Runs the checks. Creates rows tagged smoke-<id>-…@example.test and removes them (and their queued emails) at
 *       the end, whether or not the checks pass. Prints one line per check, and exits 1 if any failed.
 *
 *   … --expect-host <host> --non-production --confirm --redirect-base-url <address>
 *       As above, and also requests a real referral link from a running copy of the app that uses the SAME database
 *       (the OpenNext preview, http://localhost:8787, or a staging deployment) and waits for the click written after the
 *       response to appear in the database. Needed to prove the post-response write persists on Workers.
 *
 *   … --redirect-base-url <address>, with AFFILIATE_WEBHOOK_MASTER set in the same command to the value the app was started with
 *       also posts a signed WooCommerce order to that app and checks it is recorded (Phase 3B). Without it that check does not run.
 *
 *   npm run affiliate:smoke -- --local --confirm
 *       The same checks on in-memory PGlite: a self-check that needs no database.
 *
 * Safety (all must hold or nothing is contacted, or nothing is written):
 *   • DATABASE_URL must be set in that command's environment: no .env file is read, so a production string left in
 *     .env.local is never picked up;
 *   • --expect-host, typed by you, must match that URL's host (the refusal does not say what the host is), and
 *     --non-production must be given, every time, dry run included;
 *   • the database must hold only throwaway @example.test accounts (a real database has real customers and is refused);
 *   • it never reads or changes a row it did not create; only the host is ever printed; errors are one scrubbed line.
 * Never point this at production. Applying the migrations first is a separate step (npm run db:migrate:atomic).
 *
 * Run with Node's native TypeScript support:  node db/affiliate-staging-smoke.mts
 */

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { installSafeErrorOutput } from './atomic-migration.ts';
import { onlyTestAccounts, runAffiliateSmoke, type SmokeOptions } from './affiliate-smoke.ts';
import type { Db } from './links.ts';

installSafeErrorOutput();
process.exitCode = await main(process.argv.slice(2));

// A function declaration, so it is available to main() above it (a const defined after the call would not be).
function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function report(db: Db, confirmed: boolean, where: string, options: SmokeOptions = {}): Promise<number> {
  const guard = await onlyTestAccounts(db);
  if (!guard.ok) {
    console.error('Refusing: this database holds accounts that are not throwaway @example.test addresses, so it looks like a real database. Nothing was changed.');
    return 1;
  }
  console.log(`${where}: ${guard.total} account(s), all throwaway.`);
  if (!confirmed) {
    console.log('Dry run: would run the affiliate checks, creating and then removing a few test rows. Add --confirm to run them.');
    return 0;
  }
  const tag = randomBytes(4).toString('hex');
  const results = await runAffiliateSmoke(db, tag, options);
  for (const r of results) console.log(`${r.ok ? '  ✔' : '  ✖'} ${r.name}${r.ok ? '' : `\n      ${r.detail}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed${failed ? `; ${failed} FAILED.` : '.'}`);
  return failed ? 1 : 0;
}

async function main(args: string[]): Promise<number> {
  const confirmed = args.includes('--confirm');

  if (args.includes('--local')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const schema = await import('./schema.ts');
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, 'migrations') });
    const code = await report(db as unknown as Db, confirmed, 'Local PGlite (in memory)');
    await client.close();
    return code;
  }

  const redirectBase = argValue(args, '--redirect-base-url');
  const url = process.env.DATABASE_URL?.trim();
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) {
    console.error('Refusing: DATABASE_URL must be set, in this command’s environment, to a postgres:// connection string. Nothing was contacted.');
    return 1;
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    console.error('Refusing: DATABASE_URL could not be read. Nothing was contacted.');
    return 1;
  }
  if (argValue(args, '--expect-host') !== host) {
    console.error('Refusing: --expect-host is missing or does not match the host in DATABASE_URL. Nothing was contacted.');
    return 1;
  }
  if (!args.includes('--non-production')) {
    console.error('Refusing: pass --non-production to say this database is not production. Nothing was contacted.');
    return 1;
  }

  const { neon } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-http');
  const schema = await import('./schema.ts');
  const db = drizzle(neon(url), { schema }) as unknown as Db;
  return report(db, confirmed, `Target ${host}`, { redirectBaseUrl: redirectBase, webhookMaster: process.env.AFFILIATE_WEBHOOK_MASTER?.trim() || undefined });
}
