import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { CampaignDetail } from '@/app/_components/qr-account/campaign-detail';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR campaign' };

export default async function QrCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser(await headers());
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/qr/campaigns/${id}`)}`);
  if (!entitlementsFrom(await getEntitlements(await getDb(), user.id)).can('qr_campaigns')) redirect('/app/qr');

  return (
    <AccountShell
      workspace
      title="Campaign"
      actions={
        <a href="/app/qr/campaigns" className={SECONDARY}>
          All campaigns
        </a>
      }
    >
      <CampaignDetail id={id} />
    </AccountShell>
  );
}
