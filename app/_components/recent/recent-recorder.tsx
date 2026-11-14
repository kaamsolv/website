'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { noteToolUse, toolForPath } from '@/app/lib/recent-tools';

/**
 * The signed-in workspace counts toward "Pick up where you left off" too: its invoice and QR pages are the same tools as the
 * public ones. Renders nothing; kept on this device only (app/lib/recent-tools.ts). Public tool pages record themselves
 * through `ToolOpen`.
 */
export function RecentFromPath() {
  const pathname = usePathname();
  useEffect(() => {
    const slug = toolForPath(pathname);
    if (slug) noteToolUse(slug);
  }, [pathname]);
  return null;
}
