/**
 * AdSlot — the single advertising / promotion surface for KaamSolv.
 *
 * WHAT THIS IS TODAY
 * A reusable slot that reserves layout space (so a real ad loading later doesn't
 * shift the page — Cumulative Layout Shift) and, by default, renders a clearly
 * labelled KaamSolv **house promo**. No third-party script is loaded here.
 *
 * WHAT THIS BECOMES, once Google Ad Manager / AdSense is actually approved:
 *   1. Add an ads.txt file at the domain root — Google requires this first.
 *   2. Add a consent step before any personalised ad request (GDPR + India's
 *      DPDP Act, since KaamSolv is India-based).
 *   3. Replace the no-op `requestGoogleAd()` with a real Google Publisher Tag
 *      call (`googletag.cmd.push(...)`), scoped to `slotId`.
 *   4. Pass `mode="auto"` on slots that should try Google first and fall back to
 *      the house promo if nothing fills.
 *
 * The public API (`slotId`, `size`, `mode`, `houseAd`, `enabled`, `label`) is
 * stable, so the same `<AdSlot>` can sit on the homepage, category pages and
 * (outside the task flow) tool pages without a redesign. Never place it inside a
 * tool's core interaction — upload → convert → download stays uninterrupted.
 */

/** Reserved box for a real ad, mapped to standard IAB units. */
const SIZES = {
  leaderboard: { width: 728, height: 90 },
  billboard: { width: 970, height: 250 },
  'large-rectangle': { width: 336, height: 280 },
  rectangle: { width: 300, height: 250 },
  'mobile-banner': { width: 320, height: 100 },
} as const;

export type AdSlotSize = keyof typeof SIZES;

type HouseAd = {
  /** Short hand-lettered line above the title, e.g. "Small problems. Solved." */
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
  /** Global off switch — renders nothing. Lets advertising be disabled site-wide. */
  enabled?: boolean;
  /** Disclosure label on the unit. Defaults to "From KaamSolv" / "Advertisement". */
  label?: string;
  className?: string;
};

function requestGoogleAd(_slotId: string): boolean {
  // No-op until an approved Ad Manager/AdSense account, ads.txt and consent flow
  // are in place. See file header.
  return false;
}

export default function AdSlot({
  slotId,
  size,
  mode = 'house',
  houseAd,
  enabled = true,
  label,
  className = '',
}: AdSlotProps) {
  if (!enabled) return null;

  const { width, height } = SIZES[size];
  const filledByGoogle = mode === 'auto' && requestGoogleAd(slotId);
  const disclosure = label ?? (filledByGoogle ? 'Advertisement' : 'From KaamSolv');

  // Future external ad: reserve the exact IAB box, labelled, centred.
  if (filledByGoogle) {
    return (
      <div data-ad-slot={slotId} className={`mx-auto w-full ${className}`} style={{ maxWidth: width }}>
        <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
          {disclosure}
        </p>
        <div id={`gpt-${slotId}`} className="mx-auto" style={{ width, height }} />
      </div>
    );
  }

  // House promo — a self-contained, clearly-labelled unit. It uses navy (a
  // constant brand hue) in both themes, so it always reads as a *placed unit*
  // rather than page content. Its own `min-h-32` is the reserved space; the IAB
  // `height` above only matters once a real ad fills this slot.
  return (
    <div data-ad-slot={slotId} className={`w-full ${className}`}>
      <a
        href={houseAd.href}
        className="group relative flex flex-col gap-5 overflow-hidden rounded-xl2 border border-white/10 bg-gradient-to-br from-navy-900 to-navy-700 p-6 text-white shadow-soft transition-shadow hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:flex-row sm:items-center sm:gap-6 sm:p-7"
      >
        {/* soft brand glow — decorative only */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-coral-500/25 blur-3xl"
        />

        <div className="relative flex-1">
          <span className="inline-flex items-center rounded-full border border-white/25 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
            {disclosure}
          </span>
          {houseAd.eyebrow && (
            <p className="font-hand mt-3 text-xl text-yellow-500">{houseAd.eyebrow}</p>
          )}
          <p className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">{houseAd.title}</p>
          <p className="mt-1.5 max-w-xl text-sm text-white/75">{houseAd.body}</p>
        </div>

        <span className="relative inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-full bg-coral-500 px-5 text-sm font-semibold text-navy-900 transition-colors group-hover:bg-coral-600 group-hover:text-white sm:self-center">
          {houseAd.ctaLabel}
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </a>
    </div>
  );
}
