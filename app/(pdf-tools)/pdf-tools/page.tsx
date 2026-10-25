import { PdfToolPage, pdfMetadata } from '@/app/_components/pdf/pdf-tool-page';

export const metadata = pdfMetadata('hub');

export default function Page() {
  return <PdfToolPage task="hub" />;
}
