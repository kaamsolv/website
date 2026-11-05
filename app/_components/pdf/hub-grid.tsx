import Link from 'next/link';
import { PDF_SECTIONS, PDF_TOOLS } from '@/app/lib/pdf/tools';

/**
 * Every PDF tool on the hub, grouped. Live tools are links and come first; tools that aren't
 * built yet are greyed, dashed and plain text (never a link), with "Coming soon" written out.
 * A group with nothing live and nothing planned isn't shown. Server-rendered, so the links are in the HTML.
 */
export function HubGrid() {
  return (
    <section aria-labelledby="hub-tools" className="mx-auto mt-12 max-w-5xl">
      <h2 id="hub-tools" className="font-display text-2xl font-bold text-ink">
        All PDF tools
      </h2>
      <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {PDF_SECTIONS.map((section) => {
          const tools = PDF_TOOLS.filter((t) => t.section === section.id);
          if (tools.length === 0) return null;
          const live = tools.filter((t) => t.status === 'live');
          const soon = tools.filter((t) => t.status === 'soon');
          return (
            <div key={section.id}>
              <h3 className="font-display text-lg font-bold text-ink">{section.title}</h3>
              <p className="mt-0.5 text-sm text-muted">{section.blurb}</p>
              <ul className="mt-3 space-y-2">
                {live.map((t) => (
                  <li key={t.label}>
                    <Link
                      href={t.path}
                      className="flex min-h-14 flex-col justify-center rounded-xl border border-hair bg-surface px-4 py-2.5 hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                    >
                      <span className="font-display text-sm font-bold text-ink">{t.label}</span>
                      <span className="text-xs text-muted">{t.hint}</span>
                    </Link>
                  </li>
                ))}
                {soon.map((t) => (
                  <li key={t.label} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-dashed border-hair px-4 py-2 text-muted">
                    <span className="text-sm font-semibold">{t.label}</span>
                    <span className="shrink-0 rounded-full border border-hair px-2.5 py-0.5 text-xs font-semibold">Coming soon</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
