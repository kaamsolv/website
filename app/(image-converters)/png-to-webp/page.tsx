import { ConverterRoute, converterMetadata } from '@/app/_components/image/converter-route';

export const metadata = converterMetadata('png-to-webp');

export default function Page() {
  return <ConverterRoute slug="png-to-webp" />;
}
