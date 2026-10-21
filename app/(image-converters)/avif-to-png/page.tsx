import { ConverterRoute, converterMetadata } from '@/app/_components/image/converter-route';

export const metadata = converterMetadata('avif-to-png');

export default function Page() {
  return <ConverterRoute slug="avif-to-png" />;
}
