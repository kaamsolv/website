import { ToolPageShell, type ToolFaq, type ToolStep } from '../tool-page-shell';
import { PdfWorkspace, type PdfTask } from './pdf-workspace';
import { toolMetadata } from '@/app/lib/tool-metadata';
import { FREE_IMAGES_TO_PDF, FREE_MAX_FILE_BYTES, FREE_MERGE_FILES, sizeLimitLabel } from '@/app/lib/pdf/limits';
import type { Tool } from '@/app/lib/catalogue';

/**
 * The six PDF pages share one workspace; each opens it on its own task with
 * its own H1, copy and FAQ (like the image converters). Copy lives here so the
 * pages stay in step.
 */

const LIMIT = sizeLimitLabel(FREE_MAX_FILE_BYTES);

const COMMON_FAQ: ToolFaq[] = [
  {
    q: 'Are my files uploaded?',
    a: 'No. Everything happens in your browser, on your device. Your PDFs and images are never sent to KaamSolv.',
  },
  {
    q: 'Is there a limit?',
    a: `Files up to ${LIMIT} each. No daily limit, no watermark, no sign-up.`,
  },
  {
    q: 'It says my PDF has a password.',
    a: 'Password-protected PDFs can’t be opened here. Remove the password in the app that made the PDF, then try again.',
  },
];

type PageDef = {
  slug: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  steps: ToolStep[];
  faq: ToolFaq[];
  related: string[];
};

const PAGES: Record<PdfTask, PageDef> = {
  hub: {
    slug: 'pdf-tools',
    path: '/pdf-tools',
    title: 'PDF tools — compress, merge, split, convert',
    description: `Compress, merge, split and convert PDFs to and from JPG — free, in your browser. Nothing is uploaded. Files up to ${LIMIT}.`,
    h1: 'PDF tools',
    intro: 'Compress, merge, split and convert PDFs — right in your browser.',
    steps: [
      { t: 'Drop your files', d: 'A PDF, a few PDFs, or photos. They stay on your device.' },
      { t: 'Pick what to do', d: 'Compress, merge, split or convert.' },
      { t: 'Download', d: 'Save the new file. Your originals aren’t changed.' },
    ],
    faq: [...COMMON_FAQ],
    related: ['compress-pdf', 'merge-pdf', 'jpg-to-pdf'],
  },
  compress: {
    slug: 'compress-pdf',
    path: '/compress-pdf',
    title: 'Compress PDF — make a PDF smaller',
    description: `Make a PDF smaller for email and upload forms. Pictures shrink, text stays sharp. Free, in your browser — nothing is uploaded.`,
    h1: 'Compress a PDF',
    intro: 'Make a PDF smaller for email and upload forms — right in your browser.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Compress', d: 'The pictures inside get smaller. Text stays as it is.' },
      { t: 'Download', d: 'See how much you saved, then save the smaller PDF.' },
    ],
    faq: [
      {
        q: 'How much smaller will it get?',
        a: 'Scans and photo-heavy PDFs often shrink by half or more. PDFs that are mostly text are already small and change little — if it isn’t worth it, we say so.',
      },
      {
        q: 'Will the text still be selectable?',
        a: 'Yes. Only the pictures inside the PDF are made smaller. Text, links and bookmarks stay exactly as they were.',
      },
      {
        q: 'Will it look blurry?',
        a: 'Pictures are kept at 150 DPI — sharp on screen and fine for printing forms and documents.',
      },
      {
        q: 'I need it under a size, like 200 KB.',
        a: 'Compress it first. If it’s still too big, use Split PDF to keep only the pages the form needs.',
      },
      ...COMMON_FAQ,
    ],
    related: ['split-pdf', 'merge-pdf', 'image-compressor'],
  },
  merge: {
    slug: 'merge-pdf',
    path: '/merge-pdf',
    title: 'Merge PDF — combine PDF files into one',
    description: `Join up to ${FREE_MERGE_FILES} PDFs into one, in the order you want. Free, in your browser — nothing is uploaded.`,
    h1: 'Merge PDF files',
    intro: 'Join PDFs into one file, in the order you want.',
    steps: [
      { t: 'Add your PDFs', d: `Up to ${FREE_MERGE_FILES} at a time, ${LIMIT} each.` },
      { t: 'Put them in order', d: 'Use the arrows, or drag with a mouse.' },
      { t: 'Merge and download', d: 'One PDF, every page, in your order.' },
    ],
    faq: [
      {
        q: 'How many PDFs can I merge?',
        a: `Up to ${FREE_MERGE_FILES} at a time. Need more? Merge the result with the next ones.`,
      },
      {
        q: 'Does anything get lost?',
        a: 'Pages come across exactly, text and links included. Bookmarks and fillable form fields from the original files aren’t carried over.',
      },
      ...COMMON_FAQ,
    ],
    related: ['split-pdf', 'compress-pdf', 'jpg-to-pdf'],
  },
  split: {
    slug: 'split-pdf',
    path: '/split-pdf',
    title: 'Split PDF — extract pages from a PDF',
    description: 'Pick the pages you need and save them as a new PDF. Free, in your browser — nothing is uploaded.',
    h1: 'Split a PDF',
    intro: 'Pick the pages you need and save them as a new PDF.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Tick the pages', d: 'Every page is shown, so you can see what you pick.' },
      { t: 'Download', d: 'A new PDF with just those pages.' },
    ],
    faq: [
      {
        q: 'Does it change my original PDF?',
        a: 'No. Your original stays as it is. You download a new PDF with only the pages you picked.',
      },
      {
        q: 'Do the pages lose quality?',
        a: 'No. Pages are copied exactly — nothing is redrawn or compressed.',
      },
      {
        q: 'Can I make several files at once?',
        a: 'Pick one set of pages and download it, then pick the next set. Your PDF stays loaded.',
      },
      ...COMMON_FAQ,
    ],
    related: ['merge-pdf', 'compress-pdf', 'pdf-to-jpg'],
  },
  'pdf-to-jpg': {
    slug: 'pdf-to-jpg',
    path: '/pdf-to-jpg',
    title: 'PDF to JPG — convert PDF pages to images',
    description: 'Turn every page of a PDF into a JPG image, at screen or print quality. Free, in your browser — nothing is uploaded.',
    h1: 'PDF to JPG',
    intro: 'Turn every page of a PDF into a JPG image.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Pick a quality', d: 'Standard for screens, High for printing.' },
      { t: 'Download', d: 'All pages in one ZIP, or one page at a time.' },
    ],
    faq: [
      {
        q: 'Standard or High?',
        a: 'Standard (150 DPI) is right for sharing, screens and most upload forms. High (300 DPI) is for printing and makes bigger files.',
      },
      {
        q: 'How do I get all the pages?',
        a: '“Download all” puts every page in one ZIP file. To save a single page, click it under the results.',
      },
      ...COMMON_FAQ,
    ],
    related: ['jpg-to-pdf', 'split-pdf', 'image-compressor'],
  },
  'pdf-to-word': {
    slug: 'pdf-to-word',
    path: '/pdf-to-word',
    title: 'PDF to Word — get the text of a PDF into an editable file',
    description: `Turn a PDF's text into an editable Word (.docx) file. Best for letters, reports and other text documents. Free, in your browser — nothing is uploaded. Files up to ${LIMIT}.`,
    h1: 'PDF to Word',
    intro: 'Get the text of a PDF into a Word file you can edit — right in your browser.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}. It stays on your device.` },
      { t: 'Convert', d: 'We read the text and set it out as paragraphs and headings.' },
      { t: 'Download', d: 'A .docx file you can open in Word, Google Docs or Pages.' },
    ],
    faq: [
      {
        q: 'Will it look exactly like my PDF?',
        a: 'No. It copies the text into Word paragraphs and headings so you can edit it. Page layout, tables, columns, images and exact fonts do not come across. If the layout matters, work from the original file.',
      },
      {
        q: 'Can it read a scanned PDF?',
        a: 'Not yet. A scan is a picture of text, so there is no text to copy. If you can select the words in your PDF viewer, this will work.',
      },
      {
        q: 'What happens to tables and columns?',
        a: 'A table row comes out as one line with tab gaps. On a page with two columns the text is read top to bottom, so the columns can mix. Check the result in Word.',
      },
      {
        q: 'Do other languages work?',
        a: 'Text that the PDF stores as ordinary text comes across. Some PDFs, especially in Indian languages, store letters in a way that can come out wrong. Check the result before you rely on it.',
      },
      ...COMMON_FAQ,
    ],
    related: ['pdf-to-jpg', 'compress-pdf', 'merge-pdf'],
  },
  'jpg-to-pdf': {
    slug: 'jpg-to-pdf',
    path: '/jpg-to-pdf',
    title: 'JPG to PDF — combine images into one PDF',
    description: `Put up to ${FREE_IMAGES_TO_PDF} photos or scans into one PDF — JPG, PNG, WebP or iPhone HEIC. Free, in your browser — nothing is uploaded.`,
    h1: 'JPG to PDF',
    intro: 'Put photos and scans into one PDF, in the order you want.',
    steps: [
      { t: 'Add your images', d: `JPG, PNG, WebP or HEIC — up to ${FREE_IMAGES_TO_PDF}.` },
      { t: 'Order and pick a page size', d: 'A4 or the photo’s own shape, with or without a margin.' },
      { t: 'Download', d: 'One PDF, one image per page.' },
    ],
    faq: [
      {
        q: 'Which images can I use?',
        a: 'JPG, PNG, WebP and HEIC photos from iPhones.',
      },
      {
        q: 'Will my photos lose quality?',
        a: 'JPG and PNG go in exactly as they are. WebP and HEIC are saved as high-quality JPG first.',
      },
      {
        q: 'My phone photo is sideways in other apps. Will it be here?',
        a: 'No — we read the photo’s rotation and put it the right way up.',
      },
      {
        q: 'How many images can I add?',
        a: `Up to ${FREE_IMAGES_TO_PDF} per PDF, ${LIMIT} each.`,
      },
      ...COMMON_FAQ.filter((f) => !f.q.includes('password')),
    ],
    related: ['pdf-to-jpg', 'merge-pdf', 'heic-to-jpg'],
  },
};

/** The hub isn't a catalogue tool; it borrows the Documents category for the frame. */
const HUB_TOOL: Tool = {
  name: 'PDF tools',
  slug: 'pdf-tools',
  url: '/pdf-tools',
  category: 'Documents',
  blurb: 'Compress, merge, split and convert PDFs.',
  keywords: [],
  status: 'live',
};

export function pdfMetadata(task: PdfTask) {
  const p = PAGES[task];
  return toolMetadata(p.path, p.title, p.description);
}

export function PdfToolPage({ task }: { task: PdfTask }) {
  const p = PAGES[task];
  return (
    <ToolPageShell
      slug={p.slug}
      tool={task === 'hub' ? HUB_TOOL : undefined}
      h1={p.h1}
      intro={p.intro}
      steps={p.steps}
      faq={p.faq}
      related={p.related}
    >
      <PdfWorkspace task={task} />
    </ToolPageShell>
  );
}
