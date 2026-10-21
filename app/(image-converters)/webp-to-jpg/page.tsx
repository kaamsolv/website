import { ConverterRoute, converterMetadata } from '@/app/_components/image/converter-route';

export const metadata = converterMetadata('webp-to-jpg');

export default function Page() {
  return <ConverterRoute slug="webp-to-jpg" />;
}
