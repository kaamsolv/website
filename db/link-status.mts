/**
 * Operator tool — inspect a short link, or turn it off / back on.
 *
 *   npm run link:status -- <shortCode>                     show the link
 *   npm run link:status -- <shortCode> disable             dry run
 *   npm run link:status -- <shortCode> disable --confirm   take it down
 *   npm run link:status -- <shortCode> enable  --confirm   restore it
 *
 * This is the takedown path for abuse (docs/products/url-shortener.md §7). It
 * is deliberately NOT a web endpoint: links are created anonymously, so there
 * is no way yet to prove who owns one. It acts on whatever DATABASE_URL points
 * at (loaded from .env.local), prints that target first, and changes nothing
 * without --confirm.
 *
 * Run with Node's native TypeScript support:  node db/link-status.mts …
 */

import { describeDatabaseTarget, loadLocalEnv } from './load-env.mts';

loadLocalEnv();

// Every path returns an exit code instead of calling process.exit(): on Windows,
// exiting while fetch keep-alive sockets (the Neon HTTP driver) are still
// closing trips a libuv assertion. Letting the loop drain avoids it.
process.exitCode = await main(process.argv.slice(2));

async function main([code, action, ...flags]: string[]): Promise<number> {
  const confirmed = flags.includes('--confirm');

  if (!code || (action && action !== 'disable' && action !== 'enable')) {
    console.error('Usage: npm run link:status -- <shortCode> [disable|enable] [--confirm]');
    return 1;
  }

  // Imported after the env is loaded: getDb() picks its driver from DATABASE_URL.
  const { getDb } = await import('./client.ts');
  const { getClickBreakdown, getLinkByCode, setLinkStatus } = await import('./links.ts');
  const { getReportSummary } = await import('./reports.ts');

  console.log(`Target: ${describeDatabaseTarget()}\n`);

  const db = await getDb();
  const link = await getLinkByCode(db, code);
  if (!link) {
    console.error(`No link with code "${code}".`);
    return 1;
  }

  const expired = link.expiresAt !== null && link.expiresAt.getTime() <= Date.now();
  console.log(`  code          ${link.shortCode}`);
  console.log(`  destination   ${link.destination}`);
  console.log(`  status        ${link.status}${expired ? ' (but EXPIRED)' : ''}`);
  console.log(`  expires       ${link.expiresAt?.toISOString() ?? 'never'}`);
  console.log(`  created       ${link.createdAt.toISOString()}`);
  console.log(`  human clicks  ${link.clickCount}  (last ${link.lastClickedAt?.toISOString() ?? '—'})`);
  const breakdown = await getClickBreakdown(db, link.id);
  console.log(
    `  events        ${breakdown.map((b) => `${b.deviceClass} ${b.events}`).join(', ') || 'none'}`,
  );
  console.log(
    `  screened      ${link.screenedAt?.toISOString() ?? 'no (Web Risk unavailable, unconfigured, or pre-2b.2)'}`,
  );
  const reports = await getReportSummary(db, link.id);
  console.log(
    `  reports       ${
      reports.total
        ? `${reports.total} — ${reports.byReason.map((r) => `${r.reason} ${r.reports}`).join(', ')} (latest ${reports.latestAt?.toISOString()})`
        : 'none'
    }`,
  );

  if (!action) return 0;

  const next = action === 'disable' ? 'disabled' : 'active';
  if (link.status === next) {
    console.log(`\nAlready ${next}. Nothing to do.`);
    return 0;
  }
  if (!confirmed) {
    console.log(`\nDry run: would set status ${link.status} → ${next}. Re-run with --confirm to apply.`);
    return 0;
  }

  const updated = await setLinkStatus(db, code, next);
  console.log(`\nDone: ${code} is now ${updated?.status}. Takes effect on the next request.`);
  return 0;
}
