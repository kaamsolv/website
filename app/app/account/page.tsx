import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { AccountPanel } from '@/app/_components/account/account-panel';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Faccount');
  return (
    <AccountShell title="Account" narrow workspace>
      <AccountPanel email={user.email} />
    </AccountShell>
  );
}
