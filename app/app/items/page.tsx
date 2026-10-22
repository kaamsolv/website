import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { DirectoryManager } from '@/app/_components/account/directory-manager';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Items' };

export default async function ItemsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fitems');
  return (
    <AccountShell workspace title="Items" intro="Save what you sell — with rate, unit and HSN/SAC — and pick it on any invoice.">
      <DirectoryManager kind="items" />
    </AccountShell>
  );
}
