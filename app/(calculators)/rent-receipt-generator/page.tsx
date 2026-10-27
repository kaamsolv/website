import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { RentReceiptGenerator } from '@/app/_components/receipt/rent-receipt';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/rent-receipt-generator', 'Rent receipt generator', 'Make rent receipts for every month of the year, three to an A4 page, ready for your landlord to sign. For HRA. Free, nothing leaves your browser.');

const STEPS = [
  { t: 'Fill in the details', d: 'Your name, your landlord, the address and the monthly rent. Add the landlord’s PAN if you have it.' },
  { t: 'Pick the months', d: 'A whole financial year, or any months you choose, up to 24.' },
  { t: 'Download and sign', d: 'One PDF, three receipts to a page. Print it and ask your landlord to sign each one.' },
];

const FAQ = [
  { q: 'What goes on a rent receipt?', a: 'The tenant’s and landlord’s names, the rent amount and the month it is for, the date, the address of the property, how it was paid, and the landlord’s signature. These receipts have all of that.' },
  { q: 'When does my employer need the landlord’s PAN?', a: 'Employers usually ask for it when the rent you pay is more than ₹1,00,000 in a financial year. If your landlord has no PAN, ask your employer what they accept instead. Rules and company policies differ.' },
  { q: 'When does a receipt need a revenue stamp?', a: 'When rent is paid in cash and a receipt is for more than ₹5,000, landlords usually put a ₹1 revenue stamp on it and sign across the stamp. Each receipt has a box for it when you choose cash. Stamp rules can differ, so ask if you are unsure.' },
  { q: 'Can I make receipts for the whole year at once?', a: 'Yes. Pick a financial year, or any months you like, and you get one PDF with a receipt for each month, three to an A4 page.' },
  { q: 'Will my employer accept these?', a: 'Employers differ. These have the details most ask for, but your payroll team has the final say, so check their format if they have one.' },
  { q: 'Do I need to make them for rent I did not pay?', a: 'No, and you should not. Only make receipts for rent you actually paid. Whether HRA is exempt for you depends on your tax regime and your employer’s rules, so ask your employer or a CA.' },
  { q: 'Is my information sent anywhere?', a: 'No. The receipts are made in your browser and nothing is sent or saved, not even on this device.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="rent-receipt-generator" h1="Rent receipt generator" intro="Rent receipts for every month, ready for your landlord to sign. Made in your browser." steps={STEPS} faq={FAQ} related={['salary-calculator', 'indian-number-to-words', 'invoice-generator']}>
      <RentReceiptGenerator />
    </ToolPageShell>
  );
}
