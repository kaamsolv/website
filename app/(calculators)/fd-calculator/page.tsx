import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { FdCalculator } from '@/app/_components/calc/interest-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/fd-calculator',
  'FD calculator: maturity amount and interest',
  'Find the maturity amount and interest on a fixed deposit, with monthly, quarterly, half-yearly or yearly compounding and a year-by-year table. Free.',
);

const STEPS = [
  { t: 'Enter the deposit and rate', d: 'The amount you will put in and the yearly interest rate your bank offers.' },
  { t: 'Set the period and compounding', d: 'Years and months, and how often interest is added. Quarterly is the usual bank default.' },
  { t: 'Read the maturity amount', d: 'The interest earned, the amount you get back, and how it grows year by year.' },
];

const FAQ = [
  { q: 'How is FD interest calculated?', a: 'Maturity = principal × (1 + rate ÷ n) ^ (n × years), where n is how many times a year interest is added. For ₹1,00,000 at 7% for one year with quarterly compounding, you get ₹1,07,185.90, so the interest is ₹7,185.90.' },
  { q: 'Which compounding should I choose?', a: 'Most Indian banks add interest quarterly on a cumulative FD, so that is the default here. Some use monthly or half-yearly. Your FD receipt or the bank’s website says which one applies to you.' },
  { q: 'How much will ₹5,00,000 become in 5 years?', a: 'At 7% with quarterly compounding it becomes about ₹7,07,389, which is ₹2,07,389 of interest. Change the rate to the one your bank is offering to see your own figure.' },
  { q: 'Is FD interest taxable?', a: 'Yes, interest is generally added to your income and taxed at your slab rate, and the bank may deduct tax at source above a limit that can change. This calculator does not work out tax. Check the current rules or ask a tax adviser.' },
  { q: 'Does it handle senior citizen or special rates?', a: 'You enter the rate yourself, so type the rate your bank offers you. KaamSolv doesn’t list bank rates, because they change often.' },
  { q: 'Why does my bank show a slightly different amount?', a: 'Banks may round at each step, count days instead of months, or treat part-periods differently. Expect a difference of a few rupees at most on a normal deposit.' },
  { q: 'What about withdrawing early?', a: 'Premature withdrawal usually lowers the rate and may carry a penalty. That varies by bank and is not calculated here.' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser and nothing is sent or saved.' },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="fd-calculator"
      h1="FD calculator"
      intro="Know what your fixed deposit will be worth on the day it matures."
      steps={STEPS}
      faq={FAQ}
      related={['rd-calculator', 'sip-calculator', 'compound-interest-calculator', 'simple-interest-calculator']}
    >
      <FdCalculator />
    </ToolPageShell>
  );
}
