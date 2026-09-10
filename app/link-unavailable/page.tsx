import type { Metadata } from 'next';
import { Icon } from '@/app/_components/icons';

/**
 * Where the redirect route sends someone when a short link exists but can no
 * longer be followed — disabled by KaamKit, or past its expiry. A genuinely
 * different state from "never existed" (that is a plain 404).
 */

export const metadata: Metadata = {
  title: 'Link unavailable',
  description: 'This KaamKit short link is no longer active.',
  robots: { index: false, follow: false },
};

const COPY: Record<string, { heading: string; body: string }> = {
  disabled: {
    heading: 'This link has been turned off.',
    body: 'KaamKit disabled this short link. That usually means it was reported, or it pointed somewhere unsafe.',
  },
  expired: {
    heading: 'This link has expired.',
    body: 'The person who made this short link set it to stop working after a while, and that time has passed.',
  },
  default: {
    heading: 'This link is no longer available.',
    body: "The short link you followed isn't active any more.",
  },
};

export default async function LinkUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const copy = COPY[reason ?? 'default'] ?? COPY.default;

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-yellowx-100 text-yellowx-600">
          <Icon name="alert-triangle" className="h-7 w-7" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-extrabold text-ink">{copy.heading}</h1>
        <p className="mt-3 text-muted">{copy.body}</p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/url-shortener"
            className="inline-flex h-11 items-center rounded-full bg-coral-500 px-6 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Shorten a link
          </a>
          <a
            href="/report-link"
            className="inline-flex h-11 items-center rounded-full border border-ink px-6 text-sm font-semibold text-ink transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Report a problem
          </a>
        </div>
      </div>
    </main>
  );
}
