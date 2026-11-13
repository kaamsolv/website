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

import { AdGate } from './AdGate';

/** Every slot is hidden for paid accounts: see AdGate. */
export default function AdSlot(props: AdSlotProps) {
  if (props.enabled === false) return null;
  return (
    <AdGate>
      <AdSlotUnit {...props} />
    </AdGate>
  );
}

function AdSlotUnit({
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

  // House promo: a quiet, clearly labelled strip, not a billboard. It sits on the wash surface with a hairline, one line of
  // text and a text-style action, so it never outweighs the tool, the empty state or the page's own coral button.
  // (The IAB `height` above only matters once a real ad fills this slot.)
  return (
    <div data-ad-slot={slotId} className={`w-full ${className}`}>
      <a
        href={houseAd.href}
        className="group flex flex-col gap-2 rounded-xl2 border border-hair bg-wash px-4 py-3.5 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:flex-row sm:items-center sm:gap-5 sm:px-5"
      >
        <span className="shrink-0 self-start rounded-full border border-hair bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted sm:self-center">
          {disclosure}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold text-ink">{houseAd.title}</span>
          <span className="mt-0.5 block text-sm text-muted">{houseAd.body}</span>
        </span>
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-coralx-600 group-hover:underline">
          {houseAd.ctaLabel}
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </a>
    </div>
  );
}
