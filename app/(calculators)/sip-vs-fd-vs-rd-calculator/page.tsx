import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { CompareCalculator } from '@/app/_components/calc/compare-calculator';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/sip-vs-fd-vs-rd-calculator',
  'SIP vs FD vs RD: compare returns side by side',
  'Put the same money into a SIP, a fixed deposit or a recurring deposit and see which ends higher, year by year. Plain numbers, no advice. Free.',
);

const STEPS = [
  { t: 'Choose how you save', d: 'Every month (SIP against a recurring deposit) or one lump sum (a market-linked investment against a fixed deposit).' },
  { t: 'Set the amount, the years and the two rates', d: 'The market-linked return is an assumption you choose. The deposit rate is what your bank offers.' },
  { t: 'Read the gap and the picture', d: 'Two cards, one line for each option, and a year-by-year table.' },
];

const FAQ = [
  { q: 'SIP or RD: which gives more?', a: 'It depends on the return. ₹10,000 a month for 10 years at an assumed 12% in a SIP comes to about ₹23,23,391. The same money in a recurring deposit at 6.5% comes to about ₹16,89,880. The SIP figure is an assumption and the market can do worse; the RD rate is fixed when you open it.' },
  { q: 'SIP or FD for a lump sum?', a: 'For ₹1,00,000 over 10 years, a fixed deposit at 7% with quarterly interest becomes about ₹2,00,160. A market-linked investment at an assumed 12% a year becomes about ₹3,10,585. The second is not guaranteed and can be lower or even a loss.' },
  { q: 'Is the market-linked return guaranteed?', a: 'No. It is a number you choose to see what could happen. Real returns go up and down, and past returns do not promise the future.' },
  { q: 'Why does the comparison have two modes?', a: 'A SIP and an RD are both monthly savings, so they are compared with each other. A fixed deposit is a one-time amount, so it is compared with a one-time market-linked investment. Mixing them would not be a fair comparison.' },
  { q: 'Does it include tax?', a: 'No. Tax depends on your income and the product, so it is not worked out here.' },
  { q: 'Does KaamSolv recommend one of them?', a: 'No. It shows the numbers for the rates you enter and leaves the decision to you.' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser. The share link only contains the numbers you typed.' },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="sip-vs-fd-vs-rd-calculator"
      h1="SIP vs FD vs RD"
      intro="Same money, two ways to save it. See which one ends higher, and by how much."
      steps={STEPS}
      faq={FAQ}
      related={['sip-calculator', 'fd-calculator', 'rd-calculator', 'compound-interest-calculator']}
    >
      <CompareCalculator />
    </ToolPageShell>
  );
}
