import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, PRIMARY } from '@/app/_components/account/account-shell';
import { InvoiceList } from '@/app/_components/account/invoice-list';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'All invoices' };

export default async function MyInvoicesPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Finvoices');

  return (
    <AccountShell
      workspace
      title="All invoices"
      intro="Open one to keep editing, make a copy for next month, or download it again."
      actions={
        <a href="/invoice-generator" className={PRIMARY}>
          + New invoice
        </a>
      }
    >
      <InvoiceList />
    </AccountShell>
  );
}
