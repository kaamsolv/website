import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { displayDate } from '@/app/lib/invoice/defaults';
import { isTaxInvoice, placeOfSupplyLabel } from '@/app/lib/invoice/gst-tax';
import { formatMoney } from '@/app/lib/invoice/money';
import { computeTotals } from '@/app/lib/invoice/totals';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { resolveLink, type SharedInvoice } from '@/db/invoice-links';

/**
 * A private invoice page (/i/<token>). Anyone with the address can read this one invoice and download its PDF,
 * until the link is turned off. It is never indexed, sends no referrer, and shows only what is on the invoice:
 * no account, customer or link identifier. A wrong, expired or revoked link is the same plain 404.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

async function load(token: string): Promise<SharedInvoice | null> {
  try {
    return await resolveLink(await getDb(), token);
  } catch (e) {
    console.error('[i/token]', formatErrorForLog(e));
    return null;
  }
}

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await load(token);
  if (!inv) notFound();

  const doc = inv.doc;
  const currency = inv.currency as CurrencyCode;
  const totals = computeTotals(doc);
  const money = (n: number) => formatMoney(n, currency);
  const taxInvoice = isTaxInvoice(doc);
  const paid = inv.status === 'paid' && inv.amountPaid > 0;
  const balance = Math.max(0, Math.round((inv.total - inv.amountPaid) * 100) / 100);

  return (
    <main id="main" className="min-h-screen bg-canvas px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <p className="mb-5 font-display text-xl font-extrabold tracking-tight text-ink">
          Kaam<span className="text-coral-500">Solv</span>
        </p>

        <article className="rounded-xl2 border border-hair bg-surface p-5 sm:p-8" aria-labelledby="inv-title">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 id="inv-title" className="font-display text-2xl font-extrabold text-ink">
                {doc.docType === 'bill_of_supply' ? 'Bill of supply' : taxInvoice ? 'Tax invoice' : 'Invoice'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                No. {inv.number}
                {inv.issueDate ? ` · ${displayDate(inv.issueDate)}` : ''}
              </p>
            </div>
            <span
              data-testid="invoice-status"
              className={`rounded-full px-3 py-1 text-sm font-bold ${paid ? 'bg-tealx-100 text-teal-700' : 'bg-yellowx-100 text-strong'}`}
            >
              {paid ? 'Paid' : balance < inv.total ? 'Part paid' : 'Unpaid'}
            </span>
          </header>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <section aria-label="From">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted">From</h2>
              <p className="mt-1 font-semibold text-ink">{doc.seller.name}</p>
              <p className="whitespace-pre-line text-sm text-strong">{doc.seller.address}</p>
              {doc.seller.gstin && <p className="text-sm text-strong">GSTIN: {doc.seller.gstin}</p>}
            </section>
            <section aria-label="Bill to">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Bill to</h2>
              <p className="mt-1 font-semibold text-ink">{doc.client.name}</p>
              {doc.client.address && <p className="whitespace-pre-line text-sm text-strong">{doc.client.address}</p>}
            </section>
          </div>
          {taxInvoice && totals.gst && <p className="mt-3 text-sm text-muted">Place of supply: {placeOfSupplyLabel(totals.gst.placeOfSupply)}</p>}

          <ul className="mt-6 divide-y divide-hair border-y border-hair" aria-label="Items">
            {doc.items.map((it, i) => (
              <li key={it.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{it.description}</p>
                  <p className="text-sm text-muted">
                    {it.qty} × {money(Number(it.rate.replace(/,/g, '')) || 0)}
                    {it.hsn ? ` · HSN/SAC ${it.hsn}` : ''}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-ink">{money(totals.lines[i]?.amount ?? 0)}</p>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1.5 text-sm">
            <Row label="Subtotal" value={money(totals.subtotal)} />
            {totals.discount > 0 && <Row label="Discount" value={`− ${money(totals.discount)}`} />}
            {totals.gst
              ? totals.gst.rows.flatMap((r) => [
                  ...(r.cgst || r.sgst
                    ? [
                        <Row key={`c${r.rate}`} label={`CGST ${r.rate / 2}%`} value={money(r.cgst)} />,
                        <Row key={`s${r.rate}`} label={`${totals.gst?.split === 'ut' ? 'UTGST' : 'SGST'} ${r.rate / 2}%`} value={money(r.sgst)} />,
                      ]
                    : []),
                  ...(r.igst ? [<Row key={`i${r.rate}`} label={`IGST ${r.rate}%`} value={money(r.igst)} />] : []),
                ])
              : totals.tax > 0 && <Row label={`${doc.taxLabel || 'Tax'} ${doc.taxRate}%`} value={money(totals.tax)} />}
            <div className="flex items-baseline justify-between border-t border-hair pt-2 text-base font-bold text-ink">
              <dt>Total</dt>
              <dd>{money(inv.total)}</dd>
            </div>
            {inv.amountPaid > 0 && <Row label="Received" value={money(inv.amountPaid)} />}
            {!paid && <Row label="Balance due" value={money(balance)} strong />}
            {inv.dueDate && !paid && <Row label="Due date" value={displayDate(inv.dueDate)} />}
          </dl>

          {doc.notes.trim() && <p className="mt-5 whitespace-pre-line text-sm text-muted">{doc.notes}</p>}

          <a
            href={`/i/${token}/pdf`}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-coral-500 px-6 font-bold text-navy-900 hover:bg-coral-600 hover:text-white sm:w-auto"
            data-testid="invoice-pdf"
          >
            Download PDF
          </a>
        </article>
        <p className="mt-4 text-center text-xs text-muted">Anyone with this link can open this invoice until it runs out.</p>
      </div>
    </main>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${strong ? 'font-bold text-ink' : 'text-strong'}`}>
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
