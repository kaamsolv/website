import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, PRIMARY } from '@/app/_components/account/account-shell';
import { QrList } from '@/app/_components/qr-account/qr-list';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'All QR codes' };

export default async function AllQrCodesPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fqr%2Fcodes');

  return (
    <AccountShell
      workspace
      title="All QR codes"
      intro="Find a code, download it again, or pause it. Nothing here changes where a code sends people."
      actions={
        <a href="/qr-code-generator" className={PRIMARY}>
          + New QR code
        </a>
      }
    >
      <QrList />
    </AccountShell>
  );
}
