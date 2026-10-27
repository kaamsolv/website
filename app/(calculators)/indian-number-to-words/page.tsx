import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { IndianNumberToWords } from '@/app/_components/calc/number-to-words';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/indian-number-to-words', 'Indian number to words', 'Turn an amount into words, lakh and crore style, with paise. Cheque-style wording as you type. Free, nothing leaves your browser.');

const STEPS = [
  { t: 'Type the amount', d: 'Write it as you would, like 1,25,000 or 1180.50. Commas and ₹ are fine.' },
  { t: 'Read it in words', d: 'Cheque style, with “Rupees … Only”, and plain words, both ready at once.' },
  { t: 'Copy', d: 'Tap Copy next to the line you need.' },
];

const FAQ = [
  { q: 'How do I write 1,00,000 in words?', a: 'One Lakh. In the Indian system 1,00,000 is one lakh, 10,00,000 is ten lakh and 1,00,00,000 is one crore.' },
  { q: 'What is the difference between a lakh and a million?', a: 'A lakh is 1,00,000 (a hundred thousand). A million is ten lakh, and a crore is ten million. This tool uses lakh and crore.' },
  { q: 'Why does the cheque style end with “Only”?', a: 'People write “Only” after an amount so nothing can be added after it. The cheque style adds it for you. Banks can have their own rules, so check your bank’s form if you are unsure.' },
  { q: 'How are paise written?', a: 'After the rupees, as “and Fifty Paise”, then “Only”: Rupees One Thousand One Hundred Eighty and Fifty Paise Only. Enter up to two decimal places.' },
  { q: 'Is my amount sent anywhere?', a: 'No. The words are worked out in your browser. Nothing is sent or saved.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="indian-number-to-words" h1="Indian number to words" intro="Turn an amount into words, lakh and crore style, with paise, as you type." steps={STEPS} faq={FAQ} related={['salary-calculator', 'gst-calculator', 'invoice-generator']}>
      <IndianNumberToWords />
    </ToolPageShell>
  );
}
