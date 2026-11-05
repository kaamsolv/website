import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('pdf-to-png');

export default function Page() {
  return <PdfToolPage task="pdf-to-png" />;
}
