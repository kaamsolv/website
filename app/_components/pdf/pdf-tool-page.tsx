import { ToolPageShell, type ToolFaq, type ToolStep } from '../tool-page-shell';
import { HubDirectory, HubTrust, PopularTasks } from './hub-grid';
import { HubHero } from './hub-hero';
import { PdfStage } from './pdf-stage';
import { PdfWorkspace } from './pdf-workspace';
import type { PdfTask } from '@/app/lib/pdf/tools';
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
    title: 'PDF tools — merge, split, rotate, compress, convert',
    description: `Merge, split, rotate, delete and rearrange pages, compress, and convert PDFs to and from JPG and Word — free, in your browser. Nothing is uploaded. Files up to ${LIMIT}.`,
    h1: 'PDF tools',
    intro: 'Fix, join, shrink and convert PDFs — right in your browser.',
    steps: [
      { t: 'Drop your files', d: 'A PDF, a few PDFs, or photos. They stay on your device.' },
      { t: 'Pick what to do', d: 'Merge, split, turn pages, compress or convert.' },
      { t: 'Download', d: 'Save the new file. Your originals aren’t changed.' },
    ],
    faq: [
      {
        q: 'Which PDF tools are here?',
        a: 'Merge, split, rotate, delete and rearrange pages, compress, PDF to JPG, JPG to PDF and PDF to Word. More are on the way, and the ones that aren’t ready yet are marked “Coming soon”.',
      },
      ...COMMON_FAQ,
    ],
    related: ['image-compressor', 'invoice-generator', 'rent-receipt-generator'],
  },
  rotate: {
    slug: 'rotate-pdf',
    path: '/rotate-pdf',
    title: 'Rotate PDF — turn pages the right way up',
    description: 'Turn one page, a few, or the whole PDF left or right, then save it. Free, in your browser — nothing is uploaded.',
    h1: 'Rotate a PDF',
    intro: 'Fix sideways scans. Turn pages left or right, then save.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Turn the pages', d: 'Use the arrows under a page, or tick several and turn them together.' },
      { t: 'Save', d: 'Download the new PDF. Your original isn’t changed.' },
    ],
    faq: [
      {
        q: 'Can I turn just one page?',
        a: 'Yes. Use the turn arrows under that page. To turn several at once, tick them and press Rotate left or Rotate right. With nothing ticked, the buttons turn every page.',
      },
      {
        q: 'Does turning a page make it blurry?',
        a: 'No. The page is turned, not redrawn, so text stays sharp and selectable.',
      },
      {
        q: 'Can I undo a turn?',
        a: 'Yes. Undo steps back one change at a time and Reset goes back to the start. Nothing is saved until you press the save button.',
      },
      ...COMMON_FAQ,
    ],
    related: ['rearrange-pdf-pages', 'delete-pdf-pages', 'split-pdf'],
  },
  delete: {
    slug: 'delete-pdf-pages',
    path: '/delete-pdf-pages',
    title: 'Delete PDF pages — remove pages from a PDF',
    description: 'Pick the pages you don’t need and save the rest as a new PDF. Free, in your browser — nothing is uploaded.',
    h1: 'Delete pages from a PDF',
    intro: 'Remove the pages you don’t need and keep the rest.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Tick the pages to remove', d: 'Every page is shown. Press Delete, and confirm.' },
      { t: 'Save', d: 'Download a new PDF without those pages.' },
    ],
    faq: [
      {
        q: 'How do I delete several pages at once?',
        a: 'Tick them, then press Delete. You’ll be asked to confirm before they go. Or tick the ones to keep and press Keep only ticked.',
      },
      {
        q: 'Can I get a page back?',
        a: 'Yes, until you save. Undo brings back the last thing you removed, and Reset goes back to all the pages.',
      },
      {
        q: 'Does it change my original file?',
        a: 'No. You download a new PDF. Your original stays exactly as it was.',
      },
      {
        q: 'Can I delete every page?',
        a: 'No. A PDF needs at least one page, so the last page can’t be removed.',
      },
      ...COMMON_FAQ,
    ],
    related: ['split-pdf', 'rearrange-pdf-pages', 'compress-pdf'],
  },
  rearrange: {
    slug: 'rearrange-pdf-pages',
    path: '/rearrange-pdf-pages',
    title: 'Rearrange PDF pages — change the page order',
    description: 'Drag pages into a new order, or use the arrow buttons, then save. Free, in your browser — nothing is uploaded.',
    h1: 'Rearrange PDF pages',
    intro: 'Put the pages in the order you want.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Move the pages', d: 'Drag a page with a mouse, or use the arrow buttons under it.' },
      { t: 'Save', d: 'Download the PDF with its pages in the new order.' },
    ],
    faq: [
      {
        q: 'How do I move a page on my phone?',
        a: 'Use the left and right arrow buttons under each page. Dragging is for a mouse.',
      },
      {
        q: 'Can I see the new order before I save?',
        a: 'Yes. The page numbers update as you move things, and each moved page says where it started.',
      },
      {
        q: 'Can I undo a move?',
        a: 'Yes. Undo steps back one change at a time and Reset puts every page back where it began.',
      },
      ...COMMON_FAQ,
    ],
    related: ['rotate-pdf', 'merge-pdf', 'delete-pdf-pages'],
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
    related: ['split-pdf', 'rearrange-pdf-pages', 'compress-pdf'],
  },
  split: {
    slug: 'split-pdf',
    path: '/split-pdf',
    title: 'Split PDF — extract pages or cut into parts',
    description: 'Pick pages, type ranges like 1-3, 5, or cut a PDF into several files — every N pages, or one per page. Free, in your browser — nothing is uploaded.',
    h1: 'Split a PDF',
    intro: 'Pick the pages you need, or cut the PDF into several files.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Pick the pages', d: 'Tick them, or type ranges like 1-3, 5. Or choose every N pages, or one file per page.' },
      { t: 'Download', d: 'A new PDF with just those pages, or a ZIP of the parts.' },
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
        q: 'How do I type page ranges?',
        a: 'Write them with commas, like 1-3, 5, 8-. A dash joins two pages (1-3 is pages 1, 2 and 3) and 8- means page 8 to the end. The ticks below update as you type.',
      },
      {
        q: 'Can I make several files at once?',
        a: 'Yes. Choose Every N pages, or One PDF per page, and the parts download together as a ZIP. To get several different sets, pick one set, download it, then pick the next. Your PDF stays loaded.',
      },
      ...COMMON_FAQ,
    ],
    related: ['delete-pdf-pages', 'merge-pdf', 'compress-pdf'],
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
  'pdf-to-png': {
    slug: 'pdf-to-png',
    path: '/pdf-to-png',
    title: 'PDF to PNG — convert PDF pages to images',
    description: 'Turn every page of a PDF into a sharp PNG image, at screen or print quality. Free, in your browser — nothing is uploaded.',
    h1: 'PDF to PNG',
    intro: 'Turn every page of a PDF into a PNG image.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Pick a quality', d: 'Standard for screens, High for printing.' },
      { t: 'Download', d: 'All pages in one ZIP, or one page at a time.' },
    ],
    faq: [
      {
        q: 'PNG or JPG?',
        a: 'PNG keeps every pixel exactly, so text and line drawings stay crisp, but the files are bigger. JPG is smaller and fine for photos. Use PNG for screenshots, diagrams and pages with lots of text.',
      },
      {
        q: 'Standard or High?',
        a: 'Standard (150 DPI) is right for sharing and screens. High (300 DPI) is for printing, and the files get a lot bigger.',
      },
      {
        q: 'How do I get all the pages?',
        a: '“Download all” puts every page in one ZIP file. To save a single page, click it under the results.',
      },
      {
        q: 'Is the background transparent?',
        a: 'No. Pages are drawn on white, the way they look when you print them.',
      },
      ...COMMON_FAQ,
    ],
    related: ['pdf-to-jpg', 'jpg-to-pdf', 'split-pdf'],
  },
  'pdf-to-text': {
    slug: 'pdf-to-text',
    path: '/pdf-to-text',
    title: 'PDF to Text — copy the text out of a PDF',
    description: `Get the text of a PDF as plain text you can copy or save as a .txt file. Free, in your browser — nothing is uploaded. Files up to ${LIMIT}.`,
    h1: 'PDF to Text',
    intro: 'Copy the text out of a PDF — right in your browser.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}. It stays on your device.` },
      { t: 'Get the text', d: 'We read it in order, a paragraph at a time.' },
      { t: 'Copy or save', d: 'Copy it, or download a .txt file.' },
    ],
    faq: [
      {
        q: 'Can it read a scanned PDF?',
        a: 'Not yet. A scan is a picture of text, so there is no text to copy. If you can select the words in your PDF viewer, this will work.',
      },
      {
        q: 'Why is some text in the wrong order?',
        a: 'Text is read from top to bottom, left to right. On a page with columns or a table, the lines can mix. Check the result before you rely on it.',
      },
      {
        q: 'Do other languages work?',
        a: 'Text that the PDF stores as ordinary text comes across. Some PDFs, especially in Indian languages, store letters in a way that can come out wrong. Check the result before you rely on it.',
      },
      {
        q: 'I want a Word file, not plain text.',
        a: 'Use PDF to Word. It keeps headings and paragraphs in a .docx file you can edit.',
      },
      ...COMMON_FAQ,
    ],
    related: ['pdf-to-word', 'pdf-to-jpg', 'compress-pdf'],
  },
  'page-numbers': {
    slug: 'add-page-numbers-to-pdf',
    path: '/add-page-numbers-to-pdf',
    title: 'Add page numbers to a PDF',
    description: 'Number the pages of a PDF — pick the corner, the style and where to start. Free, in your browser — nothing is uploaded.',
    h1: 'Add page numbers to a PDF',
    intro: 'Number the pages of a PDF, your way.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Choose how it looks', d: 'Pick the corner, the style and where to start. The preview shows it.' },
      { t: 'Download', d: 'The same PDF with a number on every page.' },
    ],
    faq: [
      {
        q: 'Can I skip the cover page?',
        a: 'Yes. Set “Start on page” to 2, and the cover is left alone. You can also choose which number the first numbered page gets.',
      },
      {
        q: 'Will the number cover my text?',
        a: 'It is written about 1 cm from the edge, in small dark text. If something is printed there, pick another corner. The preview shows where it lands.',
      },
      {
        q: 'Does it work on sideways pages?',
        a: 'Yes. The number is turned to match, so it reads the right way up and sits in the same corner you see.',
      },
      {
        q: 'Does it change the rest of my PDF?',
        a: 'No. Text, links and pictures stay as they are. The number is added on top of each page, and you download a new file.',
      },
      ...COMMON_FAQ,
    ],
    related: ['rotate-pdf', 'rearrange-pdf-pages', 'merge-pdf'],
  },
  watermark: {
    slug: 'watermark-pdf',
    path: '/watermark-pdf',
    title: 'Watermark PDF — add words or a logo to every page',
    description: 'Stamp words like CONFIDENTIAL, or your logo, across a PDF, see-through, on the pages you choose. Free, in your browser — nothing is uploaded.',
    h1: 'Watermark a PDF',
    intro: 'Put words or a logo on your PDF, see-through.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Choose words or a picture', d: 'Pick how it looks and which pages. The preview shows it.' },
      { t: 'Download', d: 'The same PDF with your watermark on top of the pages you chose.' },
    ],
    faq: [
      {
        q: 'Can I watermark only some of the pages?',
        a: 'Yes. Type the pages, like 1-3, 5, or leave the box empty to mark every page.',
      },
      {
        q: 'Will it cover my text?',
        a: 'It is see-through, and you choose how solid it is. The page underneath stays readable.',
      },
      {
        q: 'Can I use Hindi or another language?',
        a: 'Not as words yet: the words option takes English letters, numbers and common symbols. For Hindi, make your text into a picture first, then use the picture option.',
      },
      {
        q: 'Can someone remove the watermark?',
        a: 'A watermark is drawn on the page to mark a file, not to lock it. Someone with PDF editing tools may be able to remove it. To stop people opening the file at all, use Protect PDF.',
      },
      ...COMMON_FAQ,
    ],
    related: ['protect-pdf', 'add-page-numbers-to-pdf', 'rotate-pdf'],
  },
  protect: {
    slug: 'protect-pdf',
    path: '/protect-pdf',
    title: 'Protect PDF — add a password to a PDF',
    description: 'Lock a PDF with a password so only people who know it can open it. AES-256, done in your browser — your file and password are never uploaded.',
    h1: 'Protect a PDF with a password',
    intro: 'Lock your PDF so it needs a password to open.',
    steps: [
      { t: 'Add your PDF', d: `Drop it or browse. Up to ${LIMIT}.` },
      { t: 'Choose a password', d: 'Type it twice. Keep it safe: we can’t recover it.' },
      { t: 'Download', d: 'A locked copy of your PDF. Your original isn’t changed.' },
    ],
    faq: [
      {
        q: 'What’s the difference between the password and the permissions?',
        a: 'The password to open is the lock: without it, nobody can read the PDF. The permissions (no printing, copying or editing) are only requests that PDF apps are asked to follow. Most do, but anyone who can open the file can use tools that ignore them. So rely on the password, not the permissions.',
      },
      {
        q: 'Can you recover my password if I lose it?',
        a: 'No. We never see it. If it’s lost, the PDF can’t be opened, so write it down somewhere safe.',
      },
      {
        q: 'How strong is the lock?',
        a: 'It uses AES-256, the strongest encryption the PDF format has. How hard it is to break then depends on your password: longer and less guessable is stronger.',
      },
      {
        q: 'Will it open in other PDF apps?',
        a: 'Most current PDF apps can open it once you type the password. Very old PDF apps may not support this kind of lock.',
      },
      {
        q: 'Is my password sent anywhere?',
        a: 'No. The lock is made in your browser, on your device. The password and the PDF are never sent to KaamSolv.',
      },
      {
        q: 'How do I take the password off later?',
        a: 'Open the PDF with your password in your PDF app and save a copy without one. An unlock tool here is on the way.',
      },
    ],
    related: ['watermark-pdf', 'compress-pdf', 'merge-pdf'],
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
  blurb: 'Merge, split, rotate, compress and convert PDFs.',
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
      hero={task === 'hub' ? <HubHero limit={LIMIT}><PdfWorkspace task="hub" /></HubHero> : undefined}
      afterHero={task === 'hub' ? <><PopularTasks /><HubDirectory /><HubTrust /></> : undefined}
      slug={p.slug}
      tool={task === 'hub' ? HUB_TOOL : undefined}
      h1={p.h1}
      intro={p.intro}
      steps={p.steps}
      faq={p.faq}
      related={p.related}
      stage={task !== 'hub'}
    >
      {task === 'hub' ? null : (
        <PdfStage current={p.path}>
          <PdfWorkspace task={task} />
        </PdfStage>
      )}
    </ToolPageShell>
  );
}
