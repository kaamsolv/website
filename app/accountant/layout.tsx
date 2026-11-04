import type { Metadata } from 'next';

/** Everything under /accountant is private to the people it was sent to: never indexed, no referrer. */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' };

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
