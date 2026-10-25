import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, PRIMARY } from '@/app/_components/account/account-shell';
import { QrDashboard } from '@/app/_components/qr-account/qr-dashboard';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR codes' };

/** QR codes → Dashboard: totals, scan activity, top and recent codes. */
export default async function QrDashboardPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fqr');

  return (
    <AccountShell
      workspace
      title="QR codes"
      intro="How your tracked codes are doing."
      actions={
        <a href="/qr-code-generator" className={PRIMARY}>
          + New QR code
        </a>
      }
    >
      <QrDashboard />
    </AccountShell>
  );
}
