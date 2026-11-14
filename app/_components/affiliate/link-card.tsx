'use client';

import { useEffect, useState } from 'react';
import { useInfo } from '@/app/_components/calc/info-tip';
import { CopyButton } from '@/app/_components/copy-button';
import { WHATSAPP_BUTTON_COMPACT } from '@/app/_components/whatsapp-style';
import { CLICKS_NOTE, linkLabel, linkPath } from '@/app/lib/affiliate/link';
import type { MyLink } from '@/db/affiliate-links';

const n = (v: number) => v.toLocaleString('en-IN');

/**
 * An approved affiliate's referral link, with the clicks recorded on it (inside a programme card on Joined).
 * The copied address uses the origin you are on, so it is the real site in production.
 */
export function LinkCard({ link, businessName }: { link: MyLink; businessName: string }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const info = useInfo(CLICKS_NOTE);
  const url = `${origin}${linkPath(link.slug, link.code)}`;
  const share = `https://wa.me/?text=${encodeURIComponent(`${businessName}: ${url}`)}`;
  const stats: { key: string; label: string; value: number }[] = [
    { key: '7', label: 'Last 7 days', value: link.clicks.days7 },
    { key: '30', label: 'Last 30 days', value: link.clicks.days30 },
    { key: 'all', label: 'All time', value: link.clicks.all },
  ];

  return (
    <div className="mt-3 rounded-xl border border-hair bg-wash p-3 sm:p-4" data-testid="link-card">
      <p className="text-sm font-bold text-ink">Your link</p>
      <p className="mt-1 break-all text-sm font-semibold text-strong" data-testid="link-address">
        {linkLabel(link.slug, link.code)}
      </p>

      {link.paused ? (
        <p className="mt-2 text-sm text-strong" data-testid="link-paused">
          {businessName} has paused your place, so clicks aren’t being recorded. Your link still opens their store.
        </p>
      ) : (
        <>
          {!link.hasDestination && (
            <p className="mt-2 text-sm text-strong" data-testid="link-no-destination">
              {businessName} hasn’t added their store address yet, so your link opens their programme page for now.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CopyButton value={url} label="Copy link" copiedLabel="Copied" className={origin ? '' : 'pointer-events-none opacity-60'} />
            <a href={origin ? share : undefined} target="_blank" rel="noopener noreferrer" className={`${WHATSAPP_BUTTON_COMPACT} ${origin ? '' : 'pointer-events-none opacity-60'}`} data-testid="link-whatsapp">
              Share on WhatsApp
            </a>
          </div>
        </>
      )}

      <div className="mt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span>Recorded clicks</span>
          {info.button}
        </div>
        {info.note}
        <dl className="mt-2 grid grid-cols-3 gap-2" data-testid="link-clicks">
          {stats.map((s) => (
            <div key={s.key} className="min-w-0 rounded-lg border border-hair bg-surface px-2 py-2 text-center">
              <dd className="text-lg font-bold tabular-nums text-ink" data-testid={`link-clicks-${s.key}`}>
                {n(s.value)}
              </dd>
              <dt className="text-xs leading-tight text-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
        {link.clicks.all === 0 && !link.paused && <p className="mt-2 text-sm text-muted">No clicks recorded yet. Share your link and they’ll show up here.</p>}
      </div>
    </div>
  );
}
