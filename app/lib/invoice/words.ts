/**
 * Amounts in words, the Indian way (lakh, crore): 53100 → "Rupees Fifty-Three
 * Thousand One Hundred Only". Framework-free. Used by the Invoice Generator and
 * by the "Indian Number to Words" tool (docs/products/indian-number-to-words.md).
 *
 * The invoice works with JS numbers (`indianNumberWords`, `rupeesInWords`). The
 * public tool types exact text, so it uses `parseAmountText` → `amountWords`,
 * which never touch floating point: no rounding of paise, no loss of digits.
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const DIGIT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

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

// BigInt() calls, not 123n literals: the project's TypeScript target predates BigInt literals.
const ZERO = BigInt(0);
const THOUSAND = BigInt(1000);
const LAKH = BigInt(100_000);
const CRORE = BigInt(10_000_000);

/** A whole number in Indian words, exact at any size: 1,25,00,000 → "One Crore Twenty-Five Lakh". Above a crore it keeps counting in crore. */
export function indianWordsBig(value: bigint): string {
  let n = value < ZERO ? -value : value;
  if (n === ZERO) return 'Zero';
  const parts: string[] = [];
  const crore = n / CRORE;
  n %= CRORE;
  const lakh = Number(n / LAKH);
  n %= LAKH;
  const thousand = Number(n / THOUSAND);
  const rest = Number(n % THOUSAND);
  if (crore) parts.push(`${indianWordsBig(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** A whole number in Indian words: 1,25,00,000 → "One Crore Twenty-Five Lakh". */
export function indianNumberWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (!Number.isFinite(n)) return '';
  return indianWordsBig(BigInt(n));
}

/** "Rupees Fifty-Three Thousand One Hundred and Fifty Paise Only". */
export function rupeesInWords(amount: number): string {
  const paise = Math.round((Math.abs(amount) % 1) * 100);
  const rupees = Math.floor(Math.abs(amount) + (paise === 100 ? 1 : 0));
  const p = paise === 100 ? 0 : paise;
  return `Rupees ${indianNumberWords(rupees)}${p ? ` and ${belowHundred(p)} Paise` : ''} Only`;
}

// ------------------------------------------------------------ the public tool

/** An amount typed as text, exactly: whole rupees and 0–99 paise. */
export type AmountParts = { rupees: bigint; paise: number };
export type ParsedAmount =
  | { ok: true; parts: AmountParts }
  | { ok: false; empty: boolean; message: string };

/**
 * The most integer digits the tool takes: up to 9,99,99,99,99,99,999 (99 lakh crore). One more digit and the crore
 * count itself passes a crore, so the words would repeat "Crore" ("Nine Crore … Crore"): correct, but unreadable.
 */
export const MAX_AMOUNT_DIGITS = 14;

const WESTERN_GROUPS = /^\d{1,3}(,\d{3})+$/; // 1,234,567
const INDIAN_GROUPS = /^\d{1,2}(,\d{2})*,\d{3}$/; // 12,34,567

/**
 * Reads what a person types: `1,25,000.50`, `125000`, `₹ 1,180.5`, `Rs. 500`, `.50`, `5.`.
 * Strict where a guess could change the amount: a comma that isn't a thousands separator
 * (1,5), more than two decimal places, a minus sign or letters are refused, not "fixed".
 */
export function parseAmountText(raw: string): ParsedAmount {
  const text = (raw ?? '').trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/\s+/g, '');
  if (!text) return { ok: false, empty: true, message: '' };
  if (text.startsWith('-') || text.startsWith('−')) return { ok: false, empty: false, message: 'Negative amounts aren’t supported. Enter the amount without a minus sign.' };
  const m = /^([\d,]*)(?:\.(\d*))?$/.exec(text);
  if (!m || !/\d/.test(text)) return { ok: false, empty: false, message: 'Use digits only, like 125000 or 1,25,000.50.' };

  const intText = m[1];
  const decimals = m[2] ?? '';
  if (intText.includes(',') && !WESTERN_GROUPS.test(intText) && !INDIAN_GROUPS.test(intText)) {
    return { ok: false, empty: false, message: 'Check the commas. Write 1,25,000 or 125000, with a comma only before each group of digits.' };
  }
  const digits = intText.replace(/,/g, '').replace(/^0+(?=\d)/, '');
  if (digits.length > MAX_AMOUNT_DIGITS) return { ok: false, empty: false, message: `That’s bigger than this tool handles (up to ${MAX_AMOUNT_DIGITS} digits).` };
  if (decimals.length > 2 && /[1-9]/.test(decimals.slice(2))) return { ok: false, empty: false, message: 'Paise go up to 2 decimal places, like 1180.50.' };

  const paise = Number((decimals + '00').slice(0, 2));
  return { ok: true, parts: { rupees: BigInt(digits || '0'), paise } };
}

/** 1250000 → "12,50,000": Indian grouping (last three digits, then pairs). */
export function groupIndian(digits: string): string {
  const d = digits.replace(/^0+(?=\d)/, '');
  if (d.length <= 3) return d;
  const head = d.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${d.slice(-3)}`;
}

/** The amount as it would be written in figures: "1,25,000" or "1,25,000.50". */
export function figuresIndian({ rupees, paise }: AmountParts): string {
  return `${groupIndian(rupees.toString())}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`;
}

export type WordsStyle = 'cheque' | 'plain';

/**
 * `cheque`: "Rupees One Lakh Twenty-Five Thousand and Fifty Paise Only" (".50" alone: "Fifty Paise Only";
 * nothing at all: "Rupees Zero Only"). `plain`: the number as words, decimals read digit by digit:
 * "One Lakh Twenty-Five Thousand Point Five Zero".
 */
export function amountWords({ rupees, paise }: AmountParts, style: WordsStyle): string {
  if (style === 'plain') {
    const whole = indianWordsBig(rupees);
    if (!paise) return whole;
    const frac = String(paise).padStart(2, '0');
    return `${whole} Point ${[...frac].map((c) => DIGIT_WORDS[Number(c)]).join(' ')}`;
  }
  if (rupees === ZERO && paise) return `${belowHundred(paise)} Paise Only`;
  return `Rupees ${indianWordsBig(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`;
}
