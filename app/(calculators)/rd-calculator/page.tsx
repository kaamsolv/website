import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { RdCalculator } from '@/app/_components/calc/interest-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/rd-calculator',
  'RD calculator: recurring deposit maturity',
  'Work out what a monthly recurring deposit is worth when it matures, with quarterly compounding the way Indian banks do it. Year-by-year table. Free.',
);

const STEPS = [
  { t: 'Enter the monthly deposit', d: 'The amount you will put in every month, for example ₹5,000.' },
  { t: 'Add the rate and the period', d: 'The yearly interest rate your bank or the post office offers, and how long the RD will run.' },
  { t: 'Read the maturity amount', d: 'What you deposit, the interest you earn, and what you get at the end.' },
];

const FAQ = [
  { q: 'How is RD maturity calculated?', a: 'Every monthly deposit earns interest for the months it stays in, with interest added every quarter. The first deposit earns the longest. For ₹5,000 a month for 5 years at 6.5%, you deposit ₹3,00,000 and get about ₹3,54,954, so the interest is about ₹54,954.' },
  { q: 'What is the RD formula?', a: 'Maturity = R × ((1 + i)^(n ÷ 3) − 1) ÷ (1 − (1 + i)^(−1 ÷ 3)), where R is the monthly deposit, i is the yearly rate ÷ 4, and n is the number of months. This calculator adds up each deposit separately and gets the same answer.' },
  { q: 'Why quarterly compounding?', a: 'Banks in India add interest to a recurring deposit once every quarter. Some schemes work differently, so check the terms of yours.' },
  { q: 'How much will ₹1,000 a month become in a year?', a: 'At 6% for 12 months you deposit ₹12,000 and the maturity is about ₹12,395.23, so you earn about ₹395.' },
  { q: 'RD or SIP: what is the difference?', a: 'An RD pays a fixed rate agreed upfront, so the maturity is known. A SIP usually goes into a market-linked fund, so the result can be higher or lower. The SIP calculator on KaamSolv shows an estimate for an assumed return.' },
  { q: 'What if I miss a monthly deposit?', a: 'Banks usually charge a small penalty for a late or missed deposit. That is not worked out here: the calculator assumes every deposit is made on time.' },
  { q: 'Is RD interest taxable?', a: 'Yes, it is generally taxable as income, and tax may be deducted at source above a limit that can change. This calculator does not work out tax.' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser and nothing is sent or saved.' },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="rd-calculator"
      h1="RD calculator"
      intro="Put a little aside every month and see what the pot looks like at the end."
      steps={STEPS}
      faq={FAQ}
      related={['fd-calculator', 'sip-calculator', 'compound-interest-calculator', 'emi-calculator']}
    >
      <RdCalculator />
    </ToolPageShell>
  );
}
