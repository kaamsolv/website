import { ConverterRoute, converterMetadata } from '@/app/_components/image/converter-route';

export const metadata = converterMetadata('heic-to-png');

export default function Page() {
  return <ConverterRoute slug="heic-to-png" />;
}
