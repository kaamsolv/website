import { InvoiceEditor } from '@/app/_components/invoice/invoice-editor';
import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata(
  '/invoice-generator',
  'Invoice generator',
  'Make a professional invoice and download it as a PDF — free, no sign-up. Type straight onto the invoice; totals, tax and discount update as you go. INR, USD, EUR, GBP, AED.',
);

const STEPS = [
  { t: 'Type onto the invoice', d: 'Your details, your client, what you did. No form to fill first.' },
  { t: 'Watch the totals', d: 'Discount and tax are worked out as you type.' },
  { t: 'Download the PDF', d: 'A clean, one-page A4 invoice, ready to send.' },
];

const FAQ = [
  {
    q: 'Is it really free? Do I need an account?',
    a: 'Yes, it’s free and there’s no sign-up. You get a complete PDF invoice with a small “Made with KaamSolv” line at the bottom.',
  },
  {
    q: 'Is my invoice saved?',
    a: 'Without an account, your draft stays in this browser only — it isn’t uploaded, and a refresh doesn’t lose it. With a free account you can save up to 20 invoices, and your business details and logo are filled in for the next one.',
  },
  {
    q: 'Is this a GST-compliant tax invoice?',
    a: 'It’s a clean invoice with a tax line you can name GST, VAT or Tax. It doesn’t check GSTIN, HSN/SAC codes or e-invoicing rules — if you need a formal GST tax invoice, confirm the requirements with your accountant.',
  },
  {
    q: 'How are discount and tax worked out?',
    a: 'Subtotal, minus the discount (a percentage or a flat amount), then tax on what’s left. Every step is rounded to two decimals.',
  },
  {
    q: 'How many items can I add?',
    a: 'Up to 10 — that’s what fits on a clean one-page A4 invoice.',
  },
  {
    q: 'Which currencies can I use?',
    a: 'Indian rupee, US dollar, euro, British pound and UAE dirham. You choose — we never guess from your location.',
  },
];

export default function InvoiceGeneratorPage() {
  return (
    <ToolPageShell
      slug="invoice-generator"
      h1="Invoice generator"
      intro="Type straight onto the invoice. Download a clean PDF. No sign-up."
      steps={STEPS}
      faq={FAQ}
      related={['gst-calculator', 'discount-calculator', 'percentage-calculator']}
    >
      <InvoiceEditor />
    </ToolPageShell>
  );
}
