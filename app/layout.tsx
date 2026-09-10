import type { Metadata, Viewport } from 'next';
import { Sora, Inter, Caveat } from 'next/font/google';
import './globals.css';

// Self-hosted at build time by next/font — no runtime request to
// fonts.googleapis.com, same as Tailwind no longer calling its CDN.
const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

// Handwritten accent — used sparingly for the "Work smart." flourish and
// sticky-note callouts. Flagged as a design-system addition in
// docs/DESIGN-SYSTEM.md: confirm before it spreads beyond marketing pages.
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-caveat',
  display: 'swap',
});

const SITE_URL = 'https://kaamkit.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'KaamKit — Small tools for everyday problems',
    template: '%s · KaamKit',
  },
  description:
    'KaamKit is a growing toolbox for small everyday problems. Calculate, convert, create and get on with your day. Free to use, nothing to install.',
  applicationName: 'KaamKit',
  keywords: ['online tools', 'calculators', 'converters', 'generators', 'free tools', 'KaamKit'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'KaamKit',
    title: 'KaamKit — Small tools for everyday problems',
    description:
      'A growing toolbox for small everyday problems. Calculate, convert, create and get on with your day.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KaamKit — Small tools for everyday problems',
    description:
      'A growing toolbox for small everyday problems. Calculate, convert, create and get on with your day.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1830' },
  ],
};

// Runs before first paint so a stored light/dark choice never flashes.
// "system" (the default) is left to the CSS prefers-color-scheme query.
const themeScript = `(function(){try{var t=localStorage.getItem('kaamkit-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sora.variable} ${inter.variable} ${caveat.variable}`}
    >
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
