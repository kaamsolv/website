import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('page-numbers');

export default function Page() {
  return <PdfToolPage task="page-numbers" />;
}
