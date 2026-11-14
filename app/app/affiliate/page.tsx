import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { AffiliateOverview } from '@/app/_components/affiliate/affiliate-overview';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Affiliate' };

/** The Affiliate page: the two roles, where you stand in each, and the next step for each (Affiliate Manager). */
export default async function AffiliatePage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Faffiliate');
  return (
    <AccountShell workspace title="Affiliate" intro="Promote other businesses, or run a programme for your own. One account does both.">
      <AffiliateOverview />
    </AccountShell>
  );
}
