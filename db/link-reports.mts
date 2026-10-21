/**
 * Operator tool — newest abuse reports across all links. Read-only.
 *
 *   npm run link:reports            last 25
 *   npm run link:reports -- 100     last 100 (max 200)
 *
 * Reports never disable a link on their own. To act on one:
 *   npm run link:status -- <code> disable --confirm
 *
 * Acts on whatever DATABASE_URL points at (loaded from .env.local) and prints
 * that target's host first. Report text is sanitised on the way in (no control
 * or ANSI characters), so it's safe to print here.
 *
 * Run with Node's native TypeScript support:  node db/link-reports.mts
 */

import { describeDatabaseTarget, loadLocalEnv } from './load-env.mts';

loadLocalEnv();

const limit = Number.parseInt(process.argv[2] ?? '25', 10) || 25;

// Imported after the env is loaded: getDb() picks its driver from DATABASE_URL.
const { getDb } = await import('./client.ts');
const { listRecentReports } = await import('./reports.ts');

console.log(`Target: ${describeDatabaseTarget()}\n`);

// No process.exit(): see the note in link-status.mts (Windows + keep-alive sockets).
const rows = await listRecentReports(await getDb(), limit);
if (rows.length === 0) console.log('No reports.');

for (const r of rows) {
  console.log(`${r.createdAt.toISOString()}  ${r.shortCode}  [${r.status}]  ${r.reason}`);
  console.log(`    → ${r.destination}`);
  if (r.details) console.log(`    “${r.details.replace(/\n/g, ' ⏎ ')}”`);
}
if (rows.length > 0) {
  console.log(`\n${rows.length} report(s). Disable with: npm run link:status -- <code> disable --confirm`);
}
