import type { Metadata } from 'next';
import { ImageCompressorWorkspace } from '@/app/_components/image/image-compressor-workspace';
import { ToolPageShell } from '@/app/_components/tool-page-shell';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kaamsolv.com';
const PATH = '/image-compressor';
const TITLE = 'Compress an image';
const DESCRIPTION =
  'Make JPG, PNG, WebP and iPhone photos smaller in your browser. Pick how small, download, done — nothing is uploaded.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { type: 'website', url: `${SITE_URL}${PATH}`, title: `${TITLE} · KaamSolv`, description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: `${TITLE} · KaamSolv`, description: DESCRIPTION },
};

const STEPS = [
  { t: 'Add your image', d: 'Drop a photo or browse. It stays on your device.' },
  { t: 'Pick how small', d: 'Balanced suits most images. Add a max size for big phone photos.' },
  { t: 'Download', d: 'See how much you saved, then save the smaller file.' },
];

const FAQ = [
  {
    q: 'Is my image uploaded to KaamSolv?',
    a: 'No. Compression runs in your browser. Your image is never sent to our servers.',
  },
  {
    q: 'Will it look worse?',
    a: 'At Balanced, most photos look the same on screen. Pick Best quality for photos you’ll print or edit, or Smaller file when size matters most.',
  },
  {
    q: 'What makes the biggest difference?',
    a: 'Dimensions. A 12-megapixel phone photo shrinks a lot at a max size of 1920 px, which is still sharp on any screen.',
  },
  {
    q: 'Why does a PNG become a WebP?',
    a: 'PNG is lossless, so it can’t get much smaller without changing format. WebP keeps transparency at a fraction of the size. You can still choose JPG or keep PNG.',
  },
  {
    q: 'Does it remove location data?',
    a: 'Yes. The compressed file is saved fresh, so camera details and GPS location from the original are not copied into it.',
  },
  {
    q: 'What if the result is bigger?',
    a: 'Some images are already well compressed. If ours isn’t smaller, we tell you and don’t offer it — keep your original.',
  },
  {
    q: 'I need it under an exact size, like 50 KB.',
    a: 'Use Resize image to KB — set the limit (and an exact size like 3.5 × 4.5 cm if your form needs one) and it finds the best quality that fits.',
  },
  {
    q: 'Is there a size limit?',
    a: 'Up to 25 MB per image. Very large images can be slow on older phones.',
  },
];

export default function ImageCompressorPage() {
  return (
    <ToolPageShell
      slug="image-compressor"
      h1="Compress an image"
      intro="Make photos and images smaller without the guesswork — right in your browser."
      steps={STEPS}
      faq={FAQ}
      related={['resize-image-in-kb', 'jpg-to-webp', 'heic-to-jpg']}
    >
      <ImageCompressorWorkspace />
    </ToolPageShell>
  );
}
