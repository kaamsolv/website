import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { AgeCalculator } from '@/app/_components/calc/everyday-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/age-calculator', 'Age calculator', 'Your exact age in years, months and days, plus days to your next birthday and the weekday you were born. Free.');

const STEPS = [
  { t: 'Enter a date of birth', d: 'Pick it from the calendar.' },
  { t: 'Change the date if needed', d: 'It uses today, or any date you choose.' },
  { t: 'See the age', d: 'Years, months, days and your next birthday.' },
];

const FAQ = [
  { q: 'How are months and days counted?', a: 'A month is complete when the same day of the month comes round again. For dates like the 31st, the last day of a shorter month counts.' },
  { q: 'What if I was born on 29 February?', a: 'In years without a 29 February, the birthday is counted on 28 February.' },
  { q: 'Can I check someone’s age on a past or future date?', a: 'Yes — change the “Age on” date, for example to check age on an exam or job-application cut-off date.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="age-calculator" h1="Age calculator" intro="Your exact age in years, months and days — and when your next birthday is." steps={STEPS} faq={FAQ} related={['split-bill-calculator', 'percentage-calculator', 'tip-calculator']}>
      <AgeCalculator />
    </ToolPageShell>
  );
}
