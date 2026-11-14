import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { OrdersList } from '@/app/_components/affiliate/orders-list';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Affiliate orders' };

/** The latest orders credited to your affiliates (Affiliate Manager, Phase 3B): /app/affiliate/orders. */
export default async function AffiliateOrdersPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Faffiliate%2Forders');
  return (
    <AccountShell workspace title="Orders" intro="Orders your store reported that used an affiliate’s coupon code.">
      <OrdersList />
    </AccountShell>
  );
}
