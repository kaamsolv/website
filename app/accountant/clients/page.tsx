import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { clientsOf } from '@/db/accountant-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your clients' };

/** The businesses that have given this signed-in accountant read-only access. */
export default async function ClientsPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect('/login?next=%2Faccountant%2Fclients');
  const clients = await clientsOf(await getDb(), user.id);
  return (
    <main id="main" className="kk-container py-10">
      <h1 className="font-display text-3xl font-bold text-ink">Your clients</h1>
      <p className="mt-1 text-muted">Businesses that have given you read-only access to their invoices and payments.</p>
      {clients.length === 0 ? (
        <p className="mt-6 rounded-xl2 border border-dashed border-hair p-6 text-strong" data-testid="no-clients">Nobody has given you access yet. When a client invites you, the email has a link to accept.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="clients">
          {clients.map((c) => (
            <li key={c.accessId}>
              <Link href={`/accountant/clients/${c.ownerId}`} className="block rounded-xl2 border border-hair bg-surface p-5 hover:bg-wash">
                <span className="font-display text-lg font-bold text-ink">{c.businessName || 'A client'}</span>
                <span className="mt-1 block text-sm text-muted">Access since {new Date(c.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
