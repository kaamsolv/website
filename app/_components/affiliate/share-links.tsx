'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from '@/app/_components/copy-button';
import { portalLabel } from '@/app/lib/affiliate/merchant';

/**
 * The two addresses a merchant shares: the programme page, and the page where people apply. Each has a copy button.
 * The copied text uses the address you are on (so it is the real site in production), the text shown is the public form.
 */
export function ShareLinks({ slug, className = '' }: { slug: string; className?: string }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const rows = [
    { id: 'portal', label: 'Programme page', shown: portalLabel(slug), url: `${origin}/affiliate/${slug}`, hint: 'Your logo, colour and terms.' },
    { id: 'apply', label: 'Application link', shown: `${portalLabel(slug)}/register`, url: `${origin}/affiliate/${slug}/register`, hint: 'Goes straight to the form. Needs registration to be open.' },
  ];
  return (
    <ul className={`space-y-3 ${className}`} aria-label="Links to share" data-testid="share-links">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">{r.label}</p>
            <p className="break-all text-sm text-muted">{r.shown}</p>
          </div>
          <CopyButton value={r.url} label="Copy link" copiedLabel="Copied" className={origin ? '' : 'pointer-events-none opacity-60'} />
        </li>
      ))}
    </ul>
  );
}
