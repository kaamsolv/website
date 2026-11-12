import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell, SECONDARY } from '@/app/_components/account/account-shell';
import { InvoiceEditor } from '@/app/_components/invoice/invoice-editor';
import { getCurrentUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice' };

/**
 * The invoice editor, inside the signed-in workspace (same editor as /invoice-generator, which stays
 * public and anonymous). `?id=…` opens a saved invoice; `?type=quote` starts a quotation.
 */
export default async function InvoiceEditorPage({ searchParams }: { searchParams: Promise<{ id?: string; type?: string }> }) {
  const { id, type } = await searchParams;
  const user = await getCurrentUser(await headers());
  if (!user) {
    const back = `/app/invoices/editor${id ? `?id=${encodeURIComponent(id)}` : type ? `?type=${encodeURIComponent(type)}` : ''}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  return (
    <AccountShell
      workspace
      title={type === 'quote' ? 'Quotation' : 'Invoice'}
      intro="Type straight onto the paper. It saves as you go."
      actions={
        <a href="/app/invoices" className={SECONDARY}>
          All invoices
        </a>
      }
    >
      <InvoiceEditor basePath="/app/invoices/editor" />
    </AccountShell>
  );
}
