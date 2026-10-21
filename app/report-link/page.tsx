import type { Metadata } from 'next';
import { SiteHeader } from '@/app/_components/site-header';
import { SiteFooter } from '@/app/_components/site-footer';
import { Breadcrumb } from '@/app/_components/breadcrumb';
import { ReportForm } from './_components/report-form';

/**
 * Report a KaamSolv short link for abuse (URL Shortener 2b.2). Linked from the
 * shortener FAQ and from /link-unavailable. Not indexed: it's a utility page,
 * and an indexed report form mainly attracts spam.
 */

export const metadata: Metadata = {
  title: 'Report a link',
  description: 'Tell KaamSolv about a short link that leads somewhere harmful.',
  alternates: { canonical: '/report-link' },
  robots: { index: false, follow: false },
};

export default function ReportLinkPage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        <section aria-labelledby="report-title">
          <div className="kk-container py-10 sm:py-14">
            <Breadcrumb
              items={[
                { label: 'Home', href: '/' },
                { label: 'Shorten a URL', href: '/url-shortener' },
                { label: 'Report a link' },
              ]}
            />

            <div className="mt-6 max-w-2xl">
              <h1
                id="report-title"
                className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
              >
                Report a link
              </h1>
              <p className="mt-3 text-pretty text-lg text-muted">
                Found a KaamSolv short link that leads somewhere harmful? Tell us and we&apos;ll take a
                look.
              </p>
            </div>

            <div className="mt-8 max-w-2xl rounded-xl2 border border-hair bg-surface p-5 shadow-soft sm:p-8">
              <ReportForm />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
