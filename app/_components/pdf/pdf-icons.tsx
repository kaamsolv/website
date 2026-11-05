import type { SVGProps } from 'react';
import type { PdfIconName } from '@/app/lib/pdf/tools';

/**
 * Task icons for the PDF directory. Same language as `app/_components/icons.tsx` (24px grid, 2px round
 * outline, `currentColor`) but one glyph per job, so a card says what it does before you read it.
 * Plain inline SVG: a server component, no client JavaScript.
 */

const PAGE = <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />;
const FOLD = <path d="M14 3v5h5" />;

const PATHS: Record<PdfIconName, React.ReactNode> = {
  merge: (
    <>
      <rect x="3" y="3.5" width="8" height="7" rx="1.5" />
      <rect x="3" y="13.5" width="8" height="7" rx="1.5" />
      <path d="M14 12h7M17.5 8.5 21 12l-3.5 3.5" />
    </>
  ),
  split: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 12h16" strokeDasharray="2.5 2.5" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V9h-4.5" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="m6.5 7 .9 13h9.2l.9-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  rearrange: (
    <>
      <path d="M7.5 4 3.5 8l4 4" />
      <path d="M3.5 8h13" />
      <path d="m16.5 20 4-4-4-4" />
      <path d="M20.5 16h-13" />
    </>
  ),
  compress: <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />,
  'to-jpg': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  'to-png': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M3 10h6M15 20v-6M15 14h6" />
    </>
  ),
  'jpg-to-pdf': (
    <>
      {PAGE}
      {FOLD}
      <circle cx="10" cy="13" r="1.2" />
      <path d="m8 18 3-3 2 2 2-2 2 2" />
    </>
  ),
  'to-word': (
    <>
      {PAGE}
      {FOLD}
      <path d="m8.5 12 1.2 5 1.8-4 1.8 4 1.2-5" />
    </>
  ),
  'to-text': (
    <>
      {PAGE}
      {FOLD}
      <path d="M8.5 12h7M8.5 15h7M8.5 18h4" />
    </>
  ),
  protect: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  watermark: <path d="M12 3s6 6.3 6 10.5A6 6 0 0 1 6 13.5C6 9.3 12 3 12 3z" />,
  numbers: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
  'section-organize': (
    <>
      <rect x="8" y="3.5" width="12" height="14" rx="2" />
      <path d="M5 7.5V19a2 2 0 0 0 2 2h10" />
    </>
  ),
  'section-optimize': <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />,
  'section-convert': <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" />,
  'section-secure': (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  'section-scan': <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M7 12h10" />,
};

export function PdfIcon({ name, className = 'h-5 w-5', ...rest }: { name: PdfIconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
      {PATHS[name]}
    </svg>
  );
}
