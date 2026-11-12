/**
 * The products shown in the workspace sidebar and on /app/products/<slug>.
 *
 * A "product" here is something you can subscribe to (or will be able to). Feature lists are written
 * from what the entitlement keys in `entitlements.ts` actually switch on; nothing here is a promise
 * beyond that. A product with `status: 'soon'` has no plan yet, so it never shows a subscribe button.
 * Prices are never here: the Plans and billing page reads them from the price list.
 */

import type { Accent, IconKey } from './catalogue';
import type { EntitlementKey } from './entitlements';

export type ProductSlug = 'invoices' | 'qr' | 'pdf';

export type Product = {
  slug: ProductSlug;
  name: string;
  /** The paid plan's name, e.g. "Invoice Pro". */
  planName: string;
  /** Billing plan key (plans and billing page anchor), or null while there is no plan. */
  planKey: 'invoice_pro' | 'qr_pro' | null;
  /** Holding this entitlement means the product is subscribed. */
  proKey: EntitlementKey | null;
  status: 'available' | 'soon';
  accent: Accent;
  icon: IconKey | 'toolbox';
  /** One line under the name. */
  promise: string;
  /** The workspace pages live under this path. */
  prefix: string;
  /** Where "open it" goes. */
  home: string;
  /** What you get with the paid plan. */
  pro: string[];
  /** What stays free. */
  free: string[];
};

export const PRODUCTS: Product[] = [
  {
    slug: 'invoices',
    name: 'Invoices',
    planName: 'Invoice Pro',
    planKey: 'invoice_pro',
    proKey: 'invoice_dashboard',
    status: 'available',
    accent: 'coral',
    icon: 'business',
    promise: 'Know what you have billed, what is unpaid and who to chase.',
    prefix: '/app/invoices',
    home: '/app/invoices',
    pro: [
      'A dashboard with billed, unpaid and overdue totals',
      'Payment reminders by email, by hand or on a schedule',
      'Recurring invoices',
      'Reports, CSV export and Accountant Connect',
      'Create invoices from a CSV file',
      'Invoice templates, your brand colour and quotations',
      'Currency reference rates on invoices',
      'No “Made with KaamSolv” line and no limit on items',
      'No ads anywhere on KaamSolv',
    ],
    free: ['Make and download invoices, no account needed', 'Save up to 20 invoices', 'Record payments against an invoice', 'Saved customers and items'],
  },
  {
    slug: 'qr',
    name: 'QR codes',
    planName: 'QR Pro',
    planKey: 'qr_pro',
    proKey: 'qr_campaigns',
    status: 'available',
    accent: 'teal',
    icon: 'toolbox',
    promise: 'Know which QR code is doing its job.',
    prefix: '/app/qr',
    home: '/app/qr',
    pro: [
      'Campaigns that group codes and show one set of results',
      'Scans by country, device and referrer, with a 90-day range',
      'CSV export of your codes and scans',
      'No limit on tracked codes (free accounts get 3)',
      'No ads anywhere on KaamSolv',
    ],
    free: ['Make and download QR codes, no account needed', '3 tracked codes with scan counts'],
  },
  {
    slug: 'pdf',
    name: 'PDF Bundle',
    planName: 'PDF Bundle',
    planKey: null,
    proKey: null,
    status: 'soon',
    accent: 'purple',
    icon: 'documents',
    promise: 'More room for bigger PDF jobs. It is not available yet.',
    prefix: '/app/products/pdf',
    home: '/pdf-tools',
    pro: [],
    free: ['All 14 PDF tools, in your browser, with nothing uploaded', 'No account needed'],
  },
];

export const productBySlug = (slug: string): Product | undefined => PRODUCTS.find((p) => p.slug === slug);

/** The page a not-yet-subscribed product row opens. */
export const productPageHref = (p: Product): string => `/app/products/${p.slug}`;
