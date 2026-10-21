import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { WordCounter } from '@/app/_components/text/writing-tools';
import { TEXT_PRIVACY_FAQ, writingMetadata } from '../meta';

export const metadata = writingMetadata(
  '/word-counter',
  'Word counter',
  'Count words, characters, sentences and paragraphs as you type — plus reading and speaking time. Free, in your browser.',
);

const STEPS = [
  { t: 'Paste or type', d: 'Drop in your essay, post or script.' },
  { t: 'Watch the numbers', d: 'Words, characters and sentences update as you type.' },
  { t: 'Done', d: 'Trim to your limit and copy it back.' },
];

const FAQ = [
  {
    q: 'How are words counted?',
    a: 'The same way Microsoft Word does: anything between spaces that has a letter or number is one word. So “don’t”, “well-known” and “3.5” each count once, and a dash on its own doesn’t count.',
  },
  {
    q: 'Does it work for Hindi and other languages?',
    a: 'Yes. Hindi, Tamil, Bengali and other languages written with spaces are counted the same way, and Chinese, Japanese and Thai are split into words automatically.',
  },
  {
    q: 'How is reading time worked out?',
    a: 'At 238 words a minute for reading and 130 for speaking aloud — typical adult speeds. Your own pace may differ.',
  },
  TEXT_PRIVACY_FAQ,
];

export default function WordCounterPage() {
  return (
    <ToolPageShell
      slug="word-counter"
      h1="Word counter"
      intro="Count words, characters and sentences as you type — with reading time."
      steps={STEPS}
      faq={FAQ}
      related={['character-counter', 'text-cleaner', 'case-converter']}
    >
      <WordCounter />
    </ToolPageShell>
  );
}
