import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { featuredApps } from '@/app/lib/apps';

/**
 * "Featured Applications": the substantial products, as larger cards than the ordinary tools. Server-rendered;
 * what appears comes from `app/lib/apps.ts`, which shows an app only while the catalogue says it works.
 */
export function FeaturedApps() {
  const apps = featuredApps();
  if (apps.length === 0) return null;
  return (
    <section aria-labelledby="featured-apps" className="kk-container py-12 sm:py-16">
      <div className="max-w-2xl">
        <h2 id="featured-apps" className="font-display text-2xl font-bold text-ink sm:text-3xl">
          Featured Applications
        </h2>
        <p className="mt-1 text-muted">The bigger jobs. Each one is a small workspace of its own.</p>
      </div>
      <ul className="mt-8 grid gap-4 md:grid-cols-3 lg:gap-6">
        {apps.map((app) => {
          const a = ACCENT[app.accent];
          return (
            <li key={app.id}>
              <a
                href={app.href}
                data-testid={`app-${app.id}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-xl2 border border-hair bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className={`h-1.5 ${a.bar}`} aria-hidden="true" />
                <span className="flex flex-1 flex-col p-6 sm:p-7">
                  <span className="flex items-start justify-between gap-3">
                    <span className={`grid h-14 w-14 place-items-center rounded-2xl ${a.tint} ${a.fg}`}>
                      <Icon name={app.icon} className="h-7 w-7" />
                    </span>
                    <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-strong">{app.category}</span>
                  </span>
                  <span className="mt-5 font-display text-xl font-bold text-ink">{app.name}</span>
                  <span className="mt-2 flex-1 text-muted">{app.blurb}</span>
                  <span className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-strong">
                    {app.points.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1.5">
                        <Icon name="check" className="h-4 w-4 text-tealx-600" />
                        {p}
                      </span>
                    ))}
                  </span>
                  <span className="mt-6 inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-coral-500 px-5 text-sm font-semibold text-navy-900 transition-colors group-hover:bg-coral-600 group-hover:text-white">
                    {app.cta}
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
