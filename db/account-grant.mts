/**
 * Operator tool — give an account a plan by hand (testing, support), or take it away.
 *
 *   npm run account:grant -- <email>                          show the account's plans
 *   npm run account:grant -- <email> invoice_pro              dry run
 *   npm run account:grant -- <email> invoice_pro --confirm    grant (a `manual` subscription)
 *   npm run account:grant -- <email> invoice_pro revoke --confirm
 *
 * Until payments exist (Stage 3) this is the only way to turn Pro on. A grant is
 * one `subscriptions` row with provider 'manual' and no end date; entitlements
 * follow automatically (db/entitlements.ts). Acts on whatever DATABASE_URL
 * points at (loaded from .env.local), prints that target first, and changes
 * nothing without --confirm. Not a web endpoint, deliberately.
 *
 * Run with Node's native TypeScript support:  node db/account-grant.mts …
 */

import { describeDatabaseTarget, loadLocalEnv } from './load-env.mts';

loadLocalEnv();
process.exitCode = await main(process.argv.slice(2));

async function main([email, planKey, ...rest]: string[]): Promise<number> {
  const confirmed = rest.includes('--confirm');
  const revoke = rest.includes('revoke');
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run account:grant -- <email> [plan_key] [revoke] [--confirm]');
    return 1;
  }

  const { and, eq } = await import('drizzle-orm');
  const { getDb } = await import('./client.ts');
  const { authUsers, plans, subscriptions } = await import('./schema.ts');
  const { getEntitlements } = await import('./entitlements.ts');

  console.log(`Target: ${describeDatabaseTarget()}\n`);
  const db = await getDb();
  const [user] = await db.select({ id: authUsers.id, email: authUsers.email }).from(authUsers).where(eq(authUsers.email, email.trim().toLowerCase()));
  if (!user) {
    console.error(`No account for ${email}. They need to sign in once first.`);
    return 1;
  }

  const show = async () => {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const ent = await getEntitlements(db, user.id);
    console.log(`  account   ${user.email}`);
    console.log(`  plans     ${subs.length ? subs.map((s) => `${s.planKey} (${s.provider}, ${s.status})`).join(', ') : 'free account only'}`);
    console.log(`  features  ${ent.keys.join(', ')}`);
  };

  if (!planKey) {
    await show();
    return 0;
  }
  const [plan] = await db.select().from(plans).where(eq(plans.planKey, planKey));
  if (!plan) {
    console.error(`Unknown plan "${planKey}".`);
    return 1;
  }

  const ref = `manual:${planKey}:${user.id}`;
  if (!confirmed) {
    console.log(`Dry run: would ${revoke ? 'revoke' : 'grant'} ${planKey} for ${user.email}. Add --confirm to do it.\n`);
    await show();
    return 0;
  }

  if (revoke) {
    await db.delete(subscriptions).where(and(eq(subscriptions.userId, user.id), eq(subscriptions.providerRef, ref)));
    console.log(`Revoked ${planKey} for ${user.email}.\n`);
  } else {
    await db
      .insert(subscriptions)
      .values({ userId: user.id, provider: 'manual', providerRef: ref, planKey, status: 'active', currentPeriodEnd: null })
      .onConflictDoUpdate({ target: subscriptions.providerRef, set: { status: 'active', currentPeriodEnd: null, updatedAt: new Date() } });
    console.log(`Granted ${planKey} to ${user.email}.\n`);
  }
  await show();
  return 0;
}
