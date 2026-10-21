import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { TipSplitCalculator } from '@/app/_components/calc/everyday-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/split-bill-calculator', 'Split bill calculator', 'Split a bill between friends in seconds — with an optional tip and a rounded-up amount per person. In rupees, free.');

const STEPS = [
  { t: 'Enter the total', d: 'The full amount on the bill.' },
  { t: 'Add people', d: 'Tap + for everyone sharing.' },
  { t: 'Done', d: 'See each share — rounded up, if you like.' },
];

const FAQ = [
  { q: 'Why does it show a rounded-up amount?', a: 'Splits rarely come out to a whole rupee. Rounding each share up means the bill is always covered, with a few rupees to spare.' },
  { q: 'Can I add a tip?', a: 'Yes — choose a tip and it’s added before the bill is split.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="split-bill-calculator" h1="Split the bill" intro="Who owes what — with or without a tip." steps={STEPS} faq={FAQ} related={['tip-calculator', 'percentage-calculator', 'discount-calculator']}>
      <TipSplitCalculator defaultTip={0} />
    </ToolPageShell>
  );
}
