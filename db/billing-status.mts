/**
 * Operator tool — is billing healthy? Read-only; changes nothing.
 *
 *   npm run billing:status
 *
 * Shows, for whatever DATABASE_URL points at (loaded from .env.local; it prints that target first): payments by
 * status, paid payments still waiting for their invoice, outbox jobs by status and the stuck ones (blocked,
 * failed, dead), webhook events that didn't finish, and which billing settings THIS machine's environment has
 * (names only). Ids and counts only: no names, emails or amounts per person.
 *
 * Run with Node's native TypeScript support:  node db/billing-status.mts
 */

import { describeDatabaseTarget, loadLocalEnv } from './load-env.mts';

loadLocalEnv();
try {
  process.exitCode = await main();
} catch (e) {
  const { errorDetail, redactSecrets } = await import('../app/lib/log-error.ts');
  const firstLine = redactSecrets(errorDetail(e)).split(/\r?\n/)[0];
  console.error(`Couldn't read billing status: ${firstLine}`);
  console.error('Has migration 0011 / 0012 been applied to this database? (npm run db:host shows which one it is.)');
  process.exitCode = 1;
}

async function main(): Promise<number> {
  const { getDb } = await import('./client.ts');
  const { billingReport, billingSettingsPresent } = await import('./billing-report.ts');

  console.log(`Target: ${describeDatabaseTarget()}\n`);
  const r = await billingReport(await getDb());

  const table = (rows: { status: string; n: number }[]) => (rows.length ? rows.map((x) => `${x.status} ${x.n}`).join(' · ') : 'none');
  console.log(`Payments            ${table(r.payments)}`);
  console.log(`Abandoned checkouts ${r.staleCheckouts} (older than an hour, never paid)`);
  console.log(`Outbox jobs         ${table(r.outbox)}`);

  console.log(`\nPaid, not yet invoiced (${r.paidNotInvoiced.length})`);
  for (const p of r.paidNotInvoiced) console.log(`  payment ${p.id}  paid ${p.ageMinutes} min ago`);
  if (!r.paidNotInvoiced.length) console.log('  none');

  console.log(`\nStuck or failing jobs (${r.stuckJobs.length})`);
  for (const j of r.stuckJobs) console.log(`  ${j.status.padEnd(7)} ${j.kind}  attempts ${j.attempts}  ${j.lastError || '-'}  (${j.ageMinutes} min ago)  job ${j.id}`);
  if (!r.stuckJobs.length) console.log('  none');

  console.log(`\nWebhook events that didn't finish (${r.problemEvents.length})`);
  for (const e of r.problemEvents) console.log(`  ${e.status.padEnd(8)} ${e.type}  ${e.detail || '-'}  (${e.ageMinutes} min ago)  ${e.eventId}`);
  if (!r.problemEvents.length) console.log('  none');

  console.log("\nSettings in THIS machine's environment (names only; production secrets live on the Worker)");
  for (const s of billingSettingsPresent()) console.log(`  ${s.set ? 'set    ' : 'not set'}  ${s.name}`);
  return 0;
}
