import type { Metadata } from 'next';
import AdSlot from '@/app/components/AdSlot';
import { Icon } from '@/app/_components/icons';
import { SiteHeader } from '@/app/_components/site-header';
import { ToolOpen } from '@/app/_components/tool-open';
import { SiteFooter } from '@/app/_components/site-footer';
import { Breadcrumb } from '@/app/_components/breadcrumb';
import { liveFirst, TOOLS } from '@/app/lib/catalogue';
import { ToolCard } from '@/app/_components/tool-card';
import { ShortenForm } from './_components/shorten-form';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';
const PATH = '/url-shortener';

export const metadata: Metadata = {
  title: 'Shorten a URL',
  description:
    'Turn a long URL into a short, shareable link with KaamSolv. Paste, shorten, copy — done. Free to use, no sign-up.',
  alternates: { canonical: PATH },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}${PATH}`,
    title: 'Shorten a URL · KaamSolv',
    description:
      'Turn a long URL into a short, shareable link. Paste, shorten, copy — done. Free, no sign-up.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shorten a URL · KaamSolv',
    description: 'Turn a long URL into a short, shareable link. Free, no sign-up.',
  },
};

const STEPS = [
  { n: '1', t: 'Paste your link', d: 'Drop in any long http or https URL.' },
  { n: '2', t: 'Shorten it', d: 'One click. We give you a kaamsolv.com link straight away.' },
  { n: '3', t: 'Share it', d: 'Copy the short link and send it anywhere — chat, email, print.' },
];

const FAQ = [
  {
    q: 'Is it free?',
    a: 'Yes. Shortening a link is free and always will be. Some advanced features may need a free KaamSolv account later.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. You can shorten and copy a link without signing up. An account (coming soon) lets you save your links and see click stats.',
  },
  {
    q: 'How long does the link last?',
    a: 'As long as you like. By default a short link never expires, or you can set it to stop working after 1, 7 or 30 days. We may also disable a link if it points somewhere harmful or gets reported for abuse.',
  },
  {
    q: 'Can I choose the short link myself?',
    a: 'Custom links are on the way. For now KaamSolv picks a short, random code for you.',
  },
  {
    q: 'What kind of links can I shorten?',
    a: 'Any public http or https web address. We do not shorten links with a username or password in them, addresses that only work on a private network, links from other URL shorteners, or links flagged as harmful.',
  },
  {
    q: 'What if a short link looks harmful?',
    a: (
      <>
        <a
          href="/report-link"
          className="rounded font-semibold text-coral-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          Report it
        </a>{' '}
        and we&apos;ll take a look. Links that point somewhere harmful get switched off.
      </>
    ),
  },
];

const relatedTools = liveFirst(
  TOOLS.filter((t) => t.slug === 'qr-code-generator' || (t.category === 'Work' && t.slug !== 'url-shortener')),
).slice(0, 3);

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}${PATH}#app`,
      name: 'KaamSolv URL Shortener',
      url: `${SITE_URL}${PATH}`,
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
        { '@type': 'ListItem', position: 2, name: 'Shorten a URL', item: `${SITE_URL}${PATH}` },
      ],
    },
  ],
};

export default function UrlShortenerPage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <ToolOpen slug="url-shortener" type="generator" />

      <main id="main">
        {/* ---------- TOOL ---------- */}
        <section aria-labelledby="tool-title" className="border-b border-hair">
          <div className="kk-container py-10 sm:py-14">
            <Breadcrumb
              items={[
                { label: 'Home', href: '/' },
                { label: 'Shorten a URL' },
              ]}
            />

            <div className="mt-6 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-coralx-100 px-2.5 py-1 text-xs font-semibold text-coralx-600">
                <Icon name="link" className="h-3.5 w-3.5" />
                Work · Free tool
              </span>
              <h1
                id="tool-title"
                className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
              >
                Shorten a URL
              </h1>
              <p className="mt-3 text-pretty text-lg text-muted">
                Turn a long link into a short one you can share anywhere. No sign-up, no clutter.
              </p>
            </div>

            <div className="mt-8 max-w-2xl rounded-xl2 border border-hair bg-surface p-5 shadow-soft sm:p-8">
              <ShortenForm />
            </div>
          </div>
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section aria-labelledby="how-title" className="kk-container py-12 sm:py-16">
          <h2 id="how-title" className="font-display text-2xl font-bold text-ink">
            Three steps. That&apos;s it.
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
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
        </section>

        {/* ---------- FAQ ---------- */}
        <section
          aria-labelledby="faq-title"
          className="kk-container border-t border-hair py-12 sm:py-16"
        >
          <h2 id="faq-title" className="font-display text-2xl font-bold text-ink">
            Questions
          </h2>
          <div className="mt-6 max-w-2xl divide-y divide-hair border-y border-hair">
            {FAQ.map((item) => (
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

        {/* ---------- PROMO ---------- */}
        <aside aria-label="Promotion" className="kk-container pb-2">
          <AdSlot
            slotId="url-shortener-promo"
            size="billboard"
            mode="house"
            enabled
            label="From KaamSolv"
            houseAd={{
              eyebrow: 'Small problems. Solved.',
              title: 'One small tool at a time.',
              body: 'KaamSolv is a growing toolbox for everyday work and life. The URL Shortener is the first — more are on the way.',
              ctaLabel: 'See what else is coming',
              href: '/',
            }}
          />
        </aside>

        {/* ---------- RELATED ---------- */}
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
            {relatedTools.map((tool) => (
              <li key={tool.slug}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
