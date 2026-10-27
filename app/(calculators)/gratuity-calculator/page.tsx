import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { GratuityCalculator } from '@/app/_components/calc/gratuity-calculator';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/gratuity-calculator', 'Gratuity calculator', 'Work out your gratuity: last drawn wages × 15 × years ÷ 26, with the 5-year rule and the ₹20 lakh maximum. Free, nothing leaves your browser.');

const STEPS = [
  { t: 'Enter your dates', d: 'The day you joined and your last working day. It can be a day in the future if you are planning ahead.' },
  { t: 'Enter your wages', d: 'Your last drawn monthly wages: basic pay plus dearness allowance, or the figure your employer uses.' },
  { t: 'Read the result', d: 'Whether you are eligible, the years that count, the amount and how it was worked out.' },
];

const FAQ = [
  { q: 'How is gratuity calculated?', a: 'Last drawn wages × 15 × years of service ÷ 26. A part-year of more than six months counts as a full year. For example, wages of ₹50,000 and 10 years of service give about ₹2,88,462.' },
  { q: 'Who gets gratuity?', a: 'Under the Payment of Gratuity Act, an employee who has completed five years with an employer when they leave, whether they resign, retire or are let go. On death or disability there is no five-year minimum. Under the new labour codes, in force from 21 November 2025, employees on a fixed-term contract can be eligible after one year. Whether the law applies to your employer is a separate question, so ask your HR.' },
  { q: 'What counts as “wages”?', a: 'Under the Act, basic pay plus dearness allowance. The new labour codes widen the meaning of wages, so that allowances can’t make up more than half of total pay, and sources describe the exact test differently. Use the wages figure from your employer or your payslip.' },
  { q: 'Why 26 and not 30?', a: 'The Act treats a month as 26 working days, leaving out Sundays. Some employers that are not covered by the Act use 30. This calculator does not work that out.' },
  { q: 'Is gratuity taxable?', a: 'For employees covered by the Act, gratuity up to ₹20 lakh is generally exempt from income tax, with conditions, and an amount above that can be taxable. Rules are different for others. This calculator does not work out tax, so ask your CA.' },
  { q: 'I have worked 4 years and 8 months. Do I get it?', a: 'The Act asks for five years of continuous service. Some employers and courts have treated four years and eight months as enough, but it is not a guarantee. Ask your HR. The calculator shows “not eligible yet” and the date you reach five years.' },
  { q: 'Can my employer pay more than the maximum?', a: 'Yes. ₹20 lakh is the maximum under the Act. An employer can choose to pay more.' },
  { q: 'Is my information sent anywhere?', a: 'No. It is worked out in your browser and nothing is sent or saved.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="gratuity-calculator" h1="Gratuity calculator" intro="What you are owed at the end of a long stint, worked out as you type." steps={STEPS} faq={FAQ} related={['salary-calculator', 'rent-receipt-generator', 'indian-number-to-words']}>
      <GratuityCalculator />
    </ToolPageShell>
  );
}
