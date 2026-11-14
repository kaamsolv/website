/**
 * Operator tool — reports of affiliate portals (anyone can file one from a portal's "Report this page"). Read-mostly.
 *
 *   npm run affiliate:reports                      newest open reports, last 25
 *   npm run affiliate:reports -- 100               last 100 (max 200)
 *   npm run affiliate:reports -- all               include handled ones
 *   npm run affiliate:reports -- handle <id> reviewed|dismissed --confirm
 *
 * A report never changes a portal by itself. To act on one:
 *   npm run affiliate:merchant -- suspend <slug> "reason" --confirm
 *
 * Acts on whatever DATABASE_URL points at (loaded from .env.local) and prints that target's host first. Report text is
 * sanitised on the way in (no control or ANSI characters), so it is safe to print here.
 *
 * Run with Node's native TypeScript support:  node db/affiliate-reports.mts
 */

import { describeDatabaseTarget, loadLocalEnv } from './load-env.mts';

loadLocalEnv();
process.exitCode = await main(process.argv.slice(2));

async function main(args: string[]): Promise<number> {
  const { getDb } = await import('./client.ts');
  const { handlePortalReport, listPortalReports } = await import('./portal-reports.ts');
  console.log(`Target: ${describeDatabaseTarget()}\n`);
  const db = await getDb();

  if (args[0] === 'handle') {
    const [, id, to] = args;
    if (!id || (to !== 'reviewed' && to !== 'dismissed')) {
      console.error('Usage: npm run affiliate:reports -- handle <id> reviewed|dismissed --confirm');
      return 1;
    }
    if (!args.includes('--confirm')) {
      console.log(`Dry run: would mark report ${id} as ${to}. Add --confirm to do it.`);
      return 0;
    }
    const done = await handlePortalReport(db, id, to);
    console.log(done ? `Report ${id} marked ${to}.` : 'No open report with that id.');
    return done ? 0 : 1;
  }

  const all = args.includes('all');
  const limit = Number.parseInt(args.find((a) => /^\d+$/.test(a)) ?? '25', 10) || 25;
  const rows = await listPortalReports(db, { status: all ? 'all' : 'open', limit });
  if (rows.length === 0) console.log(all ? 'No reports.' : 'No open reports.');
  for (const r of rows) {
    console.log(`${r.createdAt.toISOString()}  ${r.slug}  [${r.status}]  ${r.reason}${r.merchantStatus === 'suspended' ? '  (portal suspended)' : ''}`);
    console.log(`    ${r.merchantName}  ·  ${r.openForMerchant} open report(s) for this portal  ·  id ${r.id}`);
    if (r.details) console.log(`    “${r.details.replace(/\n/g, ' ⏎ ')}”`);
  }
  if (rows.length > 0) console.log(`\n${rows.length} report(s). Suspend a portal: npm run affiliate:merchant -- suspend <slug> "reason" --confirm`);
  return 0;
}
