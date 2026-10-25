/**
 * KaamSolv catalogue — the single list the homepage reads from.
 *
 * Source of truth: docs/kaamsolv-tool-catalogue.md (the 60-tool master
 * universe + 10 locked categories). This file is the typed, homepage-facing
 * slice of it: enough per tool to power search, the "popular" rail, and the
 * category grid. Per-tool SEO copy still lives with each tool when it ships.
 *
 * `status` is honest: every tool is `planned` until its route/component
 * actually exists. The homepage uses this to avoid promising a working tool
 * that isn't built yet — planned tools are shown as "on the way", never as
 * "use it now".
 */

export type CategoryName =
  | 'Money'
  | 'Work'
  | 'Business'
  | 'Documents'
  | 'Images & Files'
  | 'Writing'
  | 'Career'
  | 'Everyday'
  | 'India'
  | 'Creators';

/** Accent token families that already exist in the design system. */
export type Accent = 'coral' | 'yellow' | 'teal' | 'purple' | 'navy';

export type ToolStatus = 'live' | 'planned';

export type IconKey =
  | 'money'
  | 'work'
  | 'business'
  | 'documents'
  | 'images'
  | 'writing'
  | 'career'
  | 'everyday'
  | 'india'
  | 'creators';

export interface Category {
  name: CategoryName;
  slug: string;
  /** One plain line — what you'd reach for this group to do. */
  blurb: string;
  accent: Accent;
  icon: IconKey;
}

export interface Tool {
  name: string;
  slug: string;
  /** Canonical route (built in a later phase for planned tools). */
  url: string;
  category: CategoryName;
  /** Short, human — shown on cards and in search results. */
  blurb: string;
  /** Extra words people might actually type when looking for this. */
  keywords: string[];
  status: ToolStatus;
  /** Lower shows sooner in the "popular" rail; omitted = not featured. */
  popularRank?: number;
}

export const CATEGORIES: Category[] = [
  {
    name: 'Money',
    slug: 'money',
    blurb: 'Work out the numbers — tax, loans, take-home, percentages.',
    accent: 'yellow',
    icon: 'money',
  },
  {
    name: 'Work',
    slug: 'work',
    blurb: 'Links, dates, times and the small jobs between meetings.',
    accent: 'coral',
    icon: 'work',
  },
  {
    name: 'Business',
    slug: 'business',
    blurb: 'Invoices, quotes, QR codes — the paperwork of running one.',
    accent: 'purple',
    icon: 'business',
  },
  {
    name: 'Documents',
    slug: 'documents',
    blurb: 'Convert, merge and split PDFs and documents.',
    accent: 'purple',
    icon: 'documents',
  },
  {
    name: 'Images & Files',
    slug: 'images-files',
    blurb: 'Change formats, resize and compress — nothing leaves until you say so.',
    accent: 'teal',
    icon: 'images',
  },
  {
    name: 'Writing',
    slug: 'writing',
    blurb: 'Count it, clean it, change the case, fill it with placeholder.',
    accent: 'navy',
    icon: 'writing',
  },
  {
    name: 'Career',
    slug: 'career',
    blurb: 'Resumes, cover letters, notice periods and experience maths.',
    accent: 'teal',
    icon: 'career',
  },
  {
    name: 'Everyday',
    slug: 'everyday',
    blurb: 'Age, tips, splitting the bill, a quick countdown.',
    accent: 'yellow',
    icon: 'everyday',
  },
  {
    name: 'India',
    slug: 'india',
    blurb: 'GST, CTC, gratuity and rupees written out in words.',
    accent: 'navy',
    icon: 'india',
  },
  {
    name: 'Creators',
    slug: 'creators',
    blurb: 'Resize for socials, write a bio, make a favicon or a meme.',
    accent: 'coral',
    icon: 'creators',
  },
];

export const TOOLS: Tool[] = [
  // Money
  { name: 'GST Calculator', slug: 'gst-calculator', url: '/gst-calculator', category: 'Money', blurb: 'Add or remove GST, both ways, in seconds.', keywords: ['tax', 'gst', 'india', 'inclusive', 'exclusive', '18%'], status: 'live', popularRank: 1 },
  { name: 'EMI Calculator', slug: 'emi-calculator', url: '/emi-calculator', category: 'Money', blurb: 'Monthly payment on a loan, plus total interest.', keywords: ['loan', 'interest', 'home loan', 'car loan', 'installment'], status: 'live', popularRank: 2 },
  { name: 'Percentage Calculator', slug: 'percentage-calculator', url: '/percentage-calculator', category: 'Money', blurb: 'Percentages, increases and decreases without the second-guess.', keywords: ['percent', '%', 'change', 'of'], status: 'live' },
  { name: 'Discount Calculator', slug: 'discount-calculator', url: '/discount-calculator', category: 'Money', blurb: 'Final price after a discount, and what you saved.', keywords: ['sale', 'off', 'markdown', 'price'], status: 'live' },

  // Work
  { name: 'URL Shortener', slug: 'url-shortener', url: '/url-shortener', category: 'Work', blurb: 'Paste a long link, get a short one you can share anywhere.', keywords: ['short link', 'link', 'bitly', 'tiny', 'redirect'], status: 'live', popularRank: 0 },
  { name: 'UTM Builder', slug: 'utm-builder', url: '/generators/utm-builder', category: 'Work', blurb: 'Build tagged campaign links that analytics can read.', keywords: ['utm', 'campaign', 'tracking', 'source', 'medium'], status: 'planned' },
  { name: 'Time Calculator', slug: 'time-calculator', url: '/calculators/time-calculator', category: 'Work', blurb: 'Add and subtract hours and minutes.', keywords: ['hours', 'duration', 'add time', 'timesheet'], status: 'planned' },
  { name: 'Date Difference Calculator', slug: 'date-difference-calculator', url: '/calculators/date-difference-calculator', category: 'Work', blurb: 'Days, weeks and months between two dates.', keywords: ['days between', 'date diff', 'how long'], status: 'planned' },
  { name: 'Meeting Time Converter', slug: 'meeting-time-converter', url: '/calculators/meeting-time-converter', category: 'Work', blurb: 'One meeting time across everyone’s timezones.', keywords: ['timezone', 'time zone', 'ist', 'pst', 'schedule'], status: 'planned' },

  // Business
  { name: 'Invoice Generator', slug: 'invoice-generator', url: '/invoice-generator', category: 'Business', blurb: 'A clean, downloadable invoice in a couple of minutes.', keywords: ['bill', 'invoice', 'gst invoice', 'pdf'], status: 'live', popularRank: 5 },
  { name: 'Quotation Generator', slug: 'quotation-generator', url: '/generators/quotation-generator', category: 'Business', blurb: 'Send a tidy quote before you send the invoice.', keywords: ['quote', 'estimate', 'proposal'], status: 'planned' },
  { name: 'Receipt Generator', slug: 'receipt-generator', url: '/generators/receipt-generator', category: 'Business', blurb: 'Proof of payment, formatted and ready to send.', keywords: ['receipt', 'payment', 'acknowledgement'], status: 'planned' },
  { name: 'QR Code Generator', slug: 'qr-code-generator', url: '/qr-code-generator', category: 'Business', blurb: 'QR codes for links, Wi-Fi, contact cards and more.', keywords: ['qr', 'qr code', 'wifi qr', 'vcard', 'scan'], status: 'live' },
  { name: 'Profit Margin Calculator', slug: 'profit-margin-calculator', url: '/calculators/profit-margin-calculator', category: 'Business', blurb: 'Margin and markup from cost and price.', keywords: ['margin', 'markup', 'profit', 'cost price'], status: 'planned' },

  // Documents
  { name: 'PDF to Word', slug: 'pdf-to-word', url: '/documents/pdf-to-word', category: 'Documents', blurb: 'Turn a PDF into an editable Word document.', keywords: ['pdf', 'word', 'docx', 'convert', 'edit pdf'], status: 'planned', popularRank: 4 },
  { name: 'Compress PDF', slug: 'compress-pdf', url: '/compress-pdf', category: 'Documents', blurb: 'Make a PDF smaller for email and upload forms.', keywords: ['compress pdf', 'reduce pdf size', 'shrink pdf', 'pdf size', 'smaller pdf', 'kb'], status: 'live' },
  { name: 'Merge PDF', slug: 'merge-pdf', url: '/merge-pdf', category: 'Documents', blurb: 'Join several PDFs into a single file.', keywords: ['merge', 'combine pdf', 'join'], status: 'live' },
  { name: 'Split PDF', slug: 'split-pdf', url: '/split-pdf', category: 'Documents', blurb: 'Pull out the pages you need.', keywords: ['split', 'extract pages', 'separate'], status: 'live' },
  { name: 'PDF to JPG', slug: 'pdf-to-jpg', url: '/pdf-to-jpg', category: 'Documents', blurb: 'Every page of a PDF as a JPG image.', keywords: ['pdf to image', 'pdf to jpeg', 'pdf to picture', 'convert pdf', 'images'], status: 'live' },
  { name: 'JPG to PDF', slug: 'jpg-to-pdf', url: '/jpg-to-pdf', category: 'Documents', blurb: 'Combine photos and scans into one PDF.', keywords: ['jpg', 'image to pdf', 'scan', 'combine', 'photo to pdf', 'png to pdf'], status: 'live' },
  { name: 'Resume Generator', slug: 'resume-generator-documents', url: '/generators/resume-generator', category: 'Documents', blurb: 'Fill a clean template, download a polished resume.', keywords: ['resume', 'cv', 'template'], status: 'planned' },

  // Images & Files
  { name: 'JPG to PNG', slug: 'jpg-to-png', url: '/jpg-to-png', category: 'Images & Files', blurb: 'Convert JPG images to PNG in your browser.', keywords: ['jpg', 'jpeg', 'png', 'convert', 'transparent'], status: 'live', popularRank: 3 },
  { name: 'PNG to JPG', slug: 'png-to-jpg', url: '/png-to-jpg', category: 'Images & Files', blurb: 'Convert PNG images to smaller JPGs.', keywords: ['png', 'jpg', 'jpeg', 'compress'], status: 'live' },
  { name: 'JPG to WEBP', slug: 'jpg-to-webp', url: '/jpg-to-webp', category: 'Images & Files', blurb: 'Lighter images for the web, same picture.', keywords: ['webp', 'jpg', 'optimise', 'web'], status: 'live' },
  { name: 'PNG to WEBP', slug: 'png-to-webp', url: '/png-to-webp', category: 'Images & Files', blurb: 'PNG to WEBP for smaller web images.', keywords: ['png', 'webp', 'convert', 'web'], status: 'live' },
  { name: 'WEBP to JPG', slug: 'webp-to-jpg', url: '/webp-to-jpg', category: 'Images & Files', blurb: 'Get a WEBP into a format everything opens.', keywords: ['webp', 'jpg', 'jpeg', 'convert'], status: 'live' },
  { name: 'WEBP to PNG', slug: 'webp-to-png', url: '/webp-to-png', category: 'Images & Files', blurb: 'WEBP to PNG, processed on your device.', keywords: ['webp', 'png', 'convert'], status: 'live' },
  { name: 'HEIC to JPG', slug: 'heic-to-jpg', url: '/heic-to-jpg', category: 'Images & Files', blurb: 'iPhone HEIC photos to JPG, locally.', keywords: ['heic', 'heif', 'iphone', 'jpg', 'convert'], status: 'live' },
  { name: 'HEIC to PNG', slug: 'heic-to-png', url: '/heic-to-png', category: 'Images & Files', blurb: 'HEIC to PNG without uploading your photo.', keywords: ['heic', 'heif', 'iphone', 'png', 'convert'], status: 'live' },
  { name: 'AVIF to JPG', slug: 'avif-to-jpg', url: '/avif-to-jpg', category: 'Images & Files', blurb: 'AVIF to JPG in your browser.', keywords: ['avif', 'jpg', 'convert'], status: 'live' },
  { name: 'AVIF to PNG', slug: 'avif-to-png', url: '/avif-to-png', category: 'Images & Files', blurb: 'AVIF to PNG on your device.', keywords: ['avif', 'png', 'convert'], status: 'live' },
  { name: 'Image Compressor', slug: 'image-compressor', url: '/image-compressor', category: 'Images & Files', blurb: 'Shrink file size, keep it looking right.', keywords: ['compress', 'reduce size', 'optimise', 'smaller'], status: 'live' },
  { name: 'Resize Image to KB', slug: 'resize-image-in-kb', url: '/resize-image-in-kb', category: 'Images & Files', blurb: 'Hit the exact KB and size exam and job forms ask for.', keywords: ['resize image to kb', 'compress image to 50kb', '20kb', 'photo size', 'signature', 'passport size photo', 'exam form', 'kb'], status: 'live' },

  // Writing
  { name: 'Word Counter', slug: 'word-counter', url: '/word-counter', category: 'Writing', blurb: 'Words, characters, sentences and reading time.', keywords: ['word count', 'characters', 'essay', 'limit'], status: 'live' },
  { name: 'Character Counter', slug: 'character-counter', url: '/character-counter', category: 'Writing', blurb: 'Stay under the limit for bios, posts and meta tags.', keywords: ['character count', 'twitter', 'limit', 'sms'], status: 'live' },
  { name: 'Case Converter', slug: 'case-converter', url: '/case-converter', category: 'Writing', blurb: 'UPPER, lower, Title and Sentence case in a click.', keywords: ['uppercase', 'lowercase', 'title case', 'capitalise'], status: 'live' },
  { name: 'Text Cleaner', slug: 'text-cleaner', url: '/text-cleaner', category: 'Writing', blurb: 'Strip odd spacing, line breaks and formatting.', keywords: ['clean text', 'remove line breaks', 'whitespace', 'format'], status: 'live' },
  { name: 'Lorem Ipsum Generator', slug: 'lorem-ipsum-generator', url: '/lorem-ipsum-generator', category: 'Writing', blurb: 'Placeholder text, by the paragraph or word.', keywords: ['lorem', 'placeholder', 'dummy text', 'filler'], status: 'live' },

  // Career
  { name: 'Resume Builder', slug: 'resume-builder', url: '/generators/resume-builder', category: 'Career', blurb: 'A guided, step-by-step build for your resume.', keywords: ['resume', 'cv', 'builder', 'job'], status: 'planned' },
  { name: 'Cover Letter Generator', slug: 'cover-letter-generator', url: '/generators/cover-letter-generator', category: 'Career', blurb: 'A solid first draft you can make your own.', keywords: ['cover letter', 'application', 'job'], status: 'planned' },
  { name: 'Notice Period Calculator', slug: 'notice-period-calculator', url: '/calculators/notice-period-calculator', category: 'Career', blurb: 'Your last working day from the date you resign.', keywords: ['notice period', 'last day', 'resignation', 'lwd'], status: 'planned' },
  { name: 'Experience Calculator', slug: 'experience-calculator', url: '/calculators/experience-calculator', category: 'Career', blurb: 'Total years and months across every job.', keywords: ['work experience', 'total experience', 'tenure'], status: 'planned' },
  { name: 'LinkedIn Bio Generator', slug: 'linkedin-bio-generator', url: '/generators/linkedin-bio-generator', category: 'Career', blurb: 'A headline and About section that sound like you.', keywords: ['linkedin', 'bio', 'headline', 'about', 'profile'], status: 'planned' },

  // Everyday
  { name: 'Age Calculator', slug: 'age-calculator', url: '/age-calculator', category: 'Everyday', blurb: 'Your exact age — years, months and days.', keywords: ['age', 'birthday', 'date of birth', 'how old'], status: 'live' },
  { name: 'Tip Calculator', slug: 'tip-calculator', url: '/tip-calculator', category: 'Everyday', blurb: 'Tip and total, split however many ways.', keywords: ['tip', 'gratuity', 'restaurant', 'service'], status: 'live' },
  { name: 'Split Bill Calculator', slug: 'split-bill-calculator', url: '/split-bill-calculator', category: 'Everyday', blurb: 'Who owes what when the bill isn’t even.', keywords: ['split', 'bill', 'share', 'group', 'dinner'], status: 'live' },
  { name: 'Countdown Timer', slug: 'countdown-timer', url: '/generators/countdown-timer', category: 'Everyday', blurb: 'A full-screen countdown to any moment.', keywords: ['countdown', 'timer', 'new year', 'event'], status: 'planned' },
  { name: 'Random Number Generator', slug: 'random-number-generator', url: '/generators/random-number-generator', category: 'Everyday', blurb: 'Pick a number in a range — draws, raffles, decisions.', keywords: ['random', 'number', 'dice', 'pick', 'raffle'], status: 'planned' },

  // India
  { name: 'Indian Number to Words', slug: 'indian-number-to-words', url: '/generators/indian-number-to-words', category: 'India', blurb: 'Rupees in figures to words, lakh and crore style.', keywords: ['rupees in words', 'lakh', 'crore', 'cheque', 'amount in words'], status: 'planned' },
  { name: 'Indian Currency Converter', slug: 'indian-currency-converter', url: '/calculators/indian-currency-converter', category: 'India', blurb: 'Between lakh/crore and million/billion.', keywords: ['lakh to million', 'crore to million', 'convert'], status: 'planned' },
  { name: 'Salary Calculator', slug: 'salary-calculator', url: '/salary-calculator', category: 'India', blurb: 'Your CTC, turned into monthly in-hand salary.', keywords: ['ctc', 'in hand salary', 'take home', 'net pay', 'salary', 'pf', 'hra', 'gross', 'new tax regime', 'old tax regime', 'income tax'], status: 'live' },
  { name: 'Gratuity Calculator', slug: 'gratuity-calculator', url: '/calculators/gratuity-calculator', category: 'India', blurb: 'What you’re owed at the end of a long stint.', keywords: ['gratuity', 'payment of gratuity act', 'end of service'], status: 'planned' },

  // Creators
  { name: 'Instagram Image Resizer', slug: 'instagram-image-resizer', url: '/image-tools/instagram-image-resizer', category: 'Creators', blurb: 'Crop to post, story and reel sizes without guessing.', keywords: ['instagram', 'resize', 'story', 'reel', 'aspect ratio'], status: 'planned' },
  { name: 'Social Media Bio Generator', slug: 'social-media-bio-generator', url: '/generators/social-media-bio-generator', category: 'Creators', blurb: 'A short bio that fits the character limit.', keywords: ['bio', 'instagram bio', 'twitter bio', 'profile'], status: 'planned' },
  { name: 'Hashtag Generator', slug: 'hashtag-generator', url: '/generators/hashtag-generator', category: 'Creators', blurb: 'A relevant hashtag set from a few words.', keywords: ['hashtags', 'instagram', 'reach', 'tags'], status: 'planned' },
  { name: 'Favicon Generator', slug: 'favicon-generator', url: '/generators/favicon-generator', category: 'Creators', blurb: 'Every favicon size from one image.', keywords: ['favicon', 'icon', 'ico', 'site icon'], status: 'planned' },
  { name: 'Meme Generator', slug: 'meme-generator', url: '/generators/meme-generator', category: 'Creators', blurb: 'Top and bottom text on any image, fast.', keywords: ['meme', 'caption', 'image text'], status: 'planned' },
];

/** Live tools first, then planned; each group keeps its incoming order. */
export function liveFirst(tools: Tool[]): Tool[] {
  return [...tools.filter((t) => t.status === 'live'), ...tools.filter((t) => t.status !== 'live')];
}

export const LIVE_TOOLS: Tool[] = TOOLS.filter((t) => t.status === 'live');
export const LIVE_TOOL_COUNT = LIVE_TOOLS.length;

/**
 * Where a tool link should go. Planned tools have no page yet, so they point
 * at their "coming soon" entry on /tools instead of a 404.
 */
export function toolHref(tool: Tool): string {
  return tool.status === 'live' ? tool.url : `/tools#${tool.slug}`;
}

/** The featured rail, in the order it should render: live tools first, then by rank. */
export const POPULAR_TOOLS: Tool[] = liveFirst(
  TOOLS.filter((t) => t.popularRank != null).sort(
    (a, b) => (a.popularRank ?? 99) - (b.popularRank ?? 99),
  ),
);

export function toolsInCategory(category: CategoryName): Tool[] {
  return liveFirst(TOOLS.filter((t) => t.category === category));
}

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function toolCount(category: CategoryName): number {
  return TOOLS.filter((t) => t.category === category).length;
}

/**
 * Small, forgiving search. Ranks by where the match lands (name start >
 * name contains > keyword > category > blurb) so the obvious result is
 * first. No dependency, no index — 60 rows is nothing.
 */
export function searchTools(query: string, limit = 7): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  const scored = TOOLS.map((tool) => {
    const name = tool.name.toLowerCase();
    const blurb = tool.blurb.toLowerCase();
    const cat = tool.category.toLowerCase();
    const kw = tool.keywords.join(' ').toLowerCase();
    const haystack = `${name} ${cat} ${kw} ${blurb}`;

    // every term must appear somewhere
    if (!terms.every((t) => haystack.includes(t))) return null;

    let score = 0;
    if (name.startsWith(q)) score += 100;
    else if (name.includes(q)) score += 60;
    if (terms.every((t) => name.includes(t))) score += 25;
    if (terms.every((t) => kw.includes(t))) score += 15;
    if (cat.includes(q)) score += 10;
    score += Math.max(0, 6 - (tool.popularRank ?? 6));

    return { tool, score };
  }).filter((x): x is { tool: Tool; score: number } => x !== null);

  scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return scored.slice(0, limit).map((x) => x.tool);
}
