import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { AccountantConnect } from '@/app/_components/account/accountant-connect';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accountant Connect' };

/**
 * Invoices → Accountant Connect (Pro: `invoice_csv_export`, like Reports & exports). Signed-in accounts without Pro still
 * see the page, with a plain "this is part of Pro" note and every start-something control off, because a lapsed account
 * must still be able to reach "End access" and "End download links". The API enforces the plan on every action.
 */
export default async function AccountantPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Finvoices%2Faccountant');

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
