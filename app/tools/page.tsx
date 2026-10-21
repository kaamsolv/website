import type { Metadata } from 'next';
import { ACCENT } from '../_components/accent';
import { Breadcrumb } from '../_components/breadcrumb';
import { Icon } from '../_components/icons';
import { SiteFooter } from '../_components/site-footer';
import { SiteHeader } from '../_components/site-header';
import { ToolCard } from '../_components/tool-card';
import { CATEGORIES, LIVE_TOOL_COUNT, LIVE_TOOLS, toolsInCategory } from '../lib/catalogue';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

export const metadata: Metadata = {
  title: 'All tools',
  description:
    'Every KaamSolv tool in one place — shorten links, make QR codes and convert images, free and with no sign-up. More tools on the way.',
  alternates: { canonical: '/tools' },
  openGraph: { type: 'website', url: `${SITE_URL}/tools`, title: 'All tools · KaamSolv' },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'All tools', item: `${SITE_URL}/tools` },
  ],
};

export default function ToolsPage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        <section aria-labelledby="tools-title" className="border-b border-hair bg-surface">
          <div className="kk-container py-10 sm:py-14">
            <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'All tools' }]} />
            <h1
              id="tools-title"
              className="mt-6 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
            >
              All tools
            </h1>
            <p className="mt-3 max-w-2xl text-muted sm:text-lg">
              {LIVE_TOOL_COUNT} tools ready to use — free, no sign-up. More are on the way.
            </p>

            <nav aria-label="Jump to a category" className="mt-6 flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <a
                  key={cat.slug}
                  href={`#${cat.slug}`}
                  className="rounded-full border border-hair bg-surface px-3 py-1.5 text-sm font-medium text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                >
                  {cat.name}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <section aria-labelledby="ready-title" className="kk-container py-12 sm:py-14">
          <h2 id="ready-title" className="font-display text-2xl font-bold text-ink">
            Ready to use
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LIVE_TOOLS.map((tool) => (
              <li key={tool.slug}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="by-category-title" className="kk-container border-t border-hair py-12 sm:py-14">
          <h2 id="by-category-title" className="font-display text-2xl font-bold text-ink">
            By category
          </h2>
          <p className="mt-1 text-muted">Faded ones are coming soon.</p>

          <div className="mt-8 space-y-12">
            {CATEGORIES.map((cat) => {
              const a = ACCENT[cat.accent];
              const tools = toolsInCategory(cat.name);
              const live = tools.filter((t) => t.status === 'live').length;
              return (
                <section key={cat.slug} id={cat.slug} aria-labelledby={`${cat.slug}-title`} className="scroll-mt-24">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${a.tint} ${a.fg}`}>
                      <Icon name={cat.icon} className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 id={`${cat.slug}-title`} className="font-display text-lg font-bold text-ink">
                        {cat.name}
                      </h3>
                      <p className="text-sm text-muted">
                        {cat.blurb} {live > 0 ? `${live} ready.` : 'Coming soon.'}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tools.map((tool) => (
                      <li key={tool.slug}>
                        <ToolCard tool={tool} id={tool.status === 'live' ? undefined : tool.slug} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
        />
      </main>

      <SiteFooter />
    </>
  );
}
