import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { MyProgrammes } from '@/app/_components/affiliate/my-programmes';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Programmes I’ve joined' };

/** The affiliate programmes you've applied to or joined, and where each stands (Affiliate Manager, Phase 2). */
export default async function MyProgrammesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Faffiliate%2Fprogrammes');
  return (
    <AccountShell workspace narrow title="Programmes I’ve joined" intro="Where each of your affiliate applications stands.">
      <MyProgrammes initial={status === 'pending' || status === 'approved' || status === 'rejected' ? status : 'all'} />
    </AccountShell>
  );
}
