import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { Exports } from '@/app/_components/qr-account/exports';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR reports & exports' };

/** QR codes → Reports & exports (QR Pro). Accounts without it go to the dashboard. */
export default async function QrExportsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fqr%2Fexports');
  if (!entitlementsFrom(await getEntitlements(await getDb(), user.id)).can('qr_export')) redirect('/app/qr');

  return (
    <AccountShell workspace title="Reports & exports" intro="Download your codes or scans as a spreadsheet.">
      <Exports />
    </AccountShell>
  );
}
