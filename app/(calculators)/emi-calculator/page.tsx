import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { EmiCalculator } from '@/app/_components/calc/finance-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/emi-calculator',
  'EMI calculator',
  'Work out the monthly EMI, total interest and full repayment schedule for a home, car or personal loan. Free and instant.',
);

const STEPS = [
  { t: 'Enter the loan', d: 'Amount, yearly interest rate and how long.' },
  { t: 'See your EMI', d: 'Monthly payment, total interest and total paid.' },
  { t: 'Check the schedule', d: 'Year by year or month by month, down to ₹0.' },
];

const FAQ = [
  {
    q: 'How is EMI calculated?',
    a: 'EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1), where P is the loan, r is the monthly interest rate (yearly rate ÷ 12 ÷ 100) and n is the number of months. Most Indian banks use this reducing-balance method.',
  },
  {
    q: 'Why does most of my early EMI go to interest?',
    a: 'Interest is charged on what you still owe. Early on the balance is highest, so more of each EMI is interest; as the balance falls, more goes to the principal.',
  },
  {
    q: 'Will my bank’s EMI match exactly?',
    a: 'It should be very close. Small differences come from processing fees, loan insurance, the first month’s broken-period interest or rounding.',
  },
  {
    q: 'How can I pay less interest?',
    a: 'A shorter tenure, a lower rate or part-prepayments all cut total interest. Try a few tenures here to see the difference.',
  },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="emi-calculator"
      h1="EMI calculator"
      intro="Your monthly EMI, total interest and full repayment schedule."
      steps={STEPS}
      faq={FAQ}
      related={['gst-calculator', 'percentage-calculator', 'discount-calculator']}
    >
      <EmiCalculator />
    </ToolPageShell>
  );
}
