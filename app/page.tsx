import AdSlot from './components/AdSlot';
import { Icon } from './_components/icons';
import { SiteHeader } from './_components/site-header';
import { SiteFooter } from './_components/site-footer';
import { ToolSearch } from './_components/tool-search';
import { ACCENT } from './_components/accent';
import { ToolCard } from './_components/tool-card';
import {
  CATEGORIES,
  LIVE_TOOLS,
  POPULAR_TOOLS,
  TOOLS,
  type Accent,
} from './lib/catalogue';

/**
 * Hero sticky notes. Status comes from the catalogue, so a "Soon" note turns
 * into a working link on its own when that tool goes live.
 */
const HERO_CHIPS = [
  { label: 'Shorten a link', slug: 'url-shortener', accent: 'coral' as Accent, rotate: '-rotate-2' },
  { label: 'Make a QR code', slug: 'qr-code-generator', accent: 'purple' as Accent, rotate: 'rotate-1' },
  { label: 'Convert PNG to JPG', slug: 'png-to-jpg', accent: 'teal' as Accent, rotate: '-rotate-1' },
  { label: 'iPhone photo to JPG', slug: 'heic-to-jpg', accent: 'yellow' as Accent, rotate: 'rotate-2' },
  { label: 'Calculate GST', slug: 'gst-calculator', accent: 'yellow' as Accent, rotate: '-rotate-1' },
  { label: 'Make an invoice', slug: 'invoice-generator', accent: 'coral' as Accent, rotate: 'rotate-1' },
].map((chip) => ({ ...chip, tool: TOOLS.find((t) => t.slug === chip.slug)! }));

/** Quick links under the search box — only tools that work today. */
const QUICK_LINKS = [...new Set([...POPULAR_TOOLS.filter((t) => t.status === 'live'), ...LIVE_TOOLS])].slice(0, 4);

const STEPS = [
  { n: '1', t: 'Find it', d: 'Search, or pick a category. The tool you need is a click away.' },
  { n: '2', t: 'Do it', d: 'Type a number, upload a file, choose an option. One screen, no setup.' },
  { n: '3', t: 'Done', d: 'Copy the result or download the file, and get on with your day.' },
];

const TRUST = [
  { icon: 'bolt' as const, t: 'Quick by design', d: 'One task per tool. No dashboards to learn.' },
  { icon: 'lock' as const, t: 'Yours stays yours', d: 'Files are processed in your browser wherever we can.' },
  { icon: 'heart' as const, t: 'Free to use', d: 'The everyday tools stay free, no account needed.' },
  { icon: 'smile' as const, t: 'Made for real life', d: 'Built around things people actually need to get done.' },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://kaamsolv.com/#org',
      name: 'KaamSolv',
      url: 'https://kaamsolv.com',
      slogan: 'Small tools for everyday problems.',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://kaamsolv.com/#site',
      name: 'KaamSolv',
      url: 'https://kaamsolv.com',
      description:
        'A growing toolbox for small everyday problems. Calculate, convert, create and get on with your day.',
      publisher: { '@id': 'https://kaamsolv.com/#org' },
      inLanguage: 'en',
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        {/* ---------- HERO ---------- */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-hair bg-surface">
          <div className="kk-dotgrid" aria-hidden="true" />
          <div className="kk-container relative grid gap-10 py-12 sm:py-16 md:grid-cols-[1.15fr_0.85fr] md:items-center md:gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-20">
            <div>
              <h1
                id="hero-title"
                className="kk-rise text-balance font-display text-[2rem] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-4xl lg:text-5xl xl:text-6xl"
              >
                What do you need to{' '}
                <span className="kk-underline-coral whitespace-nowrap text-coral-500">get done</span>?
              </h1>
              <p className="kk-rise kk-rise-2 mt-4 max-w-xl text-base text-muted sm:mt-5 sm:text-lg">
                Small tools for everyday problems. Calculate, convert, create — and get on with your day.
              </p>

              <div className="kk-rise kk-rise-3 mt-6 max-w-xl sm:mt-7">
                <ToolSearch variant="hero" inputId="hero-search" />
                <span id="hero-search-anchor" aria-hidden="true" className="block h-px" />
              </div>

              <div className="kk-rise kk-rise-3 mt-4 flex max-w-xl flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-muted">Popular:</span>
                {QUICK_LINKS.map((tool) => (
                  <a
                    key={tool.slug}
                    href={tool.url}
                    className="rounded font-medium text-coral-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                  >
                    {tool.name}
                  </a>
                ))}
              </div>

              <p className="kk-rise kk-rise-4 mt-5 flex items-center gap-2 text-sm text-muted sm:mt-6">
                <Icon name="sparkle" className="h-4 w-4 text-teal-500" />
                Free to use. No sign-up to get started.
              </p>
            </div>

            {/* Sticky notes — tools you can use now, then a couple that are on the way. */}
            <nav aria-label="Tools you can use now" className="kk-rise kk-rise-3 relative hidden md:block">
              <ul className="ml-auto flex max-w-[17rem] flex-col items-start gap-2.5 lg:max-w-xs lg:gap-3">
                {HERO_CHIPS.map(({ label, tool, accent, rotate }) => {
                  const a = ACCENT[accent];
                  const live = tool.status === 'live';
                  return (
                    <li key={tool.slug} className={rotate}>
                      {live ? (
                        <a
                          href={tool.url}
                          className="inline-flex items-center gap-2 rounded-full border border-hair bg-surface px-4 py-2 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                        >
                          <span className={`grid h-6 w-6 place-items-center rounded-full ${a.tint} ${a.fg}`}>
                            <Icon name="arrow-right" className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-sm font-semibold text-ink">{label}</span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-hair px-4 py-2">
                          <span className="text-sm font-semibold text-muted">{label}</span>
                          <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-muted">
                            Soon
                          </span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="font-hand ml-auto mt-3 max-w-[17rem] pr-4 text-right text-2xl text-coral-600 lg:max-w-xs" aria-hidden="true">
                Small problems. Less kaam.
              </p>
            </nav>
          </div>
        </section>

        {/* ---------- PROMO BANNER (AdSlot) — between the hero and tool discovery.
             House promo now; the same slot can switch to an external provider
             later without touching this page. ---------- */}
        <aside aria-label="Promotion" className="kk-container pt-10 sm:pt-12">
          <AdSlot
            slotId="home-hero-promo"
            size="billboard"
            mode="house"
            enabled
            label="From KaamSolv"
            houseAd={{
              eyebrow: 'Small problems. Solved.',
              title: 'Need to get something done?',
              body: 'KaamSolv is a growing collection of quick, useful tools for everyday work and life — no sign-up, no clutter.',
              ctaLabel: 'Explore KaamSolv',
              href: '#categories',
            }}
          />
        </aside>

        {/* ---------- POPULAR ---------- */}
        <section aria-labelledby="popular-title" className="kk-container py-14 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="popular-title" className="font-display text-2xl font-bold text-ink sm:text-3xl">
                Popular tools
              </h2>
              <p className="mt-1 text-muted">KaamSolv is new — these are the first tools rolling out.</p>
            </div>
            <a
              href="/tools"
              className="inline-flex items-center gap-1 rounded text-sm font-semibold text-coral-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              All tools <Icon name="arrow-right" className="h-4 w-4" />
            </a>
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {POPULAR_TOOLS.map((tool) => (
              <li key={tool.slug}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- CATEGORIES ---------- */}
        <section
          id="categories"
          aria-labelledby="categories-title"
          className="kk-container scroll-mt-20 border-t border-hair pt-16 sm:pt-20"
        >
          <h2 id="categories-title" className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Browse by category
          </h2>
          <p className="mt-1 max-w-2xl text-muted">
            Ten groups, one job each — from money and work to documents, images and everyday maths.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CATEGORIES.map((cat) => {
              const a = ACCENT[cat.accent];
              return (
                <li key={cat.slug}>
                  <a
                    href={`/tools#${cat.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl2 border border-hair bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <span className={`h-1 ${a.bar}`} aria-hidden="true" />
                    <span className="flex flex-1 flex-col p-5">
                      <span className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${a.tint} ${a.fg}`}>
                        <Icon name={cat.icon} className="h-5 w-5" />
                      </span>
                      <span className="font-display font-bold text-ink">{cat.name}</span>
                      <span className="mt-1 text-sm text-muted">{cat.blurb}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- BRAND + THREE STEPS + TRUST ---------- */}
        <section aria-labelledby="brand-title" className="kk-container py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-16">
            <div>
              <h2
                id="brand-title"
                className="font-display text-2xl font-bold leading-snug text-ink sm:text-3xl"
              >
                Small problem? There&apos;s probably a tool for it.
              </h2>
              <p className="mt-4 max-w-md text-muted">
                No complicated software. No learning curve. Find the tool, do the thing, move on.
              </p>
              <p className="font-hand mt-4 text-2xl text-teal-500">Chalo, sorted.</p>
            </div>

            <ol className="grid gap-6 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.n}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-900 font-display text-sm font-bold text-white">
                      {step.n}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="hidden h-px flex-1 bg-hair sm:block" aria-hidden="true" />
                    )}
                  </div>
                  <p className="mt-3 font-display font-bold text-ink">{step.t}</p>
                  <p className="mt-1 text-sm text-muted">{step.d}</p>
                </li>
              ))}
            </ol>
          </div>

          <ul className="mt-14 grid gap-x-6 gap-y-8 border-t border-hair pt-10 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((item) => (
              <li key={item.t} className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-wash text-strong">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-sm font-bold text-ink">{item.t}</p>
                  <p className="mt-0.5 text-sm text-muted">{item.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- CLOSING ---------- */}
        <section aria-labelledby="closing-title" className="bg-coral-500">
          <div className="kk-container flex flex-col items-center gap-5 py-16 text-center sm:py-20">
            <h2
              id="closing-title"
              className="max-w-2xl font-display text-2xl font-extrabold text-navy-900 sm:text-4xl"
            >
              Got another small problem?
            </h2>
            <p className="max-w-md text-navy-900/80">
              There&apos;s a good chance we&apos;ve got a tool for it — and if we don&apos;t, tell us.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="/tools"
                className="inline-flex h-12 items-center rounded-full bg-navy-900 px-7 text-sm font-semibold text-white transition-colors hover:bg-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900 focus-visible:ring-offset-2 focus-visible:ring-offset-coral-500"
              >
                Explore all tools
              </a>
              <a
                href="/contact#suggest"
                className="inline-flex h-12 items-center rounded-full border border-navy-900/25 px-7 text-sm font-semibold text-navy-900 transition-colors hover:bg-navy-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900 focus-visible:ring-offset-2 focus-visible:ring-offset-coral-500"
              >
                Suggest a tool
              </a>
            </div>
          </div>
        </section>
        {/* Structured data — Next's recommended pattern; `<` escaped per its XSS note. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
        />
      </main>

      <SiteFooter />
    </>
  );
}
