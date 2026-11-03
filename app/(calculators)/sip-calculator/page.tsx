import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { SipCalculator } from '@/app/_components/calc/interest-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/sip-calculator',
  'SIP calculator: monthly SIP returns',
  'See what your monthly SIP could grow to, with an optional yearly step-up. Money put in, estimated returns and a year-by-year table. Free, no sign-up.',
);

const STEPS = [
  { t: 'Enter the monthly amount', d: 'How much you plan to invest every month, for example ₹5,000.' },
  { t: 'Add the return and the years', d: 'The yearly return you are assuming and how long you will keep going. Add a yearly step-up if you will raise the amount.' },
  { t: 'Read what it could become', d: 'The total you put in, the estimated returns, the value at the end, and a year-by-year table.' },
];

const FAQ = [
  { q: 'What is a SIP?', a: 'A systematic investment plan: you invest a fixed amount every month, usually in a mutual fund, instead of one big amount at once. This calculator shows what such a plan could be worth if it earned a steady yearly return.' },
  { q: 'How is SIP value calculated?', a: 'Each month’s amount goes in at the start of the month and earns one twelfth of the yearly return. For a flat SIP the value is monthly amount × ((1 + i)^n − 1) ÷ i × (1 + i), where i is the yearly return ÷ 12 and n is the number of months. For example, ₹5,000 a month for 10 years at 12% puts in ₹6,00,000 and grows to about ₹11,61,695.' },
  { q: 'What is a step-up SIP?', a: 'A SIP where you raise the monthly amount by a fixed percentage each year, as your income grows. The same ₹5,000 a month for 10 years at 12%, raised by 10% every year, puts in ₹9,56,245 and grows to about ₹16,87,163.' },
  { q: 'Which return should I assume?', a: 'Nobody can promise one. Real returns go up and down with the market. A safer habit is to try a few values, such as 8%, 10% and 12%, and plan around the lower ones. This calculator only does the arithmetic for the number you enter.' },
  { q: 'Is the result guaranteed?', a: 'No. It is an estimate based on a steady return you assume. Mutual fund investments are subject to market risk, and past performance does not promise the future.' },
  { q: 'Does it include tax, exit load or fund charges?', a: 'No. Enter a return you expect after the fund’s charges. Tax on your gains and any exit load are not worked out here, so ask a tax adviser about your own case.' },
  { q: 'Why is my fund app’s number a little different?', a: 'Apps differ in small ways: whether money goes in at the start or end of the month, how a month is counted, and whether they track real NAV dates. This calculator states its choice (start of the month, yearly return ÷ 12), so you can compare like with like.' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser and nothing is sent or saved.' },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="sip-calculator"
      h1="SIP calculator"
      intro="See what a monthly SIP could be worth in 5, 10 or 20 years. Enter three numbers and read the answer."
      steps={STEPS}
      faq={FAQ}
      related={['fd-calculator', 'rd-calculator', 'emi-calculator', 'compound-interest-calculator']}
    >
      <SipCalculator />
    </ToolPageShell>
  );
}
