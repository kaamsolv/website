'use client';

import { useEffect } from 'react';
import { TOOLS } from '@/app/lib/catalogue';
import { trackToolOpen, type ToolType } from '@/app/lib/analytics';
import { useConsent } from './use-consent';

/**
 * Fires `tool_open` once when a tool page appears (and again only if the
 * visitor accepts analytics while on it). Renders nothing. Server pages pass
 * the catalogue slug, so name and category come from the catalogue.
 */
export function ToolOpen({ slug, type }: { slug: string; type?: ToolType }) {
  const consent = useConsent();
  useEffect(() => {
    if (consent !== 'granted') return;
    const tool = TOOLS.find((t) => t.slug === slug);
    if (tool) trackToolOpen(tool, type);
  }, [consent, slug, type]);
  return null;
}
