import { ConverterRoute, converterMetadata } from '@/app/_components/image/converter-route';

export const metadata = converterMetadata('jpg-to-png');

export default function Page() {
  return <ConverterRoute slug="jpg-to-png" />;
}
