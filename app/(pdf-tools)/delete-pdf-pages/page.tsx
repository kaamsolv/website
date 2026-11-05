import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('delete');

export default function Page() {
  return <PdfToolPage task="delete" />;
}
