import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { InvoicePayments } from '@/app/_components/account/invoice-payments';
import { InvoiceShare } from '@/app/_components/account/invoice-share';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice payments' };

export default async function InvoicePaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser(await headers());
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/invoices/${id}`)}`);

  return (
    <AccountShell
      workspace
      title="Payments"
      intro="What’s been received, and what’s still owed."
      actions={
        <a href="/app/invoices" className={SECONDARY}>
          All invoices
        </a>
      }
    >
      <div className="space-y-6">
        <InvoicePayments id={id} />
        <InvoiceShare id={id} />
      </div>
    </AccountShell>
  );
}
