import type { Metadata } from 'next';

// Internal design reference, not a public page. page.tsx is a client component,
// so the robots directive lives here.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
