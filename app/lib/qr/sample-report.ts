/**
 * The illustrative sample on the QR Pro page: a static QR code and a made-up scan report beside it.
 *
 * NOTHING here comes from anyone's account. The numbers are invented to show the layout and are
 * labelled "illustrative" wherever they appear. The QR grid is precomputed (so the `qrcode` library is
 * not shipped for decoration); test/qr-pro-page.test.mts checks it still equals what the generator
 * produces for SAMPLE_URL, so if that address ever changes the test fails and the grid is regenerated.
 */

/** The production free QR generator. Scanning the sample code opens it. */
export const SAMPLE_URL = 'https://kaamsolv.com/qr-code-generator';
export const SAMPLE_QR_SIZE = 29;
/** Row-major, '1' = dark module (error correction M). */
export const SAMPLE_QR_ROWS: readonly string[] = [
  '11111110011101110001001111111',
  '10000010100110110001101000001',
  '10111010001010000010101011101',
  '10111010010100111001101011101',
  '10111010110000010111001011101',
  '10000010001110011111101000001',
  '11111110101010101010101111111',
  '00000000000101010110100000000',
  '10101010000000101101100010010',
  '01110101001000001100001001001',
  '00101010110011001110001110111',
  '01000100110000000111101010010',
  '11001111011010000101111001011',
  '10010100010001001000111001001',
  '11001010100100100100010111011',
  '01001101111111111110101101010',
  '10101010100010101101111001011',
  '01001101100010101100111001101',
  '10111011110001001000010110011',
  '01011001011110001100010101010',
  '10001110001000011100111110000',
  '00000000100111001101100010111',
  '11111110001000100001101011011',
  '10000010011011111110100011011',
  '10111010110110101110111110011',
  '10111010001001101001100110111',
  '10111010100100100001010111001',
  '10000010011000001111100010010',
  '11111110110111101100100000011',
];

/** Ninety made-up daily scan counts: a weekly rhythm, a slow rise, and two busy spells (an event, a flyer drop). Pure integers, no randomness. */
export function sampleDays(): number[] {
  const week = [4, 5, 5, 6, 7, 11, 10];
  const bumps: Record<number, number> = { 28: 14, 29: 22, 30: 18, 31: 9, 60: 16, 61: 26, 62: 12 };
  return Array.from({ length: 90 }, (_, i) => week[i % 7] + Math.floor(i / 10) + (bumps[i] ?? 0));
}

export const SAMPLE_BREAKDOWNS: { title: string; items: { label: string; percent: number }[] }[] = [
  { title: 'Where (country)', items: [{ label: 'India', percent: 71 }, { label: 'United Arab Emirates', percent: 12 }, { label: 'United States', percent: 9 }, { label: 'Other', percent: 8 }] },
  { title: 'Device type', items: [{ label: 'mobile', percent: 82 }, { label: 'desktop', percent: 13 }, { label: 'tablet', percent: 5 }] },
  { title: 'Referring site', items: [{ label: 'Direct or unknown', percent: 64 }, { label: 'news.example', percent: 22 }, { label: 'blog.example', percent: 14 }] },
];
