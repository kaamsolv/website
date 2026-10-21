import { CATEGORIES } from '../lib/catalogue';

const FOOTER_LINK =
  'rounded text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Tools',
    links: [
      { label: 'All tools', href: '/tools' },
      { label: 'Shorten a link', href: '/url-shortener' },
      { label: 'Make a QR code', href: '/qr-code-generator' },
      { label: 'Convert images', href: '/tools#images-files' },
    ],
  },
  {
    heading: 'KaamSolv',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Suggest a tool', href: '/suggest-a-tool' },
      { label: 'Feedback', href: '/feedback' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Cookies', href: '/cookies' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-hair bg-surface">
      <div className="kk-container grid gap-x-8 gap-y-10 py-14 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2 lg:col-span-2">
          <a
            href="/"
            aria-label="KaamSolv home"
            className="rounded font-display text-lg font-extrabold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Kaam<span className="text-coral-500">Solv</span>
          </a>
          <p className="mt-1 text-sm text-muted">Small tools for everyday problems.</p>
          <p className="font-hand mt-3 text-lg text-coral-600">Work smart.</p>
        </div>

        <nav aria-label="Categories" className="text-sm">
          <p className="mb-3 font-semibold text-ink">Categories</p>
          <ul className="space-y-2">
            {CATEGORIES.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <a href={`/tools#${c.slug}`} className={FOOTER_LINK}>
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="text-sm">
            <p className="mb-3 font-semibold text-ink">{col.heading}</p>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className={FOOTER_LINK}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-hair">
        <div className="kk-container flex flex-col items-center justify-between gap-2 py-4 text-xs text-muted sm:flex-row">
          <p suppressHydrationWarning>© {new Date().getFullYear()} KaamSolv. All rights reserved.</p>
          <p>Made in India.</p>
        </div>
      </div>
    </footer>
  );
}
