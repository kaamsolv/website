import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, PRIMARY } from '@/app/_components/account/account-shell';
import { QrList } from '@/app/_components/qr-account/qr-list';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My QR codes' };

export default async function MyQrCodesPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fqr');

  return (
    <AccountShell
      workspace
      title="My QR codes"
      intro="Codes that count scans. Open one to see how it’s doing, or download it again."
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
