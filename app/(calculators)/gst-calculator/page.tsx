import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { GstCalculator } from '@/app/_components/calc/finance-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/gst-calculator',
  'GST calculator',
  'Add or remove GST at 5%, 18%, 40% or any rate — with the CGST, SGST and IGST split. Updated for the September 2025 rates. Free.',
);

const STEPS = [
  { t: 'Add or remove', d: 'Adding GST to a price, or taking it out of one?' },
  { t: 'Enter amount and rate', d: '5%, 18%, 40% — or type any rate.' },
  { t: 'Done', d: 'See the GST, the total and the CGST / SGST / IGST split.' },
];

const FAQ = [
  {
    q: 'What are the GST rates now?',
    a: 'From 22 September 2025 most goods and services are taxed at 5% or 18%, with a 40% rate for a few items such as tobacco products, aerated drinks and luxury cars. Some items are exempt and a few have special rates — check the rate for your item in the official notifications.',
  },
  {
    q: 'How do I remove GST from a price?',
    a: 'Divide the price by 1 plus the rate. For 18% GST on ₹1,180: 1,180 ÷ 1.18 = ₹1,000 before GST, so the GST is ₹180. Choose “Remove GST” and the calculator does this for you.',
  },
  {
    q: 'CGST and SGST, or IGST?',
    a: 'For a sale within one state, GST is split equally into CGST and SGST (UTGST in union territories). For a sale between states, the full amount is IGST.',
  },
  {
    q: 'Is this tax advice?',
    a: 'No. It’s an estimate to help you check numbers. For filing or invoicing decisions, confirm with your accountant or the official GST notifications.',
  },
];

export default function Page() {
  return (
    <ToolPageShell
      slug="gst-calculator"
      h1="GST calculator"
      intro="Add or remove GST in seconds — with the CGST, SGST and IGST split."
      steps={STEPS}
      faq={FAQ}
      related={['emi-calculator', 'discount-calculator', 'percentage-calculator']}
    >
      <GstCalculator />
    </ToolPageShell>
  );
}
