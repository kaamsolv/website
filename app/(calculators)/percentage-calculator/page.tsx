import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { PercentageCalculator } from '@/app/_components/calc/everyday-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/percentage-calculator', 'Percentage calculator', 'Work out X% of Y, what percent one number is of another, and percentage increase or decrease. Free and instant.');

const STEPS = [
  { t: 'Pick a question', d: 'X% of Y, what percent, or how much it changed.' },
  { t: 'Enter two numbers', d: 'The answer appears as you type.' },
  { t: 'Copy', d: 'Copy the answer and get on with it.' },
];

const FAQ = [
  { q: 'How do I work out a percentage of a number?', a: 'Divide the percentage by 100 and multiply by the number. 18% of 2,500 is 0.18 × 2,500 = 450.' },
  { q: 'How is percentage change worked out?', a: 'Take the difference, divide by the starting number and multiply by 100. From 80 to 100 is (100 − 80) ÷ 80 × 100 = 25% up.' },
  { q: 'Why can’t I get a percentage change from 0?', a: 'Any change from zero is an infinite percentage, so there’s no meaningful number to show.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="percentage-calculator" h1="Percentage calculator" intro="Percentages, increases and decreases — without the second-guessing." steps={STEPS} faq={FAQ} related={['discount-calculator', 'tip-calculator', 'gst-calculator']}>
      <PercentageCalculator />
    </ToolPageShell>
  );
}
