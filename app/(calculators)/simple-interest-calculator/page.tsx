import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { SimpleInterestCalculator } from '@/app/_components/calc/interest-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/simple-interest-calculator',
  'Simple interest calculator: P × R × T',
  'Calculate simple interest and the total amount for any principal, rate and time in years, months and days. The formula is shown, with examples. Free.',
);

const STEPS = [
  { t: 'Enter the amount and the rate', d: 'The principal and the yearly interest rate, for example ₹50,000 at 6%.' },
  { t: 'Add the time', d: 'Years, months and days in any mix. Months count as a twelfth of a year and days as 1/365.' },
  { t: 'Read the interest', d: 'The interest, the total amount, and how much of it is interest.' },
];

const FAQ = [
  { q: 'What is the simple interest formula?', a: 'Interest = principal × rate × time ÷ 100, with the rate per year and the time in years. For ₹50,000 at 6% for 3 years, the interest is 50,000 × 6 × 3 ÷ 100 = ₹9,000, and the total is ₹59,000.' },
  { q: 'How do I calculate it for months or days?', a: 'Turn the time into years first: 8 months is 8 ÷ 12 of a year, and 73 days is 73 ÷ 365. For ₹25,000 at 9% for 8 months, the interest is ₹1,500. This calculator does the conversion for you.' },
  { q: 'What is the difference between simple and compound interest?', a: 'Simple interest is only ever worked out on the original amount, so it grows in a straight line. Compound interest is worked out on the amount plus the interest already earned. On ₹1,00,000 at 10% for 3 years, simple interest is ₹30,000 and compound interest (added yearly) is ₹33,100.' },
  { q: 'Where is simple interest used?', a: 'Often in short-term lending and some personal arrangements, and for quick checks. Most bank deposits and loans use compounding instead, so use the FD, RD or EMI calculator for those.' },
  { q: 'Can I find the rate or the time instead?', a: 'Not yet. This calculator works out the interest and the total. You can rearrange the formula: rate = interest × 100 ÷ (principal × time).' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser and nothing is sent or saved. A share link only contains the numbers you typed.' },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="simple-interest-calculator"
      h1="Simple interest calculator"
      intro="Principal, rate and time in, interest and total out. The formula is right there."
      steps={STEPS}
      faq={FAQ}
      related={['compound-interest-calculator', 'fd-calculator', 'emi-calculator', 'percentage-calculator']}
    >
      <SimpleInterestCalculator />
    </ToolPageShell>
  );
}
