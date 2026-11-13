import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { featuredApps, type AppEntry } from '@/app/lib/apps';

/**
 * The homepage hero's right side: KaamSolv's main products, each with its own picture, a name, one sentence and the
 * action it opens. Server-rendered; what appears comes from `app/lib/apps.ts`, which shows a product only while the
 * catalogue says it works. Everyday one-task tools are not here: the search on the left is how people find those.
 */

/** A small drawing per product (24px-grid outline language, scaled up), in the product's accent colour. */
function Glyph({ id }: { id: AppEntry['id'] }) {
  const common = { viewBox: '0 0 56 56', className: 'h-full w-full', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  if (id === 'invoice') {
    // A page with a heading bar, lines of items and a total.
    return (
      <svg {...common}>
        <rect x="13" y="7" width="30" height="42" rx="4" />
        <rect x="19" y="14" width="10" height="3.5" rx="1.75" fill="currentColor" stroke="none" />
        <path d="M19 24h18M19 30h18M19 36h9" />
        <rect x="31" y="35" width="8" height="8" rx="2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === 'qr') {
    // Three finder squares and a few modules.
    return (
      <svg {...common}>
        <rect x="8" y="8" width="16" height="16" rx="2.5" />
        <rect x="13" y="13" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
        <rect x="32" y="8" width="16" height="16" rx="2.5" />
        <rect x="37" y="13" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
        <rect x="8" y="32" width="16" height="16" rx="2.5" />
        <rect x="13" y="37" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
        <g fill="currentColor" stroke="none">
          <rect x="32" y="32" width="5" height="5" rx="1" />
          <rect x="43" y="32" width="5" height="5" rx="1" />
          <rect x="37.5" y="37.5" width="5" height="5" rx="1" />
          <rect x="32" y="43" width="5" height="5" rx="1" />
          <rect x="43" y="43" width="5" height="5" rx="1" />
        </g>
      </svg>
    );
  }
  // PDF: a page with a folded corner, and a second page behind it.
  return (
    <svg {...common}>
      <path d="M20 12h14l9 9v26a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" />
      <path d="M34 12v9h9" />
      <path d="M23 31h14M23 37h14M23 43h8" />
      <path d="M13 17v31a2 2 0 0 0 2 2h22" opacity="0.45" />
    </svg>
  );
}

export function HeroProducts() {
  const apps = featuredApps();
  if (apps.length === 0) return null;
  return (
    <section aria-label="Featured products" data-testid="hero-products" className="kk-rise kk-rise-3">
      <p className="mb-3 text-sm font-semibold text-muted">KaamSolv’s main products</p>
      <ul className="space-y-3">
        {apps.map((app) => {
          const a = ACCENT[app.accent];
          return (
            <li key={app.id}>
              <a
                href={app.href}
                data-testid={`app-${app.id}`}
                className="group flex items-center gap-4 rounded-xl2 border border-hair bg-surface p-3.5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-4"
              >
                <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl p-2.5 sm:h-16 sm:w-16 ${a.tint} ${a.fg}`}>
                  <Glyph id={app.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold text-ink">{app.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">{app.short}</span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-coralx-600 group-hover:underline">
                    {app.cta}
                    <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <a
        href="/tools"
        data-testid="explore-products"
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hair bg-surface px-5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        Explore all products
        <Icon name="arrow-right" className="h-4 w-4" />
      </a>
    </section>
  );
}
