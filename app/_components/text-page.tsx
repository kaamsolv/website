import { Breadcrumb } from './breadcrumb';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * Shell for plain reading pages (About, Contact, Privacy, Terms): header,
 * breadcrumb, title, optional "last updated" line, and readable body text.
 * Body styles are applied to plain elements so page content stays simple JSX.
 */
export function TextPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  /** ISO date, e.g. "2026-10-21". Shown as "Last updated 21 October 2026". */
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        <section aria-labelledby="page-title" className="border-b border-hair bg-surface">
          <div className="kk-container py-10 sm:py-14">
            <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: title }]} />
            <h1
              id="page-title"
              className="mt-6 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
            >
              {title}
            </h1>
            {intro && <p className="mt-3 max-w-2xl text-muted sm:text-lg">{intro}</p>}
            {updated && (
              <p className="mt-3 text-sm text-muted">
                Last updated{' '}
                <time dateTime={updated}>
                  {new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(updated))}
                </time>
              </p>
            )}
          </div>
        </section>

        <div
          className="kk-container max-w-3xl py-10 text-strong sm:py-14 [&_a]:font-semibold [&_a]:text-coral-600 [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h2:first-child]:mt-0 [&_h3]:mt-6 [&_h3]:font-display [&_h3]:font-bold [&_h3]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
        >
          {children}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
