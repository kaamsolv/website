/**
 * The one plan label for a product, used in the workspace menu and on the hub: Pro (you have the paid plan),
 * Free (you're on the free tier), Soon (no plan yet). Same words and look wherever a product appears.
 */
export type ProductChipState = 'pro' | 'free' | 'soon';

const LOOK: Record<ProductChipState, string> = {
  pro: 'bg-tealx-100 text-tealx-600',
  free: 'bg-chip text-strong',
  soon: 'border border-dashed border-hair text-muted',
};
const TEXT: Record<ProductChipState, string> = { pro: 'Pro', free: 'Free', soon: 'Soon' };

export function ProductChip({ state, className = '' }: { state: ProductChipState; className?: string }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LOOK[state]} ${className}`}>{TEXT[state]}</span>;
}
