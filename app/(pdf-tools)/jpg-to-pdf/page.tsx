import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('jpg-to-pdf');

export default function Page() {
  return <PdfToolPage task="jpg-to-pdf" />;
}
