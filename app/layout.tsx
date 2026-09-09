import type { Metadata } from 'next';
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
// sticky-note style callouts. Not part of the locked colour tokens, but
// flagged as a new addition: confirm before it spreads beyond the homepage.
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-caveat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KaamKit — Small tools. Less kaam.',
  description:
    'KaamKit is a growing collection of simple tools for the little things that get in the way of getting things done. Find the tool, do the thing, move on.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} ${caveat.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
