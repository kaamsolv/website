/**
 * How people say what they want, for the search box: one action-first phrase per live tool ("Make an invoice",
 * "Convert HEIC to JPG") plus a few other ways they might put it. Kept beside the catalogue rather than inside every row:
 * the catalogue stays the single list of tools, and this only adds words to match and a better label to show.
 * test/search-actions.test.mts fails if a live tool has no phrase, so a new tool can't ship without one.
 */

export type ToolAction = { action: string; also?: string[] };

export const TOOL_ACTIONS: Record<string, ToolAction> = {
  // Money
  'gst-calculator': { action: 'Calculate GST', also: ['add gst', 'remove gst', 'gst on a price', 'tax on a bill'] },
  'emi-calculator': { action: 'Work out a loan EMI', also: ['loan emi', 'monthly payment', 'home loan', 'car loan'] },
  'percentage-calculator': { action: 'Work out a percentage', also: ['percent', 'increase', 'decrease'] },
  'discount-calculator': { action: 'Find the price after a discount', also: ['sale price', 'discount', 'markdown'] },
  'sip-calculator': { action: 'See what a SIP could grow to', also: ['mutual fund', 'monthly investment', 'step up sip'] },
  'fd-calculator': { action: 'Calculate fixed deposit returns', also: ['fd maturity', 'bank interest', 'fixed deposit'] },
  'rd-calculator': { action: 'Calculate recurring deposit returns', also: ['rd maturity', 'post office rd', 'recurring deposit'] },
  'sip-vs-fd-vs-rd-calculator': { action: 'Compare SIP, FD and RD', also: ['which is better', 'compare investments'] },
  'simple-interest-calculator': { action: 'Calculate simple interest', also: ['interest on a loan', 'principal'] },
  'compound-interest-calculator': { action: 'Calculate compound interest', also: ['interest on interest', 'savings growth'] },
  // Work and Business
  'url-shortener': { action: 'Shorten a link', also: ['short url', 'make a link shorter', 'shorten url'] },
  'invoice-generator': { action: 'Make an invoice', also: ['create an invoice', 'bill a client', 'gst invoice', 'make a bill'] },
  'qr-code-generator': { action: 'Make a QR code', also: ['create a qr code', 'wifi qr', 'upi qr', 'qr for a link'] },
  'coupon-code-generator': { action: 'Make coupon codes', also: ['create coupon codes', 'discount codes', 'promo codes', 'voucher codes', 'generate coupons'] },
  // Documents
  'pdf-to-word': { action: 'Turn a PDF into Word', also: ['pdf to docx', 'edit a pdf', 'convert pdf to word'] },
  'compress-pdf': { action: 'Make a PDF smaller', also: ['shrink a pdf', 'reduce pdf size', 'pdf too big'] },
  'merge-pdf': { action: 'Combine PDFs into one', also: ['join pdfs', 'merge pdf files'] },
  'split-pdf': { action: 'Split a PDF', also: ['extract pages', 'separate a pdf', 'cut a pdf'] },
  'rotate-pdf': { action: 'Rotate a PDF', also: ['turn a pdf', 'sideways pdf', 'flip pages'] },
  'delete-pdf-pages': { action: 'Remove pages from a PDF', also: ['delete pages', 'cut pages'] },
  'rearrange-pdf-pages': { action: 'Reorder PDF pages', also: ['change page order', 'move pages'] },
  'add-page-numbers-to-pdf': { action: 'Add page numbers to a PDF', also: ['number pages', 'pagination'] },
  'pdf-to-png': { action: 'Convert a PDF to PNG', also: ['pdf to image', 'pdf to picture'] },
  'pdf-to-text': { action: 'Copy the text out of a PDF', also: ['extract text', 'pdf to txt'] },
  'watermark-pdf': { action: 'Add a watermark to a PDF', also: ['stamp a pdf', 'confidential stamp', 'draft stamp'] },
  'protect-pdf': { action: 'Put a password on a PDF', also: ['lock a pdf', 'encrypt a pdf', 'secure a pdf'] },
  'pdf-to-jpg': { action: 'Convert a PDF to JPG', also: ['pdf to image', 'pdf to jpeg'] },
  'jpg-to-pdf': { action: 'Turn photos into a PDF', also: ['image to pdf', 'scan to pdf', 'png to pdf'] },
  // Images
  'jpg-to-png': { action: 'Convert JPG to PNG', also: ['jpeg to png', 'transparent background'] },
  'png-to-jpg': { action: 'Convert PNG to JPG', also: ['png to jpeg', 'make a png smaller'] },
  'jpg-to-webp': { action: 'Convert JPG to WEBP', also: ['jpeg to webp', 'lighter web image'] },
  'png-to-webp': { action: 'Convert PNG to WEBP', also: ['lighter web image'] },
  'webp-to-jpg': { action: 'Convert WEBP to JPG', also: ['open a webp', 'webp to jpeg'] },
  'webp-to-png': { action: 'Convert WEBP to PNG', also: ['open a webp'] },
  'heic-to-jpg': { action: 'Convert HEIC to JPG', also: ['iphone photo to jpg', 'heif to jpg', 'open heic'] },
  'heic-to-png': { action: 'Convert HEIC to PNG', also: ['iphone photo to png', 'heif to png'] },
  'avif-to-jpg': { action: 'Convert AVIF to JPG', also: ['open an avif'] },
  'avif-to-png': { action: 'Convert AVIF to PNG', also: ['open an avif'] },
  'image-compressor': { action: 'Make an image smaller', also: ['compress an image', 'reduce photo size', 'shrink a photo'] },
  'resize-image-in-kb': { action: 'Resize an image to exact KB', also: ['photo under 50kb', 'signature size', 'exam form photo', 'passport photo size'] },
  // Writing
  'word-counter': { action: 'Count words', also: ['word count', 'essay length'] },
  'character-counter': { action: 'Count characters', also: ['character limit', 'bio length', 'tweet length'] },
  'case-converter': { action: 'Change text case', also: ['uppercase', 'lowercase', 'title case', 'capitalise'] },
  'text-cleaner': { action: 'Clean up text', also: ['remove line breaks', 'strip extra spaces', 'tidy pasted text'] },
  'lorem-ipsum-generator': { action: 'Make placeholder text', also: ['dummy text', 'lorem ipsum', 'filler text'] },
  // Everyday and India
  'age-calculator': { action: 'Work out an age', also: ['how old', 'date of birth', 'birthday'] },
  'tip-calculator': { action: 'Work out a tip', also: ['restaurant tip', 'service charge'] },
  'split-bill-calculator': { action: 'Split a bill', also: ['share a dinner bill', 'who owes what'] },
  'rent-receipt-generator': { action: 'Make rent receipts', also: ['hra receipt', 'landlord receipt', 'rent receipt format'] },
  'indian-number-to-words': { action: 'Write an amount in words', also: ['rupees in words', 'cheque amount', 'lakh crore'] },
  'salary-calculator': { action: 'Work out take-home salary', also: ['ctc to in hand', 'in hand salary', 'net pay'] },
  'gratuity-calculator': { action: 'Calculate gratuity', also: ['end of service', 'resignation payout'] },
  'hra-calculator': { action: 'Work out your HRA exemption', also: ['tax free hra', 'house rent allowance'] },
};

/** What the search box offers before anyone types: the jobs people most often come for, as actions. Slugs from the catalogue. */
export const SUGGESTED_TASKS: string[] = [
  'invoice-generator',
  'qr-code-generator',
  'heic-to-jpg',
  'compress-pdf',
  'gst-calculator',
  'url-shortener',
];

/** Words that carry no meaning in a request ("I want to make an invoice"). Ignored when other words are present. */
export const SEARCH_FILLER = new Set(['a', 'an', 'the', 'to', 'my', 'me', 'of', 'in', 'into', 'for', 'from', 'on', 'and', 'i', 'want', 'need', 'how', 'do', 'can', 'please', 'some']);

export const actionOf = (slug: string): string | undefined => TOOL_ACTIONS[slug]?.action;
