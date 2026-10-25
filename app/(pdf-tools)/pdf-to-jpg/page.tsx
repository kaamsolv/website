import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('pdf-to-jpg');

export default function Page() {
  return <PdfToolPage task="pdf-to-jpg" />;
}
