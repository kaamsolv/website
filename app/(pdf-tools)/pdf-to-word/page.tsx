import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('pdf-to-word');

export default function Page() {
  return <PdfToolPage task="pdf-to-word" />;
}
