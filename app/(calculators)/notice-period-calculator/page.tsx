import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { NoticePeriodCalculator } from '@/app/_components/calc/notice-period-calculator';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/notice-period-calculator', 'Notice period calculator', 'Find your last working day from the day you resign, or the latest day to resign for a new job. Calendar or working days, days or months, with a day-by-day calendar. Free, nothing leaves your browser.');

const STEPS = [
  { t: 'Pick the date', d: 'The day you resign. Or, if you already have an offer, the day your new job starts.' },
  { t: 'Set your notice', d: 'Days or months, the way your offer letter says it, and whether it counts calendar days or working days.' },
  { t: 'Read your date', d: 'Your last working day, or the latest day to resign, with the days laid out on a calendar.' },
];

const FAQ = [
  { q: 'How is the last working day worked out?', a: 'From the date, your notice and the choices you make on the page. By default it counts calendar days and starts the day after you resign, so 30 days from Friday 1 January 2027 ends on Sunday 31 January. Counting the day you resign as day one ends a day earlier. The page always says in words which rule it used.' },
  { q: 'Do weekends and holidays count?', a: 'That depends on your offer letter. Most count every calendar day, weekends and holidays included. Some count only working days. Pick the one in your letter, and if it does not say, ask HR which one payroll uses. This calculator does not know your company’s holidays.' },
  { q: 'What if my last day falls on a weekend?', a: 'Some companies keep that date and others move it to the working day before. Under “More” you can choose, and the page tells you when it happens so you can check with HR.' },
  { q: 'Is 3 months the same as 90 days?', a: 'Not always. Three months can be anywhere from 89 to 92 days. If your letter says months, choose Months: a month runs to the day before the same date next month, or to the last day of a shorter month.' },
  { q: 'When should I resign to join a new job on a certain date?', a: 'Choose “I know when the new job starts”. It finds the latest day you can resign so your notice ends the day before the new job begins. Resign earlier if you want a gap between jobs.' },
  { q: 'Can I leave before my notice ends?', a: 'Only if your employer agrees, usually by shortening the notice or by a buyout. Under “More”, pick the date you want to leave to see how many days short that is and a rough buyout: monthly pay divided by 30 (or 26) times the days short. Employers differ on this, for example basic pay or gross pay, so your offer letter has the real figure.' },
  { q: 'Is the notice period set by law?', a: 'It is usually set by your offer letter or employment contract, and companies differ. This is a calculator, not legal advice. Your letter and your HR team have the final say.' },
  { q: 'Is my information sent anywhere?', a: 'No. Everything is worked out in your browser and nothing is sent or saved.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="notice-period-calculator" h1="Notice period calculator" intro="Your last working day, or the latest day to resign. Worked out as you change anything." steps={STEPS} faq={FAQ} related={['gratuity-calculator', 'salary-calculator', 'hra-calculator']}>
      <NoticePeriodCalculator />
    </ToolPageShell>
  );
}
