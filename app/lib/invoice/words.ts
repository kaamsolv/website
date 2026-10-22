/**
 * Amounts in words, the Indian way (lakh, crore): 53100 → "Rupees Fifty-Three
 * Thousand One Hundred Only". Framework-free. Also the start of the catalogue's
 * "Indian Number to Words" tool.
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/** A whole number in Indian words: 1,25,00,000 → "One Crore Twenty-Five Lakh". */
export function indianNumberWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${indianNumberWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}

/** "Rupees Fifty-Three Thousand One Hundred and Fifty Paise Only". */
export function rupeesInWords(amount: number): string {
  const paise = Math.round((Math.abs(amount) % 1) * 100);
  const rupees = Math.floor(Math.abs(amount) + (paise === 100 ? 1 : 0));
  const p = paise === 100 ? 0 : paise;
  return `Rupees ${indianNumberWords(rupees)}${p ? ` and ${belowHundred(p)} Paise` : ''} Only`;
}
