import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { LoremIpsumGenerator } from '@/app/_components/text/writing-tools';
import { writingMetadata } from '../meta';

export const metadata = writingMetadata(
  '/lorem-ipsum-generator',
  'Lorem ipsum generator',
  'Placeholder text by the paragraph, sentence or word — with optional <p> tags. Copy it straight into your design. Free.',
);

const STEPS = [
  { t: 'Pick how much', d: 'Paragraphs, sentences or words — and how many.' },
  { t: 'Tweak it', d: 'Start with “Lorem ipsum…” or not. Add <p> tags for HTML.' },
  { t: 'Copy', d: 'Not quite right? Generate new text and copy again.' },
];

const FAQ = [
  {
    q: 'What is lorem ipsum?',
    a: 'Scrambled Latin-like filler text, used for centuries by printers and now by designers, to show how a layout looks before the real words are ready.',
  },
  {
    q: 'Why use it instead of real text?',
    a: 'It looks like natural writing without distracting anyone with what it says, so people focus on the design.',
  },
  {
    q: 'Can I get it as HTML?',
    a: 'Yes. With Paragraphs selected, tick “Wrap in <p> tags” and each paragraph comes ready to paste into your HTML.',
  },
];

export default function LoremIpsumPage() {
  return (
    <ToolPageShell
      slug="lorem-ipsum-generator"
      h1="Lorem ipsum generator"
      intro="Placeholder text, by the paragraph, sentence or word."
      steps={STEPS}
      faq={FAQ}
      related={['word-counter', 'character-counter', 'case-converter']}
    >
      <LoremIpsumGenerator />
    </ToolPageShell>
  );
}
