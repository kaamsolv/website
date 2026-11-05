/**
 * What the PDF hub shows, joined from the registry (tools.ts) and the catalogue (the source of truth for
 * "is this tool live?"). Server-side only: the catalogue isn't loaded into the browser bundle.
 * A tool the registry calls live but the catalogue doesn't is left out, so the hub can never link to a page that isn't built.
 */

import { TOOLS } from '../catalogue';
import { PDF_SECTIONS, PDF_TOOLS, type PdfIconName, type PdfSection } from './tools';

export type HubLiveTool = { label: string; blurb: string; href: string; icon: PdfIconName; popular: boolean };
export type HubSoonTool = { label: string; hint: string };
export type HubSection = PdfSection & { live: HubLiveTool[]; soon: HubSoonTool[] };

const catalogueSays = (path: string) => TOOLS.find((t) => t.url === path);

export function hubSections(): HubSection[] {
  return PDF_SECTIONS.map((section) => {
    const here = PDF_TOOLS.filter((t) => t.section === section.id);
    const live: HubLiveTool[] = [];
    const soon: HubSoonTool[] = [];
    for (const t of here) {
      if (t.status === 'live') {
        const entry = catalogueSays(t.path);
        if (entry?.status === 'live') live.push({ label: t.label, blurb: entry.blurb, href: t.path, icon: t.icon, popular: !!t.popular });
      } else {
        soon.push({ label: t.label, hint: t.hint });
      }
    }
    return { ...section, live, soon };
  }).filter((s) => s.live.length + s.soon.length > 0);
}

/** The "Popular PDF tasks" row: the registry's popular tools, in order, that are live in the catalogue. */
export function popularTasks(): (HubLiveTool & { accent: PdfSection['accent'] })[] {
  return hubSections().flatMap((s) => s.live.filter((t) => t.popular).map((t) => ({ ...t, accent: s.accent })));
}
