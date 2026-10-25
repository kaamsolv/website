import AdSlot from '@/app/components/AdSlot';
import { ACCENT } from './accent';
import { Breadcrumb } from './breadcrumb';
import { Icon } from './icons';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { ToolCard } from './tool-card';
import { CATEGORIES, liveFirst, TOOLS, type Tool } from '@/app/lib/catalogue';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

export type ToolStep = { t: string; d: string };
export type ToolFaq = { q: string; a: string };

/**
 * Shared page frame for a catalogue tool: breadcrumb, category badge, H1,
 * intro, the tool itself, "How it works", FAQ, a house promo and related
 * tools, plus WebApplication + BreadcrumbList JSON-LD. The tool's own UI is
 * passed as children. Everything descriptive comes from the catalogue entry.
 */
export function ToolPageShell({
  slug,
  h1,
  intro,
  steps,
  faq,
  related,
  tool: toolOverride,
  children,
}: {
  /** Catalogue slug — name, URL and category come from the catalogue. */
  slug: string;
  /** For a page that isn't one catalogue tool (e.g. the /pdf-tools hub). */
  tool?: Tool;
  h1: string;
  intro: string;
  steps: ToolStep[];
  faq: ToolFaq[];
  /** Related tool slugs; defaults to other tools in the same category. Live first. */
  related?: string[];
  children: React.ReactNode;
}) {
  const tool = toolOverride ?? TOOLS.find((t) => t.slug === slug)!;
  const cat = CATEGORIES.find((c) => c.name === tool.category)!;
  const accent = ACCENT[cat.accent];
  const relatedTools: Tool[] = liveFirst(
    related
      ? related.map((s) => TOOLS.find((t) => t.slug === s)!).filter(Boolean)
      : TOOLS.filter((t) => t.category === tool.category && t.slug !== slug),
  ).slice(0, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}${tool.url}#app`,
        name: `KaamSolv ${tool.name}`,
        url: `${SITE_URL}${tool.url}`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
        publisher: { '@id': `${SITE_URL}/#org` },
        inLanguage: 'en',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: tool.name, item: `${SITE_URL}${tool.url}` },
        ],
      },
    ],
  };

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        <section aria-labelledby="tool-title" className="overflow-x-clip border-b border-hair">
          <div className="kk-container py-10 sm:py-14">
            <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: tool.name }]} />

            <div className="mt-6 max-w-2xl">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${accent.tint} ${accent.fg}`}
              >
                <Icon name={cat.icon} className="h-3.5 w-3.5" />
                {cat.name} · Free tool
              </span>
              <h1
                id="tool-title"
                className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
              >
                {h1}
              </h1>
              <p className="mt-3 text-pretty text-lg text-muted">{intro}</p>
            </div>

            <noscript>
              <p className="mt-4 rounded-lg border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
                This tool needs JavaScript. Please turn it on in your browser.
              </p>
            </noscript>

            <div className="mt-8">{children}</div>
          </div>
        </section>

        <section aria-labelledby="how-title" className="kk-container py-12 sm:py-16">
          <h2 id="how-title" className="font-display text-2xl font-bold text-ink">
            How it works
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.t}>
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-900 font-display text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-hair sm:block" aria-hidden="true" />}
                </div>
                <p className="mt-3 font-display font-bold text-ink">{step.t}</p>
                <p className="mt-1 text-sm text-muted">{step.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {faq.length > 0 && (
          <section aria-labelledby="faq-title" className="kk-container border-t border-hair py-12 sm:py-16">
            <h2 id="faq-title" className="font-display text-2xl font-bold text-ink">
              Questions
            </h2>
            <div className="mt-6 max-w-2xl divide-y divide-hair border-y border-hair">
              {faq.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                    {item.q}
                    <Icon
                      name="chevron-right"
                      className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-90"
                    />
                  </summary>
                  <p className="pb-4 text-sm text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <aside aria-label="Promotion" className="kk-container pb-2">
          <AdSlot
            slotId={`${slug}-promo`}
            size="billboard"
            mode="house"
            enabled
            label="From KaamSolv"
            houseAd={{
              eyebrow: 'Small problems. Solved.',
              title: 'One less thing to figure out.',
              body: 'KaamSolv is a growing toolbox for everyday work and life. Free, no sign-up.',
              ctaLabel: 'See all tools',
              href: '/tools',
            }}
          />
        </aside>

        {relatedTools.length > 0 && (
          <section aria-labelledby="related-title" className="kk-container py-12 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="related-title" className="font-display text-2xl font-bold text-ink">
                Related tools
              </h2>
              <a
                href="/tools"
                className="inline-flex items-center gap-1 rounded text-sm font-semibold text-coral-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
              >
                All tools <Icon name="arrow-right" className="h-4 w-4" />
              </a>
            </div>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedTools.map((t) => (
                <li key={t.slug}>
                  <ToolCard tool={t} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
