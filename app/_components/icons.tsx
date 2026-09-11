/**
 * One small, consistent outline-icon set — 1.5–2px stroke, 24px grid,
 * `currentColor`. Plain inline SVG so it stays a server component and
 * matches the icon language in the Phase 1 design system.
 */

import type { SVGProps } from 'react';
import type { IconKey } from '../lib/catalogue';

type IconName =
  | IconKey
  | 'search'
  | 'arrow-right'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'menu'
  | 'close'
  | 'bolt'
  | 'clock'
  | 'heart'
  | 'smile'
  | 'sparkle'
  | 'lock'
  | 'toolbox'
  | 'link'
  | 'copy'
  | 'check'
  | 'chevron-right'
  | 'alert-triangle'
  | 'download'
  | 'share'
  | 'upload';

const PATHS: Record<IconName, React.ReactNode> = {
  money: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1.5 1.2-2.5 2.5-2.5s2.5.8 2.5 2c0 3-5 2-5 5 0 1.2 1.2 2 2.5 2s2.5-1 2.5-2.5" />
    </>
  ),
  work: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
  business: <path d="M4 20V10M10 20V4M16 20v-7M20 20H4" />,
  documents: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  images: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M3 17l5-5 4 4 3-3 6 6" />
    </>
  ),
  writing: (
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </>
  ),
  career: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </>
  ),
  everyday: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  india: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M3 14h18" />
    </>
  ),
  creators: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8 7l1.5-2h5L16 7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.5A8.5 8.5 0 1 1 11.5 3 7 7 0 0 0 21 12.5z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="1" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  bolt: <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  heart: <path d="M12 20s-7-4.3-9.5-8.5C1 8 2.5 5 6 5c2 0 3.3 1.1 4 2 .7-.9 2-2 4-2 3.5 0 5 3 3.5 6.5C19 15.7 12 20 12 20z" />,
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </>
  ),
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  toolbox: (
    <>
      <rect x="2.5" y="9" width="19" height="11" rx="1.5" />
      <path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M2.5 13.5h19" />
      <path d="M11 12.5h2v2h-2z" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'alert-triangle': (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4M12 17.5h.01" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 11l5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V9M7 13l5-5 5 5" />
      <path d="M5 21h14" />
    </>
  ),
};

export function Icon({
  name,
  className = 'h-5 w-5',
  ...rest
}: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
