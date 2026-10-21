import AdSlot from '@/app/components/AdSlot';
import { Icon } from '@/app/_components/icons';
import { SiteHeader } from '@/app/_components/site-header';
import { SiteFooter } from '@/app/_components/site-footer';
import { Breadcrumb } from '@/app/_components/breadcrumb';
import { CATEGORIES, type Accent } from '@/app/lib/catalogue';
import type { ConverterSlug } from '@/app/lib/image/types';
import { getImageTool, relatedImageTools } from '@/app/lib/image/tools';
import { ImageConverterWorkspace } from './image-converter-workspace';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';

const ACCENT: Record<Accent, { tint: string; fg: string; bar: string }> = {
  coral: { tint: 'bg-coralx-100', fg: 'text-coralx-600', bar: 'bg-coral-500' },
  yellow: { tint: 'bg-yellowx-100', fg: 'text-yellowx-600', bar: 'bg-yellow-500' },
  teal: { tint: 'bg-tealx-100', fg: 'text-tealx-600', bar: 'bg-teal-500' },
  purple: { tint: 'bg-purplex-100', fg: 'text-purplex-600', bar: 'bg-purple-500' },
  navy: { tint: 'bg-chip', fg: 'text-strong', bar: 'bg-navy-500' },
};

const STEPS = [
  { n: '1', t: 'Upload your image', d: 'Drop a file or browse — it stays on your device.' },
  { n: '2', t: 'Pick formats', d: 'Change input or output anytime. Open More options to resize or adjust quality.' },
  { n: '3', t: 'Download', d: 'Preview the result, then save it. Convert another anytime.' },
];

const FAQ = [
  {
    q: 'Is my image uploaded to KaamSolv?',
    a: 'No. Conversion runs entirely in your browser. Your file is not sent to our servers.',
  },
  {
    q: 'Can I change the output format?',
    a: 'Yes. Use the format selectors at the top — your uploaded image stays put.',
  },
  {
    q: 'What is the file size limit?',
    a: '25 MB per image. Larger files can be slow or fail depending on your device.',
  },
  {
    q: 'Why does PNG to JPG add a white background?',
    a: 'JPG does not support transparency. Transparent areas are filled with white before saving.',
  },
  {
    q: 'HEIC from my iPhone — will it work?',
    a: 'Yes. HEIC is decoded locally in your browser using heic2any (WASM). Nothing is uploaded.',
  },
];

type Props = {
  slug: ConverterSlug;
};

export function ImageToolPage({ slug }: Props) {
  const tool = getImageTool(slug)!;
  const cat = CATEGORIES.find((c) => c.name === 'Images & Files')!;
  const accent = ACCENT[cat.accent];
  const related = relatedImageTools(slug, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}${tool.path}#app`,
        name: `KaamSolv ${tool.name}`,
        url: `${SITE_URL}${tool.path}`,
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
          { '@type': 'ListItem', position: 2, name: tool.name, item: `${SITE_URL}${tool.path}` },
        ],
      },
    ],
  };

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader />

      <main id="main">
        <section aria-labelledby="tool-title" className="overflow-x-clip border-b border-hair">
          <div className="kk-container py-10 sm:py-14">
            <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: tool.name }]} />

            <div className="mt-6 max-w-2xl">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${accent.tint} ${accent.fg}`}
              >
                <Icon name="images" className="h-3.5 w-3.5" />
                Images &amp; Files · Free tool
              </span>
              <h1
                id="tool-title"
                className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
              >
                {tool.h1}
              </h1>
              <p className="mt-3 text-pretty text-lg text-muted">{tool.blurb}</p>
            </div>

            <noscript>
              <p className="mt-4 rounded-lg border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
                JavaScript is required to convert images. Please enable JavaScript in your browser.
              </p>
            </noscript>

            <div className="mt-8">
              <ImageConverterWorkspace tool={tool} />
            </div>
          </div>
        </section>

        <section aria-labelledby="how-title" className="kk-container py-12 sm:py-16">
          <h2 id="how-title" className="font-display text-2xl font-bold text-ink">How it works</h2>
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

        <section aria-labelledby="faq-title" className="kk-container border-t border-hair py-12 sm:py-16">
          <h2 id="faq-title" className="font-display text-2xl font-bold text-ink">Questions</h2>
          <div className="mt-6 max-w-2xl divide-y divide-hair border-y border-hair">
            {FAQ.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                  {item.q}
                  <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-90" />
                </summary>
                <p className="pb-4 text-sm text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <aside aria-label="Promotion" className="kk-container pb-2">
          <AdSlot
            slotId={`image-${tool.slug}-promo`}
            size="billboard"
            mode="house"
            enabled
            label="From KaamSolv"
            houseAd={{
              eyebrow: 'Small problems. Solved.',
              title: 'Your image stays on your device.',
              body: 'KaamSolv image tools process files locally in your browser. No upload, no waiting.',
              ctaLabel: 'See more image tools',
              href: '/',
            }}
          />
        </aside>

        <section aria-labelledby="related-title" className="kk-container py-12 sm:py-16">
          <h2 id="related-title" className="font-display text-2xl font-bold text-ink">Related tools</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((rel) => (
              <li key={rel.slug}>
                <a
                  href={rel.path}
                  className="group relative flex h-full flex-col overflow-hidden rounded-xl2 border border-hair bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <span className={`h-1 ${accent.bar}`} aria-hidden="true" />
                  <span className="flex flex-1 flex-col p-5">
                    <span className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${accent.tint} ${accent.fg}`}>
                      <Icon name="images" className="h-5 w-5" />
                    </span>
                    <span className="font-display font-bold text-ink">{rel.name}</span>
                    <span className="mt-1 text-sm text-muted">{rel.blurb}</span>
                  </span>
                </a>
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
