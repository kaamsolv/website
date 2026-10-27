import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { Reports } from '@/app/_components/account/reports';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports & exports' };

/** Invoices → Reports & exports (Pro: `invoice_csv_export`). Free accounts go to All invoices; the API says no as well. */
export default async function ReportsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Finvoices%2Freports');
  const ent = entitlementsFrom(await getEntitlements(await getDb(), user.id));
  if (!ent.can('invoice_csv_export')) redirect('/app/invoices');

  return (
    <AccountShell
      workspace
      title="Reports & exports"
      intro="Spreadsheet-ready CSVs of your invoices, payments and what’s still owed."
      actions={
        <a href="/app/invoices" className={SECONDARY}>
          All invoices
        </a>
      }
    >
      <Reports />
    </AccountShell>
  );
}
