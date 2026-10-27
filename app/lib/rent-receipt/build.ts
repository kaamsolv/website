/**
 * Form text → the receipts to print. Validates everything in one place (the page and the PDF
 * both use the result), and writes each receipt's wording once, so the on-screen preview and the
 * PDF cannot disagree. Framework-free.
 */

import { amountWords, figuresIndian, parseAmountText, type AmountParts } from '../invoice/words';
import { monthLabel, receiptDate, receiptMonths, type DateRule, type YearMonth } from './months';
import { cleanPan, cleanText, isValidPan, needsLandlordPan, needsRevenueStamp, payModeLabel, toPaise, type PayMode } from './rules';

export type ReceiptInput = {
  tenant: string;
  landlord: string;
  landlordPan: string;
  address: string;
  /** Monthly rent as typed: "25000", "25,000", "₹ 8,333.50". */
  rent: string;
  mode: PayMode;
  reference: string;
  dateRule: DateRule;
  from: YearMonth | null;
  to: YearMonth | null;
};

export type Field = 'tenant' | 'landlord' | 'landlordPan' | 'address' | 'rent' | 'months';

export const LIMITS = { name: 80, address: 200, reference: 40 } as const;
/** A sanity ceiling on monthly rent, in rupees (not a rule): above this it is almost certainly a typing slip. */
export const MAX_MONTHLY_RENT = 10_000_000;

export type Receipt = {
  monthLabel: string;
  dateLabel: string;
  /** "₹25,000" or "₹8,333.50" */
  figures: string;
  /** "Rupees Twenty-Five Thousand Only" */
  words: string;
  /** The main sentence on the receipt. */
  received: string;
  /** "Paid by UPI (Ref: 4021…)" */
  paidBy: string;
};

export type ReceiptSet = {
  receipts: Receipt[];
  tenant: string;
  landlord: string;
  /** Cleaned, upper-case, or '' when none was given. */
  landlordPan: string;
  address: string;
  /** A ₹1 revenue stamp box goes on each receipt. */
  stamp: boolean;
  /** Rent is above the yearly limit and no PAN was given: say so. */
  panMissing: boolean;
  /** "₹3,00,000" — all receipts together. */
  totalFigures: string;
};

export type BuildResult = { ok: true; set: ReceiptSet } | { ok: false; errors: Partial<Record<Field, string>> };

const fromPaise = (paise: bigint): AmountParts => ({ rupees: paise / BigInt(100), paise: Number(paise % BigInt(100)) });

export function buildReceipts(input: ReceiptInput): BuildResult {
  const errors: Partial<Record<Field, string>> = {};

  const tenant = cleanText(input.tenant, LIMITS.name);
  const landlord = cleanText(input.landlord, LIMITS.name);
  const address = cleanText(input.address, LIMITS.address);
  const reference = cleanText(input.reference, LIMITS.reference);
  const pan = cleanPan(input.landlordPan);

  if (tenant.length < 2) errors.tenant = 'Add the tenant’s name: that’s you.';
  if (landlord.length < 2) errors.landlord = 'Add the landlord’s name.';
  if (address.length < 3) errors.address = 'Add the address of the rented property.';
  if (pan && !isValidPan(pan)) errors.landlordPan = 'A PAN looks like ABCDE1234F: five letters, four digits, one letter.';

  const parsed = parseAmountText(input.rent);
  let monthly: AmountParts | null = null;
  if (!parsed.ok) errors.rent = parsed.empty ? 'Enter the monthly rent.' : parsed.message;
  else if (parsed.parts.rupees === BigInt(0) && parsed.parts.paise === 0) errors.rent = 'Enter the monthly rent.';
  else if (parsed.parts.rupees > BigInt(MAX_MONTHLY_RENT)) errors.rent = 'That looks too high for monthly rent. Check the amount.';
  else monthly = parsed.parts;

  const range = receiptMonths(input.from, input.to);
  if (!range.ok) errors.months = range.message;

  if (Object.keys(errors).length || !monthly || !range.ok) return { ok: false, errors };

  const monthlyPaise = toPaise(monthly.rupees, monthly.paise);
  const figures = `₹${figuresIndian(monthly)}`;
  const words = amountWords(monthly, 'cheque');
  const stamp = needsRevenueStamp(input.mode, monthlyPaise);
  const paidBy = `Paid by ${payModeLabel(input.mode)}${reference ? ` (Ref: ${reference})` : ''}.`;

  const receipts: Receipt[] = range.months.map((ym) => {
    const label = monthLabel(ym);
    return {
      monthLabel: label,
      dateLabel: receiptDate(ym, input.dateRule),
      figures,
      words,
      received: `Received with thanks from ${tenant} the sum of ${figures} (${words}) as rent for ${label}, for the property at ${address}.`,
      paidBy,
    };
  });

  return {
    ok: true,
    set: {
      receipts,
      tenant,
      landlord,
      landlordPan: pan,
      address,
      stamp,
      panMissing: !pan && needsLandlordPan(range.months, monthlyPaise),
      totalFigures: `₹${figuresIndian(fromPaise(monthlyPaise * BigInt(receipts.length)))}`,
    },
  };
}


/** "rent-receipts-April-2026-to-March-2027.pdf", or "rent-receipt-October-2026.pdf" for one month. */
export function rentPdfFilename(set: ReceiptSet): string {
  const slug = (label: string) => label.replace(/\s+/g, '-');
  const first = set.receipts[0]?.monthLabel ?? '';
  const last = set.receipts[set.receipts.length - 1]?.monthLabel ?? first;
  return set.receipts.length <= 1 ? `rent-receipt-${slug(first)}.pdf` : `rent-receipts-${slug(first)}-to-${slug(last)}.pdf`;
}
