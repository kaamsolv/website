import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { DirectoryManager } from '@/app/_components/account/directory-manager';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fbusiness%2Fcustomers');
  return (
    <AccountShell workspace title="Customers" intro="Save the people and businesses you bill once, then pick them on any invoice.">
      <DirectoryManager kind="customers" />
    </AccountShell>
  );
}
