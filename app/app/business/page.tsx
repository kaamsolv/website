import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { SettingsForm } from '@/app/_components/account/settings-form';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Business profile' };

/** Shared by all business tools: business details, GSTIN, logo, getting paid. */
export default async function BusinessProfilePage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Fbusiness');
  return (
    <AccountShell workspace narrow title="Business profile" intro="Fill this in once. Your invoices — and later quotations and receipts — start with it.">
      <SettingsForm part="business" />
    </AccountShell>
  );
}
