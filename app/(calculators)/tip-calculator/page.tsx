import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { TipSplitCalculator } from '@/app/_components/calc/everyday-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/tip-calculator', 'Tip calculator', 'Work out the tip, the total and each person’s share in rupees. Quick tip buttons, round-up per person. Free.');

const STEPS = [
  { t: 'Enter the bill', d: 'The amount on the bill.' },
  { t: 'Pick a tip', d: 'Tap 5%, 10%, 15% or type your own.' },
  { t: 'Split if sharing', d: 'Add people to see each share.' },
];

const FAQ = [
  { q: 'Should I tip on top of a service charge?', a: 'Many restaurants add a service charge to the bill. If yours has, you may not want to tip on top — it’s your choice.' },
  { q: 'Is the tip worked out before or after tax?', a: 'On whatever bill amount you enter. Enter the amount before taxes if you’d rather not tip on them.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="tip-calculator" h1="Tip calculator" intro="Work out the tip and the total — and split it if you’re sharing." steps={STEPS} faq={FAQ} related={['split-bill-calculator', 'percentage-calculator', 'discount-calculator']}>
      <TipSplitCalculator defaultTip={10} />
    </ToolPageShell>
  );
}
