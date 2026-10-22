import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, PRIMARY } from '@/app/_components/account/account-shell';
import { Dashboard } from '@/app/_components/account/dashboard';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard' };

/** Pro: the dashboard. Everyone else: their invoices. */
export default async function AppHome() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp');
  const ent = entitlementsFrom(await getEntitlements(await getDb(), user.id));
  if (!ent.can('invoice_dashboard')) redirect('/app/invoices');

  return (
    <AccountShell
      workspace
      title="Dashboard"
      intro="What you’ve billed, and what’s still to come in."
      actions={
        <a href="/invoice-generator" className={PRIMARY}>
          + New invoice
        </a>
      }
    >
      <Dashboard />
    </AccountShell>
  );
}
