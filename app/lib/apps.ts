/**
 * KaamSolv's applications: the few substantial products (they have their own workspace or a whole
 * suite of tools), shown larger than ordinary utilities on the homepage and in the Products menu.
 * Kept apart from `Tool` on purpose: an app is not one catalogue row (the PDF bundle is fourteen).
 *
 * An app is shown only while the catalogue says the tool(s) it stands on are live, so the homepage
 * can never feature something that doesn't work. Add an entry here to feature a new application.
 */

import { TOOLS, type Accent, type CategoryName, type IconKey } from './catalogue';
import { PDF_TOOLS } from './pdf/tools';

export type AppEntry = {
  id: string;
  name: string;
  blurb: string;
  /** One short sentence for the homepage panel. */
  short: string;
  category: CategoryName;
  accent: Accent;
  icon: IconKey | 'toolbox';
  /** Where the app's call to action goes. */
  href: string;
  cta: string;
  /** Catalogue slugs that must all be live for this app to be shown. */
  needs: string[];
  /** Every catalogue tool that belongs to this app (so the homepage doesn't list them again as separate tools). */
  owns: string[];
  /** A few plain facts shown on the card. */
  points: string[];
};

export const APPS: AppEntry[] = [
  {
    id: 'invoice',
    name: 'Invoice Generator',
    blurb: 'Type straight onto the invoice and download a clean PDF. GST, discounts and five currencies. No sign-up.',
    short: 'Type onto the invoice and download a clean PDF. GST ready, no sign-up.',
    category: 'Business',
    accent: 'coral',
    icon: 'business',
    href: '/invoice-generator',
    cta: 'Make an invoice',
    needs: ['invoice-generator'],
    owns: ['invoice-generator'],
    points: ['GST tax invoices', 'Save with a free account'],
  },
  {
    id: 'pdf',
    name: 'PDF Bundle',
    blurb: 'Merge, split, compress, rotate, convert, watermark and protect PDFs. Your files stay on your device.',
    short: 'Merge, split, compress and convert PDFs. Your files stay on your device.',
    category: 'Documents',
    accent: 'purple',
    icon: 'documents',
    href: '/pdf-tools',
    cta: 'Open PDF tools',
    needs: ['merge-pdf', 'split-pdf', 'compress-pdf'],
    owns: PDF_TOOLS.filter((t) => t.status === 'live').map((t) => t.slug),
    points: ['14 PDF tools', 'Nothing uploaded'],
  },
  {
    id: 'qr',
    name: 'QR Studio',
    blurb: 'QR codes for links, Wi-Fi, UPI, contacts and more. Style them, download PNG or SVG, or track the scans.',
    short: 'QR codes for links, Wi-Fi, UPI and more. Style them, or track the scans.',
    category: 'Business',
    accent: 'teal',
    icon: 'toolbox',
    href: '/qr-code-generator',
    cta: 'Make a QR code',
    needs: ['qr-code-generator'],
    owns: ['qr-code-generator'],
    points: ['PNG and SVG', 'Optional scan tracking'],
  },
];

/** The applications that work today, in order. */
export function featuredApps(): AppEntry[] {
  return APPS.filter((a) => a.needs.every((slug) => TOOLS.find((t) => t.slug === slug)?.status === 'live'));
}

/** Catalogue slugs that belong to a featured application: the homepage shows these through the application, not again as tools. */
export function appOwnedSlugs(): Set<string> {
  return new Set(APPS.flatMap((a) => a.owns));
}
