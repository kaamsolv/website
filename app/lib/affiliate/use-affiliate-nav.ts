'use client';

import { useEffect, useState } from 'react';
import type { ApplicationStatus } from './application';

export type StatusCounts = Record<ApplicationStatus, number>;

export type AffiliateNav = {
  /** My applications to other people's programmes, by status. */
  joined: StatusCounts;
  /** My own programme, or null if I haven't made one. */
  created: null | { slug: string; name: string; registration: 'open' | 'closed'; counts: StatusCounts };
};

/** The totals the sidebar and the Affiliate page both show. `null` while loading or if it couldn't load. */
export function useAffiliateNav(refreshKey = ''): AffiliateNav | null {
  const [nav, setNav] = useState<AffiliateNav | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/affiliate/nav', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: ({ ok: boolean } & AffiliateNav) | null) => live && setNav(b ? { joined: b.joined, created: b.created } : null))
      .catch(() => live && setNav(null));
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return nav;
}
