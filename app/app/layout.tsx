import type { Metadata } from 'next';

/** Signed-in pages are private: never indexed. Each page checks the session itself. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
