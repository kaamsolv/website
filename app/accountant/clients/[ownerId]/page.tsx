import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ClientBooks } from './client-books';
import { isUuid } from '@/app/lib/api-response';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { grantFor } from '@/db/accountant-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client books' };

/** One client's books, read-only. The grant is checked here and again on every data request. */
export default async function ClientPage({ params }: { params: Promise<{ ownerId: string }> }) {
  const { ownerId } = await params;
  const user = await getCurrentUser(await headers());
  if (!user) redirect(`/login?next=${encodeURIComponent(`/accountant/clients/${ownerId}`)}`);
  if (!isUuid(ownerId) || !(await grantFor(await getDb(), user.id, ownerId))) notFound();
  return <ClientBooks ownerId={ownerId} />;
}
