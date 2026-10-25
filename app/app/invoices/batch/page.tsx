import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountShell } from '@/app/_components/account/account-shell';
import { BatchImport } from '@/app/_components/account/batch-import';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoices from a CSV' };

/** Invoices → Batch: many invoices from one CSV (Pro). Free accounts go to All invoices. */
export default async function InvoiceBatchPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Fapp%2Finvoices%2Fbatch');
  const ent = entitlementsFrom(await getEntitlements(await getDb(), user.id));
  if (!ent.can('invoice_batch_csv')) redirect('/app/invoices');

  return (
    <AccountShell workspace title="Invoices from a CSV" intro="Fill in a spreadsheet, get a stack of invoices and a ZIP of PDFs.">
      <BatchImport />
    </AccountShell>
  );
}
