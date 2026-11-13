'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { parseRecent, readRaw, subscribeRecent, type RecentEntry } from '@/app/lib/recent-tools';

/**
 * The recent-tools list kept on this device, newest first. Empty on the server and during the first paint, then filled in
 * (a returning visitor sees their row appear a moment after the page loads). Updates when a tool is opened in this tab or
 * in another one, and when the list is cleared.
 */
export function useRecentTools(): RecentEntry[] {
  const raw = useSyncExternalStore(subscribeRecent, readRaw, () => '');
  return useMemo(() => parseRecent(raw || null), [raw]);
}
