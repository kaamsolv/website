import type { Metadata } from 'next';
import AdSlot from '@/app/components/AdSlot';
import { Icon } from '@/app/_components/icons';
import { SiteHeader } from '@/app/_components/site-header';
import { SiteFooter } from '@/app/_components/site-footer';
import { Breadcrumb } from '@/app/_components/breadcrumb';
import { CATEGORIES, TOOLS, type Accent } from '@/app/lib/catalogue';
import { QrGenerator } from './_components/qr-generator';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';
const PATH = '/qr-code-generator';

export const metadata: Metadata = {
  title: 'Make a QR code',
  description:
    'Create a QR code for links, Wi-Fi, UPI payments, contacts, SMS, locations, events, social profiles, files, and more. Customise colours, download PNG or SVG — free, in your browser.',
  alternates: { canonical: PATH },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}${PATH}`,
    title: 'Make a QR code · KaamSolv',
    description:
      'Create a QR code for links, Wi-Fi, contacts and more. Customise, download PNG or SVG — free, no sign-up.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Make a QR code · KaamSolv',
    description:
      'Create a QR code for links, Wi-Fi, contacts and more. Free, in your browser.',
  },
};

const ACCENT: Record<Accent, { tint: string; fg: string; bar: string }> = {
  coral: { tint: 'bg-coralx-100', fg: 'text-coralx-600', bar: 'bg-coral-500' },
  yellow: { tint: 'bg-yellowx-100', fg: 'text-yellowx-600', bar: 'bg-yellow-500' },
  teal: { tint: 'bg-tealx-100', fg: 'text-tealx-600', bar: 'bg-teal-500' },
  purple: { tint: 'bg-purplex-100', fg: 'text-purplex-600', bar: 'bg-purple-500' },
  navy: { tint: 'bg-chip', fg: 'text-strong', bar: 'bg-navy-500' },
};

const STEPS = [
  { n: '1', t: 'Choose what to encode', d: 'Pick a type — website, Wi-Fi, contact, and the rest — then fill in the fields.' },
  { n: '2', t: 'Tweak if you want', d: 'Colours, size, error correction, or a small logo. Or skip it and use the defaults.' },
  { n: '3', t: 'Download and use it', d: 'Save a PNG or SVG. Test it on your phone before you print.' },
];

const TIPS = [
  {
    t: 'Test before you print',
    d: 'Scan the preview on your phone at the size you plan to use. A QR that looks fine on screen can fail on paper if it’s too small or low-contrast.',
  },
  {
    t: 'Wi-Fi codes carry the password',
    d: 'Anyone who scans a Wi-Fi QR can see the network credentials. Only share it with people you trust.',
  },
  {
    t: 'Logos need headroom',
    d: 'A logo covers part of the code. KaamSolv switches to High error correction automatically so scanners still have enough data to read.',
  },
  {
    t: 'Style it, then test it',
    d: 'Presets and frames are for looks — the QR still encodes exactly what you entered. Scan the preview before you print, especially with dots or a transparent background.',
  },
  {
    t: 'UPI codes are not receipts',
    d: 'A UPI QR opens your payment app with the details filled in. KaamSolv doesn’t process payments or confirm that money was sent.',
  },
];

const FAQ = [
  {
    q: 'Is it free?',
    a: 'Yes. Create and download QR codes without an account. Nothing to install.',
  },
  {
    q: 'Do you shorten my links?',
    a: 'No. A website QR encodes the exact URL you enter. We don’t turn it into a tracking link in this tool.',
  },
  {
    q: 'Does my data leave my device?',
    a: 'The QR is built in your browser. Your text, Wi-Fi password, UPI ID, and contact details are not sent to KaamSolv or any third-party QR service.',
  },
  {
    q: 'Can I link to a PDF?',
    a: 'Yes — use the PDF type and paste a public file URL. We don’t upload or host the file; the QR simply opens that link.',
  },
  {
    q: 'What’s error correction?',
    a: 'It’s how much redundancy is built into the QR. Higher levels survive dirt, damage, or a logo in the middle. Medium is fine for most uses; High is best with a logo.',
  },
  {
    q: 'Can I change the QR later?',
    a: 'A static QR always points at what you encoded. If the link or details change, make a new code. Editable “dynamic” QR codes are planned for later.',
  },
];

const relatedTools = TOOLS.filter(
  (t) => (t.category === 'Business' || t.slug === 'url-shortener') && t.slug !== 'qr-code-generator',
).slice(0, 3);

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}${PATH}#app`,
      name: 'KaamSolv QR Code Generator',
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
        { '@type': 'ListItem', position: 2, name: 'Make a QR code', item: `${SITE_URL}${PATH}` },
      ],
    },
  ],
};

export default function QrCodeGeneratorPage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        <section aria-labelledby="tool-title" className="overflow-x-clip border-b border-hair">
          <div className="kk-container py-10 sm:py-14">
            <Breadcrumb
              items={[
                { label: 'Home', href: '/' },
                { label: 'Make a QR code' },
              ]}
            />

            <div className="mt-6 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purplex-100 px-2.5 py-1 text-xs font-semibold text-purplex-600">
                <Icon name="business" className="h-3.5 w-3.5" />
                Business · Free tool
              </span>
              <h1
                id="tool-title"
                className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
              >
                Make a QR code
              </h1>
              <p className="mt-3 text-pretty text-lg text-muted">
                Links, Wi-Fi, contacts, and more — customise it, download it, done.
              </p>
            </div>

            <noscript>
              <p className="mt-4 rounded-lg border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
                JavaScript is required to generate QR codes. Please enable JavaScript in your browser.
              </p>
            </noscript>
            <div className="mt-8">
              <QrGenerator />
            </div>
          </div>
        </section>

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

        <section aria-labelledby="tips-title" className="kk-container border-t border-hair py-12 sm:py-16">
          <h2 id="tips-title" className="font-display text-2xl font-bold text-ink">
            Good to know
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {TIPS.map((tip) => (
              <li key={tip.t} className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="font-display text-sm font-bold text-ink">{tip.t}</p>
                <p className="mt-1.5 text-sm text-muted">{tip.d}</p>
              </li>
            ))}
          </ul>
        </section>

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

        <aside aria-label="Promotion" className="kk-container pb-2">
          <AdSlot
            slotId="qr-generator-promo"
            size="billboard"
            mode="house"
            enabled
            label="From KaamSolv"
            houseAd={{
              eyebrow: 'Small problems. Solved.',
              title: 'One small tool at a time.',
              body: 'KaamSolv is a growing toolbox for everyday work and life. More tools are on the way.',
              ctaLabel: 'See what else is coming',
              href: '/',
            }}
          />
        </aside>

        <section aria-labelledby="related-title" className="kk-container py-12 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="related-title" className="font-display text-2xl font-bold text-ink">
              Related tools
            </h2>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {relatedTools.map((tool) => {
              const cat = CATEGORIES.find((c) => c.name === tool.category)!;
              const a = ACCENT[cat.accent];
              return (
                <li key={tool.slug}>
                  <a
                    href={tool.url}
                    className="group relative flex h-full flex-col overflow-hidden rounded-xl2 border border-hair bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <span className={`h-1 ${a.bar}`} aria-hidden="true" />
                    <span className="flex flex-1 flex-col p-5">
                      <span className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${a.tint} ${a.fg}`}>
                        <Icon name={cat.icon} className="h-5 w-5" />
                      </span>
                      <span className="font-display font-bold text-ink">{tool.name}</span>
                      <span className="mt-1 text-sm text-muted">{tool.blurb}</span>
                    </span>
                    {tool.status === 'planned' && (
                      <span className="absolute right-4 top-4 rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-muted">
                        Soon
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
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
