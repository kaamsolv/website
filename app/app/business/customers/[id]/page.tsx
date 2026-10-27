import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { CustomerDetail } from '@/app/_components/account/customer-detail';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser(await headers());
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/business/customers/${id}`)}`);
  return (
    <AccountShell workspace title="Customer" intro="What they’ve been billed, what they’ve paid, and what they still owe.">
      <CustomerDetail id={id} />
    </AccountShell>
  );
}
