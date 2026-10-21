import type { Accent } from '../lib/catalogue';

/* Literal class names (not interpolated) so Tailwind's build scanner keeps them. */
export const ACCENT: Record<Accent, { tint: string; fg: string; bar: string }> = {
  coral: { tint: 'bg-coralx-100', fg: 'text-coralx-600', bar: 'bg-coral-500' },
  yellow: { tint: 'bg-yellowx-100', fg: 'text-yellowx-600', bar: 'bg-yellow-500' },
  teal: { tint: 'bg-tealx-100', fg: 'text-tealx-600', bar: 'bg-teal-500' },
  purple: { tint: 'bg-purplex-100', fg: 'text-purplex-600', bar: 'bg-purple-500' },
  navy: { tint: 'bg-chip', fg: 'text-strong', bar: 'bg-navy-500' },
};
