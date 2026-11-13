import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { PdfIcon } from './pdf-icons';
import type { HubLiveTool, HubSoonTool } from '@/app/lib/pdf/hub-data';
import type { Accent } from '@/app/lib/catalogue';

/**
 * The PDF directory's cards. The shell is the production `ToolCard`'s (rounded-xl2, hairline border, 4px
 * accent strip, tinted icon tile, Sora-bold name, muted blurb, hover lift and shadow, coral focus ring).
 * Two differences, both needed here:
 *   - the accent comes from the PDF *section* (Organise, Compress, Convert…), not the catalogue category,
 *     because every PDF tool is in "Documents" and one purple everywhere would make the directory flat;
 *   - the icon is one glyph per task rather than one per category.
 * On a phone the card lies on its side (icon beside the words) so the directory isn't a mile long; from `sm` up it stands.
 * A planned tool is the same as in `ToolCard`: dashed, grey, "Coming soon", never a link.
 */

const LIVE_SHELL =
  'group relative flex h-full flex-col overflow-hidden rounded-xl2 border border-hair bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none motion-reduce:hover:translate-y-0';

export function PdfToolCard({ tool, accent }: { tool: HubLiveTool; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <a href={tool.href} className={LIVE_SHELL}>
      <span className={`h-1 ${a.bar}`} aria-hidden="true" />
      <span className="flex flex-1 items-center gap-4 p-4 sm:flex-col sm:items-stretch sm:gap-0 sm:p-6">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:mb-4 sm:h-12 sm:w-12 ${a.tint} ${a.fg}`}>
          <PdfIcon name={tool.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-base font-bold text-ink sm:text-lg">{tool.label}</span>
          <span className="mt-0.5 flex-1 text-sm text-muted sm:mt-1.5 sm:leading-relaxed">{tool.blurb}</span>
          <span className="mt-4 hidden items-center text-coralx-600 sm:inline-flex" aria-hidden="true">
            <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
          </span>
        </span>
        <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-coralx-600 sm:hidden" />
      </span>
    </a>
  );
}

/** A section with one live tool: one wide card that uses the row, with the section's plain-words note as the benefit. Nothing is claimed beyond that note and the catalogue blurb. */
export function PdfFeatureCard({ tool, accent, note }: { tool: HubLiveTool; accent: Accent; note?: string }) {
  const a = ACCENT[accent];
  return (
    <a href={tool.href} className={LIVE_SHELL}>
      <span className={`h-1.5 ${a.bar}`} aria-hidden="true" />
      <span className="flex flex-1 items-center gap-4 p-4 sm:gap-6 sm:p-6 lg:p-7">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:h-14 sm:w-14 ${a.tint} ${a.fg}`}>
          <PdfIcon name={tool.icon} className="h-5 w-5 sm:h-7 sm:w-7" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-10">
          <span className="min-w-0 lg:basis-1/2">
            <span className="block font-display text-base font-bold text-ink sm:text-xl">{tool.label}</span>
            <span className="mt-0.5 block text-sm text-muted sm:mt-1.5 sm:text-base sm:leading-relaxed">{tool.blurb}</span>
          </span>
          {note && <span className="block text-sm text-muted sm:leading-relaxed lg:basis-1/2 lg:border-l lg:border-hair lg:pl-10">{note}</span>}
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-coralx-600 sm:inline-flex" aria-hidden="true">
          Open
          <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
        </span>
        <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-coralx-600 sm:hidden" />
      </span>
    </a>
  );
}

/** A larger card for the few tasks most people come for: more room and a visible "Open" cue (a chevron on a phone, where it lies on its side). */
export function PopularCard({ tool, accent }: { tool: HubLiveTool; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <a href={tool.href} className={LIVE_SHELL}>
      <span className={`h-1.5 ${a.bar}`} aria-hidden="true" />
      <span className="flex flex-1 items-center gap-4 p-5 sm:flex-col sm:items-stretch sm:gap-0 sm:p-6">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl sm:mb-4 ${a.tint} ${a.fg}`}>
          <PdfIcon name={tool.icon} className="h-6 w-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg font-bold text-ink sm:text-xl">{tool.label}</span>
          <span className="mt-0.5 flex-1 text-sm text-muted sm:mt-1.5 sm:text-base">{tool.blurb}</span>
          <span className="mt-5 hidden items-center gap-1.5 text-sm font-semibold text-coralx-600 sm:inline-flex">
            Open
            <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
          </span>
        </span>
        <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-coralx-600 sm:hidden" />
      </span>
    </a>
  );
}

export function PdfSoonCard({ tool }: { tool: HubSoonTool }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl2 border border-dashed border-hair bg-transparent">
      <span className="h-1 bg-hair" aria-hidden="true" />
      <span className="flex flex-1 flex-col px-5 py-5 pr-28 sm:px-6 sm:pr-28">
        <span className="font-display text-base font-bold text-muted">{tool.label}</span>
        <span className="mt-1 text-sm text-muted">{tool.hint}</span>
      </span>
      <span className="absolute right-4 top-5 rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-muted">Coming soon</span>
    </div>
  );
}
