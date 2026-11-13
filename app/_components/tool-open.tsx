'use client';

import { useEffect } from 'react';
import { TOOLS } from '@/app/lib/catalogue';
import { trackToolOpen, type ToolType } from '@/app/lib/analytics';
import { noteToolUse } from '@/app/lib/recent-tools';
import { useConsent } from './use-consent';

/**
 * Fires `tool_open` once when a tool page appears (and again only if the
 * visitor accepts analytics while on it). Renders nothing. Server pages pass
 * the catalogue slug, so name and category come from the catalogue.
 *
 * It also remembers, on this device only, that the tool was opened ("Pick up where you left off",
 * app/lib/recent-tools.ts). That does not depend on the analytics choice: it is a convenience kept in the visitor's
 * own browser and never sent anywhere. Every tool page mounts this, which is why it lives here.
 */
export function ToolOpen({ slug, type }: { slug: string; type?: ToolType }) {
  const consent = useConsent();
  useEffect(() => {
    noteToolUse(slug);
  }, [slug]);
  useEffect(() => {
    if (consent !== 'granted') return;
    const tool = TOOLS.find((t) => t.slug === slug);
    if (tool) trackToolOpen(tool, type);
  }, [consent, slug, type]);
  return null;
}
