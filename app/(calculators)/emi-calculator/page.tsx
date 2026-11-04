import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { EmiCalculator } from '@/app/_components/calc/finance-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/emi-calculator',
  'EMI calculator with prepayment, free',
  'Work out your EMI, total interest and schedule, see what a prepayment saves, or find how much loan an EMI can support. Free, nothing is saved.',
);

const STEPS = [
  { t: 'Enter the loan', d: 'Amount, yearly interest rate and how long. Or switch to "How much can I borrow?" and enter the EMI you can pay.' },
  { t: 'See your EMI', d: 'Monthly payment, total interest, total paid, and how the balance falls year by year.' },
  { t: 'Try a prepayment', d: 'Add an extra amount to every EMI, or one lump sum, and see how much sooner you finish and how much interest you save.' },
];

const FAQ = [
  {
    q: 'How is EMI calculated?',
    a: 'EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1), where P is the loan, r is the monthly interest rate (yearly rate ÷ 12 ÷ 100) and n is the number of months. Most Indian banks use this reducing-balance method. For ₹50,00,000 at 9% for 20 years the EMI is ₹44,986.30.',
  },
  {
    q: 'Why does most of my early EMI go to interest?',
    a: 'Interest is charged on what you still owe. Early on the balance is highest, so more of each EMI is interest; as the balance falls, more goes to the principal.',
  },
  {
    q: 'What does paying extra every month do?',
    a: 'The extra goes straight to the principal, so each later month has less interest. On ₹50,00,000 at 9% for 20 years, adding ₹10,000 to every EMI finishes the loan in 154 months (12 years 10 months) instead of 240, and saves about ₹23.66 lakh of interest.',
  },
  {
    q: 'Should I reduce my EMI or reduce my tenure after a prepayment?',
    a: 'Finishing sooner saves the most interest; a lower EMI eases your monthly budget. For a ₹10,00,000 lump sum paid after month 24 on the same ₹50,00,000 loan, finishing sooner ends the loan in 159 months and saves about ₹26.62 lakh. Keeping the 240 months lowers the EMI to ₹35,621.85 and saves about ₹10.23 lakh. Ask your lender which one it applies.',
  },
  {
    q: 'Does my lender charge for prepayment?',
    a: 'It depends on your lender and the type of loan, so ask them. This calculator does not include any charge, fee or tax benefit.',
  },
  {
    q: 'How much loan can I get for a given EMI?',
    a: 'Switch to "How much can I borrow?". It works backwards from the EMI you can pay. For an EMI of ₹50,000 at 9% for 20 years, the loan comes to about ₹55,57,247. A lender decides your eligibility using your income, existing loans and credit history, so treat this as arithmetic, not an approval.',
  },
  {
    q: 'Will my bank’s EMI match exactly?',
    a: 'It should be very close. Small differences come from processing fees, loan insurance, the first month’s broken-period interest, daily interest, a rate that changes on a floating-rate loan, or rounding.',
  },
  {
    q: 'Is my information sent anywhere?',
    a: 'No. It is worked out in your browser and nothing is sent or saved. A share link only contains the loan figures you typed.',
  },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="emi-calculator"
      h1="EMI calculator"
      intro="Your monthly EMI, what a prepayment saves, and how much loan an EMI can support."
      steps={STEPS}
      faq={FAQ}
      related={['sip-calculator', 'hra-calculator', 'salary-calculator', 'fd-calculator']}
    >
      <EmiCalculator />
    </ToolPageShell>
  );
}
