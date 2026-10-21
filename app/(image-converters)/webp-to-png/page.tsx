import { ConverterRoute, converterMetadata } from '@/app/_components/image/converter-route';

export const metadata = converterMetadata('webp-to-png');

export default function Page() {
  return <ConverterRoute slug="webp-to-png" />;
}
