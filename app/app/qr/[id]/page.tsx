import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { QrDetail } from '@/app/_components/qr-account/qr-detail';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR code' };

export default async function QrCodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser(await headers());
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/qr/${id}`)}`);

  return (
    <AccountShell
      workspace
      title="QR code"
      actions={
        <a href="/app/qr" className={SECONDARY}>
          All QR codes
        </a>
      }
    >
      <QrDetail id={id} />
    </AccountShell>
  );
}
