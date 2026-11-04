import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { AccountantConnect } from '@/app/_components/account/accountant-connect';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accountant Connect' };

/** Invoices → Accountant Connect (Pro: `invoice_csv_export`, like Reports & exports). Free accounts go to All invoices; the API says no as well. */
export default async function AccountantPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Finvoices%2Faccountant');
  const ent = entitlementsFrom(await getEntitlements(await getDb(), user.id));
  if (!ent.can('invoice_csv_export')) redirect('/app/invoices');

  return (
    <AccountShell
      workspace
      title="Accountant Connect"
      intro="Send your accountant last month’s invoices and payments, on the day you choose."
      actions={
        <a href="/app/invoices/reports" className={SECONDARY}>
          Reports &amp; exports
        </a>
      }
    >
      <AccountantConnect />
    </AccountShell>
  );
}
