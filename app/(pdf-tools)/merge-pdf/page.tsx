import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('merge');

export default function Page() {
  return <PdfToolPage task="merge" />;
}
