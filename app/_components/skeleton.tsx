/**
 * The one loading placeholder: a block the shape of what is coming, in the card shell's own radius and hairline, so
 * nothing jumps when the content arrives. Hidden from assistive tech (the page says "loading" elsewhere, or not at all).
 * Pulsing stops for anyone who asked for reduced motion (see globals.css).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl2 border border-hair bg-wash ${className}`} />;
}
