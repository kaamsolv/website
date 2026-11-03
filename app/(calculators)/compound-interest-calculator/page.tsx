import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { CompoundInterestCalculator } from '@/app/_components/calc/interest-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/compound-interest-calculator',
  'Compound interest calculator',
  'See how money grows when interest earns interest. Daily, monthly, quarterly, half-yearly or yearly compounding, with a year-by-year table. Free.',
);

const STEPS = [
  { t: 'Enter the amount and the rate', d: 'What you start with and the yearly interest rate.' },
  { t: 'Set the time and how often interest is added', d: 'Years and months, and daily, monthly, quarterly, half-yearly or yearly compounding.' },
  { t: 'Read the total', d: 'The interest earned, the total amount, and the balance at the end of each year.' },
];

const FAQ = [
  { q: 'What is the compound interest formula?', a: 'Total = principal × (1 + rate ÷ n) ^ (n × years), where n is how many times a year interest is added. The interest is the total minus the principal. For ₹1,00,000 at 10% for 3 years, added yearly: ₹1,00,000 × 1.1 × 1.1 × 1.1 = ₹1,33,100, so ₹33,100 of interest.' },
  { q: 'Does more frequent compounding earn more?', a: 'Yes, a little, because interest starts earning interest sooner. ₹1,00,000 at 8% for 10 years becomes ₹2,15,892.50 with yearly compounding and ₹2,21,964.02 with monthly compounding.' },
  { q: 'What is the rule of 72?', a: 'A quick estimate of how long money takes to double: divide 72 by the yearly rate. At 8%, that is about 9 years. It is only an approximation; the calculator gives the exact figure.' },
  { q: 'How is it different from simple interest?', a: 'Simple interest is worked out only on the original amount. Compound interest is worked out on the growing balance, so over long periods it pulls well ahead. The simple interest calculator shows the other side.' },
  { q: 'Which frequency should I pick?', a: 'Use whatever your deposit or loan states. Bank FDs usually add interest quarterly, savings accounts often work monthly or quarterly, and yearly is the simplest to check by hand.' },
  { q: 'Does it include tax or inflation?', a: 'No. It shows the growth of the amount before tax and before the rising cost of living. Interest is generally taxable, so ask a tax adviser about your own case.' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser and nothing is sent or saved.' },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="compound-interest-calculator"
      h1="Compound interest calculator"
      intro="Watch interest earn interest. Pick how often it is added and see the year-by-year growth."
      steps={STEPS}
      faq={FAQ}
      related={['simple-interest-calculator', 'fd-calculator', 'sip-calculator', 'rd-calculator']}
    >
      <CompoundInterestCalculator />
    </ToolPageShell>
  );
}
