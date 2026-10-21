import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { CharacterCounter } from '@/app/_components/text/writing-tools';
import { TEXT_PRIVACY_FAQ, writingMetadata } from '../meta';

export const metadata = writingMetadata(
  '/character-counter',
  'Character counter',
  'Count characters as you type and see if it fits X, Instagram, LinkedIn, YouTube, SMS and Google limits. Free, in your browser.',
);

const STEPS = [
  { t: 'Paste or type', d: 'Your post, bio, title or message.' },
  { t: 'Check the limits', d: 'See what fits X, Instagram, LinkedIn, SMS and more.' },
  { t: 'Trim and go', d: 'Cut to fit, then copy it back.' },
];

const FAQ = [
  {
    q: 'Do spaces count as characters?',
    a: 'Yes — on every platform listed, spaces and line breaks count towards the limit, so they count here too.',
  },
  {
    q: 'Why is an emoji one character here but more on X?',
    a: 'We count what you see, so 👍🏽 is one character. X counts most emoji as 2 and every link as 23, so treat the X bar as a close guide.',
  },
  {
    q: 'Are the limits up to date?',
    a: 'They were checked in October 2026. Platforms change their limits now and then, so double-check anything critical.',
  },
  TEXT_PRIVACY_FAQ,
];

export default function CharacterCounterPage() {
  return (
    <ToolPageShell
      slug="character-counter"
      h1="Character counter"
      intro="Count characters as you type — and see what fits where."
      steps={STEPS}
      faq={FAQ}
      related={['word-counter', 'case-converter', 'text-cleaner']}
    >
      <CharacterCounter />
    </ToolPageShell>
  );
}
