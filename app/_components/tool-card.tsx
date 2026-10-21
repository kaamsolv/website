import { ACCENT } from './accent';
import { Icon } from './icons';
import { CATEGORIES, type Tool } from '../lib/catalogue';

/**
 * Tool card shared by the homepage rail and /tools. A live tool is a link; a
 * planned tool is a faded, non-interactive card with a "Coming soon" tag —
 * never a link to a page that doesn't exist yet. "Faded" = grey text, no
 * accent colour, dashed outline — not opacity, which drops text below 4.5:1.
 */
export function ToolCard({ tool, id }: { tool: Tool; id?: string }) {
  const cat = CATEGORIES.find((c) => c.name === tool.category)!;
  const a = ACCENT[cat.accent];
  const live = tool.status === 'live';

  const body = (
    <>
      <span className={`h-1 ${live ? a.bar : 'bg-hair'}`} aria-hidden="true" />
      <span className={`flex flex-1 flex-col ${live ? 'p-5' : 'px-5 py-4 pr-28'}`}>
        {live && (
          <span className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${a.tint} ${a.fg}`}>
            <Icon name={cat.icon} className="h-5 w-5" />
          </span>
        )}
        <span className={`font-display text-base font-bold ${live ? 'text-ink' : 'text-muted'}`}>
          {tool.name}
        </span>
        <span className="mt-1 text-sm text-muted">{tool.blurb}</span>
      </span>
      {!live && (
        <span className="absolute right-4 top-4 rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-muted">
          Coming soon
        </span>
      )}
    </>
  );

  if (!live) {
    return (
      <div
        id={id}
        className="relative flex h-full scroll-mt-24 flex-col overflow-hidden rounded-xl2 border border-dashed border-hair bg-transparent"
      >
        {body}
      </div>
    );
  }

  return (
    <a
      id={id}
      href={tool.url}
      className="group relative flex h-full scroll-mt-24 flex-col overflow-hidden rounded-xl2 border border-hair bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      {body}
    </a>
  );
}
