import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { Hub } from '@/app/_components/account/hub';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your KaamSolv' };

/** The account hub: one card per tool with account features, and its plan. */
export default async function AppHome() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp');
  return (
    <AccountShell workspace title="Your KaamSolv" intro="Every tool you use with your account, and its plan.">
      <Hub />
    </AccountShell>
  );
}
