import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { SettingsForm } from '@/app/_components/account/settings-form';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice settings' };

/** Invoices → Invoice settings: numbering and the defaults new invoices start with. */
export default async function InvoiceSettingsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Finvoices%2Fsettings');
  return (
    <AccountShell workspace narrow title="Invoice settings" intro="How new invoices are numbered, and what they start with.">
      <SettingsForm part="invoice" />
    </AccountShell>
  );
}
