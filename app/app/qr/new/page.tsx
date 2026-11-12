import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { QrGenerator } from '@/app/qr-code-generator/_components/qr-generator';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New QR code' };

/** The QR generator inside the signed-in workspace (the same one as /qr-code-generator, which stays public and anonymous). */
export default async function NewQrPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fqr%2Fnew');

  return (
    <AccountShell
      workspace
      title="New QR code"
      intro="Pick a type, style it, download it, or save it to count scans."
      actions={
        <a href="/app/qr/codes" className={SECONDARY}>
          All QR codes
        </a>
      }
    >
      <QrGenerator />
    </AccountShell>
  );
}
