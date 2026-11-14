import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { MerchantForm } from '@/app/_components/affiliate/merchant-form';
import { StoreConnection } from '@/app/_components/affiliate/store-connection';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Portal settings' };

/** Set up your affiliate programme and its branded portal (Affiliate Manager, Phase 1): /app/affiliate/portal. */
export default async function AffiliateSetupPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Faffiliate%2Fportal');
  return (
    <AccountShell
      workspace
      title="Portal settings"
      intro="The page your affiliates see: your logo, colour and terms."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/app/affiliate/applications" className={SECONDARY}>
            Applications
          </Link>
          <Link href="/app/affiliate/orders" className={SECONDARY}>
            Orders
          </Link>
          <Link href="/app/affiliate" className={SECONDARY}>
            Affiliate overview
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <MerchantForm />
        <StoreConnection />
      </div>
    </AccountShell>
  );
}
