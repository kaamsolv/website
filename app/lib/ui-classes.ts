/**
 * Shared button and field classes. They used to live in account-shell.tsx, which 50+ files import, so
 * that module still re-exports them: nothing needs to change at those call sites.
 */
export const BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed '+
  'disabled:border disabled:border-hair disabled:bg-chip disabled:text-muted disabled:hover:bg-chip disabled:hover:text-muted';
export const PRIMARY = `${BTN} bg-coral-500 text-navy-900 hover:bg-coral-600 hover:text-white`;
export const SECONDARY = `${BTN} border border-hair bg-surface text-strong hover:bg-wash`;
export const INPUT =
  'h-12 w-full rounded-lg border border-hair bg-fieldbg px-3 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/**
 * Card variants. One shell (rounded-xl2, hairline border), three weights, so a page can say how much a block matters:
 *   CARD       the everyday container (a form section, a list, a result).
 *   CARD_QUIET a row of supporting information: no surface fill, so it recedes (notes, "free stays free" strips).
 *   CARD_FEATURE the one block a page wants you to look at: a little more padding and a soft lift. Use once per view.
 */
export const CARD = 'rounded-xl2 border border-hair bg-surface p-5 sm:p-6';
export const CARD_QUIET = 'rounded-xl2 border border-hair bg-transparent p-4 sm:p-5';
export const CARD_FEATURE = 'rounded-xl2 border border-hair bg-surface p-6 shadow-soft sm:p-7';
