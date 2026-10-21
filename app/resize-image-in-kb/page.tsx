import { ResizeKbWorkspace } from '@/app/_components/image/resize-kb-workspace';
import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/resize-image-in-kb',
  'Resize image to KB',
  'Get a photo or signature under 20 KB, 50 KB or any size — and to an exact size like 3.5 × 4.5 cm — for exam, job and government forms. Free, in your browser.',
);

const STEPS = [
  { t: 'Set what your form asks for', d: 'A KB limit, an exact size like 3.5 × 4.5 cm — or both.' },
  { t: 'Add your photos', d: 'One or several. Drag the box to frame each one.' },
  { t: 'Download', d: 'See the exact size first, then save — or get them all as a ZIP.' },
];

const FAQ = [
  {
    q: 'How do I get a photo under 50 KB (or 20 KB)?',
    a: 'Set the limit, add your photo, and we find the best quality that fits — shrinking the image a little only if it has to. You’ll see the exact file size before you download.',
  },
  {
    q: 'My form says 1 KB = 1024 bytes. Will it still pass?',
    a: 'Yes. We aim below the limit counted in 1,000-byte KB, which is also under the 1,024-byte version — so the file passes either way.',
  },
  {
    q: 'What size is a passport photo in pixels?',
    a: '3.5 × 4.5 cm at 300 DPI is 413 × 531 pixels. Choose the passport preset, or type the size your form asks for in px, cm, mm or inches.',
  },
  {
    q: 'What if it can’t reach my size?',
    a: 'If a very small KB limit and a large pixel size can’t both be met, we show the smallest result we could make and tell you what to change. We never mark an oversized file as fitting.',
  },
  {
    q: 'Why JPG?',
    a: 'Almost every exam and government form asks for JPG, and it’s the only common format that can be squeezed to a target size. Transparent areas turn white.',
  },
  {
    q: 'Is my photo uploaded?',
    a: 'No. Everything happens in your browser — your photos, signatures and ID documents never reach KaamSolv. No watermark, no sign-up.',
  },
];

export default function ResizeImageInKbPage() {
  return (
    <ToolPageShell
      slug="resize-image-in-kb"
      h1="Resize image to KB"
      intro="Photos and signatures at the exact KB and size your form asks for."
      steps={STEPS}
      faq={FAQ}
      related={['image-compressor', 'heic-to-jpg', 'png-to-jpg']}
    >
      <ResizeKbWorkspace />
    </ToolPageShell>
  );
}
