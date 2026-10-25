import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { Analytics } from '@/app/_components/qr-account/analytics';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scan analytics' };

export default async function QrAnalyticsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fqr%2Fanalytics');

  return (
    <AccountShell workspace title="Scan analytics" intro="When your codes were scanned, and which ones did best.">
      <Analytics />
    </AccountShell>
  );
}
