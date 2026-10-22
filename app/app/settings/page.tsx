import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { SettingsForm } from '@/app/_components/account/settings-form';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fsettings');
  return (
    <AccountShell workspace narrow title="Settings" intro="Fill these in once. Every new invoice starts with them.">
      <SettingsForm />
    </AccountShell>
  );
}
