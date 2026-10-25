import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { Campaigns } from '@/app/_components/qr-account/campaigns';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR campaigns' };

/** QR codes → Campaigns (QR Pro). Accounts without it go to the dashboard — no dead end, no teaser. */
export default async function QrCampaignsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fqr%2Fcampaigns');
  if (!entitlementsFrom(await getEntitlements(await getDb(), user.id)).can('qr_campaigns')) redirect('/app/qr');

  return (
    <AccountShell workspace title="Campaigns" intro="Group the codes of one print run and see their scans together.">
      <Campaigns />
    </AccountShell>
  );
}
