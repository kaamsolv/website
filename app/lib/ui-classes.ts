/**
 * Shared button and field classes. They used to live in account-shell.tsx, which 50+ files import, so
 * that module still re-exports them: nothing needs to change at those call sites.
 */
export const BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60';
export const PRIMARY = `${BTN} bg-coral-500 text-navy-900 hover:bg-coral-600 hover:text-white`;
export const SECONDARY = `${BTN} border border-hair bg-surface text-strong hover:bg-wash`;
export const INPUT =
  'h-12 w-full rounded-lg border border-hair bg-fieldbg px-3 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
