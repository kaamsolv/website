import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { HraCalculator } from '@/app/_components/calc/hra-calculator';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/hra-calculator',
  'HRA calculator: tax-free HRA, FY 2026-27',
  'Find how much of your HRA is tax-free: the three limits, the 8 cities at 50% from FY 2026-27, and old vs new regime. Free, nothing is saved.',
);

const STEPS = [
  { t: 'Enter your pay', d: 'Basic salary, DA if it is part of your pay, the HRA you receive and the rent you pay. Monthly or yearly, as you prefer.' },
  { t: 'Pick your city and year', d: 'The city decides whether the cap is 50% or 40% of salary. The list of 50% cities changed from FY 2026-27.' },
  { t: 'Read the answer', d: 'The tax-free amount, what is taxable, and which of the three limits is holding you at that number.' },
];

const FAQ = [
  { q: 'How is HRA exemption calculated?', a: 'It is the least of three amounts: the HRA you receive, your rent minus 10% of your salary, and 50% of salary in the named cities (40% elsewhere). For a basic of ₹6,00,000 a year, HRA of ₹2,40,000 and rent of ₹1,80,000 in a 50% city, the three amounts are ₹2,40,000, ₹1,20,000 and ₹3,00,000, so ₹1,20,000 is tax-free.' },
  { q: 'Which cities get the 50% limit?', a: 'From FY 2026-27 (from 1 April 2026), eight: Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune and Ahmedabad, under rule 279 of the Income-tax Rules 2026. Up to FY 2025-26 only Delhi, Mumbai, Kolkata and Chennai got 50%. Every other place is 40%.' },
  { q: 'Can I claim HRA exemption in the new tax regime?', a: 'No. The new regime allows no HRA exemption, so your full HRA is taxable there. The old regime lets you claim it. The comparison on this page shows the tax on your salary under both.' },
  { q: 'What counts as salary for HRA?', a: 'Basic pay, plus dearness allowance (DA) if it is provided for under your terms of employment. Bonus, other allowances and perquisites are left out. If your payslip shows a DA that is part of pay, enter it.' },
  { q: 'What if I pay no rent or live in my own home?', a: 'Then there is no exemption. HRA is tax-free only against rent you really pay for the home you live in.' },
  { q: 'Do I need rent receipts?', a: 'Employers usually ask for rent receipts or a rent agreement as proof, and there can be extra requirements at higher rents. Ask your payroll team what they need. KaamSolv has a free Rent Receipt Generator if you need receipts.' },
  { q: 'Why is my payslip different from this calculator?', a: 'Payroll teams may count salary differently, apply the rule from a different month, or handle part-year stays and rent paid to relatives their own way. This tool follows the rule for a full year at one address.' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser and nothing is sent or saved, which is also why there is no share link with your numbers in it.' },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="hra-calculator"
      h1="HRA calculator"
      intro="How much of your HRA is tax-free, and which limit is holding you at that number."
      steps={STEPS}
      faq={FAQ}
      related={['rent-receipt-generator', 'salary-calculator', 'gratuity-calculator']}
    >
      <HraCalculator />
    </ToolPageShell>
  );
}
