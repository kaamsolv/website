import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { TextCleaner } from '@/app/_components/text/writing-tools';
import { TEXT_PRIVACY_FAQ, writingMetadata } from '../meta';

export const metadata = writingMetadata(
  '/text-cleaner',
  'Text cleaner',
  'Fix double spaces, broken PDF line breaks, extra blank lines, curly quotes, HTML tags and invisible characters. Free, in your browser.',
);

const STEPS = [
  { t: 'Paste messy text', d: 'From a PDF, email, website or chat.' },
  { t: 'Pick what to fix', d: 'The usual fixes are on already. Tick more if you need them.' },
  { t: 'Copy clean text', d: 'See the result straight away and copy it.' },
];

const FAQ = [
  {
    q: 'My text from a PDF has a line break in every line. Can this fix it?',
    a: 'Yes — tick “Fix broken lines”. It joins lines inside each paragraph, keeps the gaps between paragraphs, and rejoins words split with a hyphen at the end of a line.',
  },
  {
    q: 'What are invisible characters?',
    a: 'Characters you can’t see but that cause trouble: zero-width spaces, soft hyphens and non-breaking spaces that sneak in when you copy from websites, Word or chat apps.',
  },
  {
    q: 'Will it change my words?',
    a: 'No. It only changes spacing, line breaks and the extras you tick. Your words and punctuation stay as they are.',
  },
  TEXT_PRIVACY_FAQ,
];

export default function TextCleanerPage() {
  return (
    <ToolPageShell
      slug="text-cleaner"
      h1="Text cleaner"
      intro="Fix odd spacing, broken line breaks and copy-paste mess in one go."
      steps={STEPS}
      faq={FAQ}
      related={['case-converter', 'word-counter', 'character-counter']}
    >
      <TextCleaner />
    </ToolPageShell>
  );
}
