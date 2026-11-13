import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { MerchantForm } from '@/app/_components/affiliate/merchant-form';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Affiliate programme' };

/** Set up your affiliate programme and its branded portal (Affiliate Manager, Phase 1). */
export default async function AffiliateSetupPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Faffiliate');
  return (
    <AccountShell workspace title="Affiliate programme" intro="Give your affiliates a branded page of their own. Add your logo, colour and terms.">
      <MerchantForm />
    </AccountShell>
  );
}
