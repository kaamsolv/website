'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CARD, SECONDARY } from '@/app/lib/ui-classes';
import type { MyApplication } from '@/db/affiliate-scope';

type Mine = { applications: MyApplication[] };
type Door = { status: 'open' | 'closed' | null; pending: number };

const STATUS: Record<MyApplication['status'], string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Not approved', withdrawn: 'Withdrawn' };

/**
 * Affiliate programmes on "Your KaamSolv": the ones you've applied to or joined, and the one you run, if any.
 * It draws nothing for someone with neither, so portals stay unlinked from the rest of the site until a person is
 * actually part of one. Reads only the signed-in person's own rows (/api/affiliate/me and /api/affiliate/merchant).
 */
export function AffiliateHubCard() {
  const [mine, setMine] = useState<MyApplication[] | null>(null);
  const [runs, setRuns] = useState<{ slug: string; name: string; door: Door | null } | null>(null);

  useEffect(() => {
    const get = (url: string) => fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    get('/api/affiliate/me').then((b: Mine | null) => setMine(b?.applications ?? []));
    get('/api/affiliate/merchant').then(async (b: { merchant: { slug: string; name: string } | null } | null) => {
      if (!b?.merchant) return setRuns(null);
      const door = (await get('/api/affiliate/programme')) as ({ ok: boolean } & Door) | null;
      setRuns({ slug: b.merchant.slug, name: b.merchant.name, door: door ? { status: door.status, pending: door.pending } : null });
    });
  }, []);

  const apps = mine ?? [];
  if (apps.length === 0 && !runs) return null;
  const joined = apps.filter((a) => a.status === 'approved').length;
  const waiting = apps.filter((a) => a.status === 'pending').length;

  return (
    <section aria-labelledby="affiliate-h" className={`${CARD} space-y-5`} data-testid="affiliate-hub-card">
      <h2 id="affiliate-h" className="font-display text-lg font-bold text-ink">
        Affiliate programmes
      </h2>

      {apps.length > 0 && (
        <div>
          <p className="text-sm text-muted">
            {joined} joined{waiting > 0 ? ` · ${waiting} waiting for review` : ''}
          </p>
          <ul className="mt-3 divide-y divide-hair">
            {apps.slice(0, 4).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/affiliate/${a.slug}`} className="min-w-0 break-words text-sm font-semibold text-ink underline underline-offset-2">
                  {a.programmeName}
                </Link>
                <span className="rounded-full border border-hair px-3 py-0.5 text-xs font-bold text-strong">{STATUS[a.status]}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/affiliate/programmes" className={`${SECONDARY} mt-3`}>
            {apps.length > 4 ? `See all ${apps.length} programmes` : 'Programmes I’ve joined'}
          </Link>
        </div>
      )}

      {runs && (
        <div className={apps.length > 0 ? 'border-t border-hair pt-4' : ''}>
          <p className="text-sm text-muted">
            Your programme: <span className="font-semibold text-ink">{runs.name}</span>
            {runs.door ? ` · registration ${runs.door.status === 'open' ? 'open' : 'closed'}` : ''}
            {runs.door && runs.door.pending > 0 ? ` · ${runs.door.pending} to review` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/app/affiliate/applications" className={SECONDARY}>
              Applications
            </Link>
            <Link href="/app/affiliate/portal" className={SECONDARY}>
              Edit my portal
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
