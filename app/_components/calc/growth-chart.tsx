'use client';

import { useId, useState } from 'react';
import { Segmented } from '../choice';
import type { YearRow } from '@/app/lib/calc/interest';
import { formatRupees } from '@/app/lib/calc/everyday';

const W = 560;
const H = 230;
const LEFT = 52;
const RIGHT = 10;
const TOP = 10;
const BOTTOM = 26;

/** "₹11.6 lakh", "₹1.2 crore", "₹45,000": the short Indian way of saying a big amount. */
export function shortRupees(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} crore`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, '')} lakh`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}

const axisLabel = (v: number) => (v >= 1e7 ? `${+(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${+(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L` : `${Math.round(v / 1000)}k`);

/**
 * The growth picture: what you put in (teal) and what it becomes (coral), year by year. Touch, hover or the arrow keys
 * read off any year; the Table view has the same numbers for anyone who prefers rows, and for screen readers. Drawn
 * as plain SVG, with the theme's own colours, so it follows light and dark mode and adds no library.
 */
export function GrowthChart({
  rows,
  start,
  investedLabel,
  earnedLabel,
  summary,
}: {
  rows: YearRow[];
  /** What the money is at year 0: nothing for a SIP or RD, the deposit for an FD. */
  start: { invested: number; balance: number };
  investedLabel: string;
  earnedLabel: string;
  /** One sentence for screen readers, e.g. "…grows from ₹6,00,000 put in to ₹11,61,695". */
  summary: string;
}) {
  const [view, setView] = useState<'graph' | 'table'>('graph');
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId();
  const years = rows.length;
  const pts = [{ year: 0, invested: start.invested, balance: start.balance, interest: 0 }, ...rows];
  const max = Math.max(...pts.map((p) => p.balance), 1) * 1.05;
  const x = (k: number) => LEFT + ((W - LEFT - RIGHT) * k) / years;
  const y = (v: number) => H - BOTTOM - ((H - BOTTOM - TOP) * v) / max;
  const total = pts.map((p) => `${x(p.year)},${y(p.balance)}`).join(' ');
  const put = pts.map((p) => `${x(p.year)},${y(p.invested)}`).join(' ');
  const putReversed = [...pts].reverse().map((p) => `${x(p.year)},${y(p.invested)}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(years / 8));
  const sel = hover === null ? null : pts[Math.min(Math.max(hover, 1), years)];
  const last = pts[pts.length - 1];

  function move(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * W;
    setHover(Math.min(years, Math.max(1, Math.round(((px - LEFT) / (W - LEFT - RIGHT)) * years))));
  }

  return (
    <div data-testid="growth-chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          legend="View"
          hideLegend
          options={[
            { value: 'graph' as const, label: 'Graph' },
            { value: 'table' as const, label: 'Table' },
          ]}
          value={view}
          onChange={setView}
        />
        <p className="flex gap-4 text-xs text-muted">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-teal-500" aria-hidden="true" />
            {investedLabel}
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-coral-500" aria-hidden="true" />
            {earnedLabel}
          </span>
        </p>
      </div>

      {view === 'graph' ? (
        <div
          className="relative mt-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          tabIndex={0}
          role="group"
          aria-label="Growth chart. Use the left and right arrow keys to read each year."
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHover((h) => Math.min(years, (h ?? 0) + 1));
            else if (e.key === 'ArrowLeft') setHover((h) => Math.max(1, (h ?? years + 1) - 1));
            else if (e.key === 'Escape') setHover(null);
          }}
          onBlur={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-labelledby={`${uid}-t`} className="touch-pan-y select-none">
            <title id={`${uid}-t`}>{summary}</title>
            {[0, 1, 2, 3, 4].map((k) => {
              const v = (max * k) / 4;
              return (
                <g key={k}>
                  <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.12" />
                  <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.6">
                    {axisLabel(v)}
                  </text>
                </g>
              );
            })}
            {Array.from({ length: Math.floor(years / labelStep) + 1 }, (_, i) => i * labelStep).map((k) => (
              <text key={k} x={x(k)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                {k}
              </text>
            ))}
            <polygon points={`${total} ${putReversed}`} fill="var(--color-coral-500)" fillOpacity="0.16" />
            <polygon points={`${put} ${x(years)},${y(0)} ${x(0)},${y(0)}`} fill="var(--color-teal-500)" fillOpacity="0.16" />
            <polyline points={put} fill="none" stroke="var(--color-teal-500)" strokeWidth="2" strokeLinejoin="round" />
            <polyline points={total} fill="none" stroke="var(--color-coral-500)" strokeWidth="2" strokeLinejoin="round" />
            <circle cx={x(last.year)} cy={y(last.balance)} r="5" fill="var(--color-coral-500)" stroke="var(--color-surface)" strokeWidth="2" />
            {sel && (
              <>
                <line x1={x(sel.year)} x2={x(sel.year)} y1={TOP} y2={H - BOTTOM} stroke="currentColor" strokeOpacity="0.35" />
                <circle cx={x(sel.year)} cy={y(sel.balance)} r="4.5" fill="var(--color-coral-500)" stroke="var(--color-surface)" strokeWidth="2" />
                <circle cx={x(sel.year)} cy={y(sel.invested)} r="4.5" fill="var(--color-teal-500)" stroke="var(--color-surface)" strokeWidth="2" />
              </>
            )}
            <rect
              x={LEFT}
              y={TOP}
              width={W - LEFT - RIGHT}
              height={H - BOTTOM - TOP}
              fill="transparent"
              onPointerMove={(e) => move(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect())}
              onPointerDown={(e) => move(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect())}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
            />
          </svg>
          {sel && (
            <div
              role="status"
              data-testid="chart-tip"
              className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-hair bg-surface px-3 py-1.5 text-xs text-ink"
              style={{ left: `${Math.min(80, Math.max(20, (x(sel.year) / W) * 100))}%` }}
            >
              <span className="font-semibold">Year {sel.year}</span>
              <br />
              {investedLabel}: {formatRupees(sel.invested)}
              <br />
              Value: {formatRupees(sel.balance)}
            </div>
          )}
          <p className="mt-1 text-center text-[11px] text-muted">Years on the bottom; tap or hover the chart to read a year.</p>
        </div>
      ) : (
        <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-hair px-3" data-testid="year-table">
          <table className="w-full min-w-[22rem] text-sm">
            <caption className="sr-only">Balance at the end of each year</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="sticky top-0 bg-surface py-2 pr-3 font-semibold">Year</th>
                <th scope="col" className="sticky top-0 bg-surface py-2 pr-3 text-right font-semibold">{investedLabel}</th>
                <th scope="col" className="sticky top-0 bg-surface py-2 pr-3 text-right font-semibold">{earnedLabel}</th>
                <th scope="col" className="sticky top-0 bg-surface py-2 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-t border-hair">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold text-ink">{r.year}</th>
                  <td className="py-2 pr-3 text-right text-strong">{formatRupees(r.invested)}</td>
                  <td className="py-2 pr-3 text-right text-strong">{formatRupees(r.interest)}</td>
                  <td className="py-2 text-right font-semibold text-ink">{formatRupees(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
