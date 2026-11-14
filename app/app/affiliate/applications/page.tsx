import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { ApplicationsPanel } from '@/app/_components/affiliate/applications-panel';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Affiliate applications' };

/** Open registration and approve or decline applicants (Affiliate Manager, Phase 2). */
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Faffiliate%2Fapplications');
  return (
    <AccountShell workspace narrow title="Applications" intro="Open your programme to applicants, then approve each one by hand.">
      <ApplicationsPanel initialFilter={status === 'approved' || status === 'rejected' || status === 'withdrawn' ? status : status === 'all' ? 'all' : 'pending'} />
    </AccountShell>
  );
}
