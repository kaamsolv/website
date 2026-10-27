'use client';

import { useId } from 'react';
import { formatMoney } from '@/app/lib/invoice/money';
import { monthEnd, monthLabel } from '@/app/lib/invoice/collections';
import { invoicesHref } from '@/app/lib/invoice/filters';
import type { CurrencyCode } from '@/app/lib/invoice/types';

type Month = { month: string; invoiced: number; invoicedCount: number; received: number; receivedCount: number };
type Bucket = { bucket: 'not_due' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'; label: string; amount: number; count: number };

const monthFrom = (m: string) => `${m}-01`;

/** Where a month's bar goes: invoices issued that month, or invoices that took a payment that month. */
const issuedLink = (m: string, currency: CurrencyCode) => invoicesHref({ currency, issuedFrom: monthFrom(m), issuedTo: monthEnd(monthFrom(m)) });
const receivedLink = (m: string, currency: CurrencyCode) => invoicesHref({ currency, paidFrom: monthFrom(m), paidTo: monthEnd(monthFrom(m)) });

/**
 * Invoiced vs received, month by month, as plain SVG (no chart library — same approach as the QR scan chart).
 * The two series are told apart by pattern and position, not colour alone, with the legend in words; every bar
 * is a real link (keyboard-focusable) with an accessible name that carries the amount; and the same numbers are
 * available as a table below. On a phone the chart scrolls sideways instead of shrinking its labels.
 */
export function MonthlyChart({ months, currency }: { months: Month[]; currency: CurrencyCode }) {
  const id = useId().replace(/:/g, '');
  const n = months.length;
  const max = Math.max(1, ...months.flatMap((m) => [m.invoiced, m.received]));
  const H = 180;
  // The drawing is sized so it shows at about natural scale: on a phone it scrolls rather than shrinking its labels,
  // and on a desktop it is only a little larger than drawn.
  const W = Math.max(n * 56, 560);
  const barW = Math.min(22, (W / n) * 0.3);
  const labelEvery = n > 12 ? 2 : 1;
  const totalInvoiced = months.reduce((s, m) => s + m.invoiced, 0);
  const totalReceived = months.reduce((s, m) => s + m.received, 0);
  const summary = `Invoiced ${formatMoney(totalInvoiced, currency)} and received ${formatMoney(totalReceived, currency)} across ${n} month${n === 1 ? '' : 's'}.`;

  const bar = (value: number, x: number, fill: string, label: string, href: string) => {
    const h = value <= 0 ? 0 : Math.max(3, (value / max) * (H - 14));
    const rect = <rect x={x} y={H - h} width={barW} height={h} rx="2" fill={fill} stroke="var(--color-ink)" strokeOpacity="0.55" strokeWidth={h ? 1 : 0} />;
    return value > 0 ? (
      <a href={href} aria-label={label} className="outline-none focus-visible:[&>rect]:stroke-[3]">
        <title>{label}</title>
        {rect}
      </a>
    ) : (
      rect
    );
  };

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold text-ink" aria-hidden="true">
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="14" aria-hidden="true">
            <rect width="18" height="14" rx="2" fill={`url(#${id}-hatch)`} stroke="var(--color-ink)" strokeOpacity="0.55" />
          </svg>
          Invoiced
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="14" aria-hidden="true">
            <rect width="18" height="14" rx="2" fill="var(--color-teal-500)" stroke="var(--color-ink)" strokeOpacity="0.55" />
          </svg>
          Received
        </span>
        <span className="ml-auto font-normal text-muted">Tallest bar: {formatMoney(max === 1 && totalInvoiced + totalReceived === 0 ? 0 : max, currency)}</span>
      </div>

      <div className="overflow-x-auto rounded-lg" tabIndex={0} role="region" aria-label="Monthly chart — scroll sideways on a small screen">
        <svg viewBox={`0 0 ${W} ${H + 24}`} role="group" aria-label={summary} style={{ minWidth: W, width: '100%' }} className="block h-auto">
          <defs>
            <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--color-navy-100)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-navy-500)" strokeWidth="2.5" />
            </pattern>
          </defs>
          <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" strokeOpacity="0.3" className="text-ink" />
          {months.map((m, i) => {
            const x0 = i * (W / n) + (W / n - (barW * 2 + 4)) / 2;
            return (
              <g key={m.month}>
                {bar(
                  m.invoiced,
                  x0,
                  `url(#${id}-hatch)`,
                  `${monthLabel(m.month)}: invoiced ${formatMoney(m.invoiced, currency)} on ${m.invoicedCount} invoice${m.invoicedCount === 1 ? '' : 's'}. View those invoices.`,
                  issuedLink(m.month, currency),
                )}
                {bar(
                  m.received,
                  x0 + barW + 4,
                  'var(--color-teal-500)',
                  `${monthLabel(m.month)}: received ${formatMoney(m.received, currency)} in ${m.receivedCount} payment${m.receivedCount === 1 ? '' : 's'}. View the invoices paid.`,
                  receivedLink(m.month, currency),
                )}
                {i % labelEvery === 0 && (
                  <text x={x0 + barW + 2} y={H + 17} textAnchor="middle" fontSize="12" className="fill-current text-muted">
                    {monthLabel(m.month)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="mt-2 text-sm text-muted">{summary}</figcaption>

      <details className="mt-3 rounded-lg border border-hair bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">View as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <caption className="sr-only">Invoiced and received by month, in {currency}</caption>
            <thead>
              <tr className="border-b border-hair text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">Month</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Invoiced</th>
                <th scope="col" className="py-2 text-right font-semibold">Received</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-b border-hair last:border-0">
                  <th scope="row" className="py-2 pr-3 font-semibold text-ink">{monthLabel(m.month)}</th>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {m.invoiced > 0 ? (
                      <a href={issuedLink(m.month, currency)} className="underline underline-offset-2 hover:text-coral-600">
                        {formatMoney(m.invoiced, currency)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {m.received > 0 ? (
                      <a href={receivedLink(m.month, currency)} className="underline underline-offset-2 hover:text-coral-600">
                        {formatMoney(m.received, currency)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

const BUCKET_BAR: Record<Bucket['bucket'], string> = {
  not_due: 'bg-navy-300',
  d1_30: 'bg-yellow-500',
  d31_60: 'bg-coral-500',
  d61_90: 'bg-coral-600',
  d90_plus: 'bg-coral-700',
};

/**
 * Outstanding by age, as a list of five rows: label, how many invoices, the balance, and a bar sized to the
 * biggest bucket. Each row with invoices in it is a link to exactly those invoices. Built from HTML rather than
 * SVG so it reads and tabs like any list.
 */
export function AgeingRows({ buckets, currency, today }: { buckets: Bucket[]; currency: CurrencyCode; today: string }) {
  const max = Math.max(...buckets.map((b) => b.amount), 0);
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  return (
    <div>
      <ul aria-label={`Outstanding by age, as of ${today}`} className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
        {buckets.map((b) => {
          const width = b.amount > 0 && max > 0 ? Math.max(2, Math.round((b.amount / max) * 100)) : 0;
          const body = (
            <>
              <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-semibold text-ink">{b.label}</span>
                <span className="tabular-nums text-ink">
                  <span className="font-semibold" data-testid={`age-${b.bucket}`}>{formatMoney(b.amount, currency)}</span>
                  <span className="ml-2 text-sm text-muted">
                    {b.count} invoice{b.count === 1 ? '' : 's'}
                  </span>
                </span>
              </span>
              <span className="mt-2 block h-2.5 overflow-hidden rounded-full bg-wash ring-1 ring-inset ring-hair" aria-hidden="true">
                <span className={`block h-full rounded-full ${BUCKET_BAR[b.bucket]}`} style={{ width: `${width}%` }} />
              </span>
            </>
          );
          return (
            <li key={b.bucket}>
              {b.count > 0 ? (
                <a
                  href={invoicesHref({ currency, bucket: b.bucket })}
                  aria-label={`${b.label}: ${formatMoney(b.amount, currency)} on ${b.count} invoice${b.count === 1 ? '' : 's'}. View them.`}
                  className="block p-4 hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coral-500"
                >
                  {body}
                </a>
              ) : (
                <div className="p-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Together: <span className="font-semibold text-ink">{formatMoney(total, currency)}</span> — the same as Outstanding above. Age is days past the due date, counted from today ({today}); an invoice with no due date counts as not yet due.
      </p>
    </div>
  );
}
