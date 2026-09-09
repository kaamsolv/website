/**
 * AdSlot — reserved advertising space.
 *
 * WHAT THIS IS TODAY
 * A fixed-size placeholder that reserves layout space (so a real ad loading
 * later doesn't shift the page — Cumulative Layout Shift) and renders a
 * clearly-labelled KaamKit "house ad" by default. No third-party script is
 * loaded by this component.
 *
 * WHAT THIS BECOMES, once Google Ad Manager / AdSense is actually approved:
 *   1. Add an ads.txt file at the domain root — Google requires this before
 *      it will serve anything.
 *   2. Add a consent step before any personalised ad request. Relevant for
 *      EU visitors (GDPR) and, since KaamKit is India-based, under India's
 *      DPDP Act too.
 *   3. Replace the no-op `requestGoogleAd()` below with a real call to
 *      Google Publisher Tag (`googletag.cmd.push(...)`), scoped to `slotId`.
 *   4. Pass `mode="auto"` on slots that should try to fill with Google first
 *      and fall back to the house ad if no line item is returned.
 *
 * SIZES map to standard IAB ad units, so whichever size a real network ends
 * up filling, we've already reserved space for it — the "keep provision for
 * the most paying ones" direction from the product brief.
 */

const SIZES = {
  leaderboard: { width: 728, height: 90 },
  'large-rectangle': { width: 336, height: 280 },
  rectangle: { width: 300, height: 250 },
  'mobile-banner': { width: 320, height: 50 },
} as const;

export type AdSlotSize = keyof typeof SIZES;

type HouseAd = {
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
};

type AdSlotProps = {
  slotId: string;
  size: AdSlotSize;
  mode?: 'house' | 'auto';
  houseAd: HouseAd;
  className?: string;
};

function requestGoogleAd(_slotId: string): boolean {
  // Intentionally a no-op until there's an approved Ad Manager/AdSense
  // account, ads.txt, and consent flow in place. See file header.
  return false;
}

export default function AdSlot({
  slotId,
  size,
  mode = 'house',
  houseAd,
  className = '',
}: AdSlotProps) {
  const { width, height } = SIZES[size];
  const filledByGoogle = mode === 'auto' && requestGoogleAd(slotId);

  return (
    <div
      data-ad-slot={slotId}
      className={`mx-auto flex w-full items-center justify-center ${className}`}
      style={{ maxWidth: width, minHeight: height }}
    >
      {filledByGoogle ? (
        <div id={`gpt-${slotId}`} style={{ width, height }} />
      ) : (
        <a
          href={houseAd.href}
          className="group flex w-full items-center gap-4 rounded-xl2 border border-hair bg-surface px-5 py-4 hover:shadow-soft transition-shadow"
          style={{ minHeight: height }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-1">
              {houseAd.eyebrow || 'From KaamKit'}
            </p>
            <p className="font-display font-700 text-ink text-sm">{houseAd.title}</p>
            <p className="text-xs text-muted mt-0.5">{houseAd.body}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-coral-600 group-hover:underline">
            {houseAd.ctaLabel} →
          </span>
        </a>
      )}
    </div>
  );
}
