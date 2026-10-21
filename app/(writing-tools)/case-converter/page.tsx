import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { CaseConverter } from '@/app/_components/text/writing-tools';
import { TEXT_PRIVACY_FAQ, writingMetadata } from '../meta';

export const metadata = writingMetadata(
  '/case-converter',
  'Case converter',
  'Change text to UPPER, lower, Title, Sentence case, camelCase, snake_case and more in one click. Free, in your browser.',
);

const STEPS = [
  { t: 'Paste your text', d: 'Anything typed in the wrong case — or caps lock left on.' },
  { t: 'Pick a case', d: 'Sentence, Title, UPPER, lower or a coding style.' },
  { t: 'Copy', d: 'The result updates instantly. Copy it and go.' },
];

const FAQ = [
  {
    q: 'What’s the difference between Title Case and Capitalize Every Word?',
    a: 'Title Case keeps short words like “of”, “the” and “and” lower case unless they start or end the title — the way headlines are usually written. Capitalize Every Word capitalises all of them.',
  },
  {
    q: 'Will Sentence case fix names and acronyms?',
    a: 'It capitalises the start of each sentence and the word “I”, but it can’t know which other words are names or acronyms. Give names and short forms like “GST” a quick look afterwards.',
  },
  {
    q: 'What are camelCase, snake_case and kebab-case for?',
    a: 'They’re naming styles for code, files and URLs. Spaces and punctuation are removed and the words are joined up.',
  },
  TEXT_PRIVACY_FAQ,
];

export default function CaseConverterPage() {
  return (
    <ToolPageShell
      slug="case-converter"
      h1="Case converter"
      intro="UPPER, lower, Title, Sentence case and more — in one click."
      steps={STEPS}
      faq={FAQ}
      related={['text-cleaner', 'word-counter', 'character-counter']}
    >
      <CaseConverter />
    </ToolPageShell>
  );
}
