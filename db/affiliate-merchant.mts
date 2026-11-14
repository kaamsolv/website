/**
 * Operator tool — look at, suspend, reinstate and free up affiliate merchants (portals).
 *
 *   npm run affiliate:merchant -- list [n]                          newest merchants (max 200)
 *   npm run affiliate:merchant -- show <slug>
 *   npm run affiliate:merchant -- suspend <slug> "reason" [--confirm]   portal answers 404, registration shut, owner sees the reason
 *   npm run affiliate:merchant -- reinstate <slug> [--confirm]
 *   npm run affiliate:merchant -- stale [days]                      portals nobody applied to, older than <days> (default 90)
 *   npm run affiliate:merchant -- release <slug> [--days 90] [--confirm]   delete a stale portal to free its address
 *
 * Suspend, reinstate and release change nothing without --confirm. Release refuses anything that ever had an
 * application or is newer than the cutoff. Acts on whatever DATABASE_URL points at (loaded from .env.local) and prints
 * that target's host first. Not a web endpoint, deliberately. Suspending also marks the portal's open reports reviewed.
 *
 * Run with Node's native TypeScript support:  node db/affiliate-merchant.mts …
 */

import { describeDatabaseTarget, loadLocalEnv } from './load-env.mts';

loadLocalEnv();
process.exitCode = await main(process.argv.slice(2));

function line(m: { slug: string; name: string; status: string; ownerEmail: string; createdAt: Date; programme: string; applications: number; openReports: number }) {
  return `${m.slug.padEnd(28)} ${m.status.padEnd(10)} registration:${m.programme.padEnd(6)} applications:${String(m.applications).padStart(3)} open reports:${m.openReports}  ${m.createdAt.toISOString().slice(0, 10)}  ${m.ownerEmail}  “${m.name}”`;
}

async function main(args: string[]): Promise<number> {
  const [cmd, slugArg, ...rest] = args;
  const confirmed = args.includes('--confirm');
  const { getDb } = await import('./client.ts');
  const op = await import('./affiliate-operator.ts');
  console.log(`Target: ${describeDatabaseTarget()}\n`);
  const db = await getDb();

  if (cmd === 'list') {
    const rows = await op.listMerchants(db, Number.parseInt(slugArg ?? '25', 10) || 25);
    if (rows.length === 0) console.log('No portals yet.');
    rows.forEach((m) => console.log(line(m)));
    return 0;
  }
  if (cmd === 'stale') {
    const days = Number.parseInt(slugArg ?? '90', 10) || 90;
    const rows = await op.staleMerchants(db, days);
    console.log(`Portals with no applications, older than ${days} days: ${rows.length}`);
    rows.forEach((m) => console.log(line(m)));
    if (rows.length > 0) console.log('\nFree one up with: npm run affiliate:merchant -- release <slug> --confirm');
    return 0;
  }

  if (!slugArg || !['show', 'suspend', 'reinstate', 'release'].includes(cmd ?? '')) {
    console.error('Usage: npm run affiliate:merchant -- list | show <slug> | suspend <slug> "reason" | reinstate <slug> | stale | release <slug>  [--confirm]');
    return 1;
  }
  const slug = slugArg.trim().toLowerCase();
  const m = await op.findMerchant(db, slug);
  if (!m) {
    console.error(`No merchant with the address "${slug}".`);
    return 1;
  }
  console.log(line(m));
  if (m.suspendedReason) console.log(`    suspended: “${m.suspendedReason}”`);
  if (cmd === 'show') return 0;

  if (cmd === 'suspend') {
    const reason = rest.filter((a) => !a.startsWith('--')).join(' ').trim();
    if (m.status === 'suspended') return console.log('Already suspended.'), 1;
    if (!confirmed) return console.log(`\nDry run: would suspend "${slug}"${reason ? ` with the reason “${reason}”` : ' (no reason given)'}. Add --confirm to do it.`), 0;
    const done = await op.suspendMerchant(db, slug, reason);
    console.log(done ? `\nSuspended "${slug}". Its portal now answers 404 and its open reports are marked reviewed.` : '\nNothing changed.');
    return done ? 0 : 1;
  }
  if (cmd === 'reinstate') {
    if (m.status !== 'suspended') return console.log('Not suspended.'), 1;
    if (!confirmed) return console.log(`\nDry run: would reinstate "${slug}". Add --confirm to do it.`), 0;
    const done = await op.reinstateMerchant(db, slug);
    console.log(done ? `\nReinstated "${slug}".` : '\nNothing changed.');
    return done ? 0 : 1;
  }
  // release
  const days = Number.parseInt(rest[rest.indexOf('--days') + 1] ?? '90', 10) || 90;
  if (m.applications > 0) return console.error('\nRefused: this portal has had applications. Suspend it instead.'), 1;
  if (!confirmed) return console.log(`\nDry run: would delete "${slug}" (no applications, older than ${days} days) and free the address. Add --confirm to do it.`), 0;
  const done = await op.releaseMerchant(db, slug, days);
  console.log(done ? `\nReleased "${slug}". The address is free.` : `\nRefused: "${slug}" is newer than ${days} days or has had applications.`);
  return done ? 0 : 1;
}
