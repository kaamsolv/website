import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { SalaryCalculator } from '@/app/_components/calc/salary-calculator';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/salary-calculator',
  'Salary calculator: CTC to in-hand',
  'Turn your CTC into monthly in-hand salary for FY 2026-27 — PF, gratuity, professional tax and income tax under the new and old regime. Free and instant.',
);

const STEPS = [
  { t: 'Enter your CTC', d: 'The yearly figure from your offer letter, and any bonus in it.' },
  { t: 'Pick a regime', d: 'New or old. We show which leaves you more.' },
  { t: 'See your in-hand', d: 'A month and a year, with where every rupee goes.' },
];

const FAQ = [
  {
    q: 'How is in-hand salary worked out from CTC?',
    a: 'Take the CTC, remove what your employer pays on your behalf (their PF and gratuity) to get gross salary. Then take out your own PF, professional tax and income tax. What’s left is your in-hand.',
  },
  {
    q: 'New or old tax regime — which is better?',
    a: 'For most salaries the new regime leaves more in hand: tax is nil up to ₹12 lakh of taxable income (₹12.75 lakh of salary, after the ₹75,000 standard deduction). The old regime can win if you claim large deductions such as HRA, 80C and home-loan interest. Pick “Old regime”, add your deductions, and compare.',
  },
  {
    q: 'Why is my in-hand so much lower than CTC ÷ 12?',
    a: 'CTC includes money you don’t get every month: employer PF (it goes to your PF account), gratuity (paid when you leave) and any bonus. Your own PF, professional tax and income tax are also taken out.',
  },
  {
    q: 'What changed with the new labour codes?',
    a: 'Since 21 November 2025, at least half of your pay counts as “wages” for PF and gratuity — if allowances go above 50%, the extra is added back. So many companies now set Basic at about 50% of pay, which can raise PF and gratuity and lower monthly in-hand a little.',
  },
  {
    q: 'Is PF still worked out on ₹15,000?',
    a: 'The EPF wage ceiling went up to ₹25,000 a month from 17 September 2026. Many companies take 12% of basic up to that ceiling (₹3,000 a month); some take 12% of the full basic. You can switch between the two under More options.',
  },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="salary-calculator"
      h1="Salary calculator"
      intro="Your CTC, turned into what actually lands in your account each month."
      steps={STEPS}
      faq={FAQ}
      related={['emi-calculator', 'gst-calculator', 'percentage-calculator']}
    >
      <SalaryCalculator />
    </ToolPageShell>
  );
}
