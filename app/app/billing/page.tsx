import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { BillingPanel } from '@/app/_components/account/billing-panel';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plans and billing' };

export default async function BillingPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fbilling');
  return (
    <AccountShell title="Plans and billing" intro="What you’re on, and what else is there." workspace>
      <BillingPanel />
    </AccountShell>
  );
}
