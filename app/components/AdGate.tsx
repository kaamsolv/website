'use client';

import { AD_FREE_KEYS } from '@/app/lib/entitlements';
import { useMe } from '@/app/lib/me-client';

/**
 * Hides its children (an ad) for paid accounts. Anonymous visitors and free accounts see the ad.
 * A browser that has signed in before asks /api/me once; until it answers, the ad's space is held
 * empty (so a free account sees no layout jump, and a Pro account never sees an ad flash).
 */
export function AdGate({ children }: { children: React.ReactNode }) {
  const me = useMe({ lazy: true });
  if (me.status === 'loading') return <div aria-hidden="true" className="min-h-36" />;
  if (me.status === 'signed-in' && AD_FREE_KEYS.some((k) => me.entitlements.keys.includes(k))) return null;
  return <>{children}</>;
}
