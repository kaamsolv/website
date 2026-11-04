'use client';

import { useId, useState } from 'react';
import { Answer, CARD, Row } from './everyday-calculators';
import { shortRupees } from './growth-chart';
import { ResultActions, useSharedValues } from './result-extras';
import { SliderField } from './slider-field';
import { Segmented } from '../choice';
import { compound, rd, sip, type YearRow } from '@/app/lib/calc/interest';
import { writeShare } from '@/app/lib/calc/share-state';
import { formatNumber, formatRupees, parseAmount } from '@/app/lib/calc/everyday';

type Mode = 'monthly' | 'lump';
export type Series = { name: string; colorVar: string; dash?: string; rows: YearRow[]; start: number; invested: number; value: number };

const W = 560;
const H = 230;
const LEFT = 52;
const RIGHT = 10;
const TOP = 10;
const BOTTOM = 26;
const fmt = (n: number) => n.toLocaleString('en-IN');

/** Two lines on one picture, plus the same numbers as a table. Colour is never the only cue: each line is named and one is dashed. */
export function CompareChart({ a, b, title }: { a: Series; b: Series; title?: string }) {
  const [view, setView] = useState<'graph' | 'table'>('graph');
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId();
  const years = a.rows.length;
  const max = Math.max(...a.rows.map((r) => r.balance), ...b.rows.map((r) => r.balance), 1) * 1.05;
  const x = (k: number) => LEFT + ((W - LEFT - RIGHT) * k) / years;
  const y = (v: number) => H - BOTTOM - ((H - BOTTOM - TOP) * v) / max;
  const line = (s: Series) => [{ year: 0, balance: s.start }, ...s.rows].map((p) => `${x(p.year)},${y(p.balance)}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(years / 8));
  const sel = hover === null ? null : Math.min(Math.max(hover, 1), years);

  function move(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * W;
    setHover(Math.min(years, Math.max(1, Math.round(((px - LEFT) / (W - LEFT - RIGHT)) * years))));
  }
  const legend = (s: Series) => (
    <span>
      <span className="mr-1 inline-block h-0 w-4 border-t-2 align-middle" style={{ borderColor: `var(${s.colorVar})`, borderStyle: s.dash ? 'dashed' : 'solid' }} aria-hidden="true" />
      {s.name}
    </span>
  );

  return (
    <div data-testid="compare-chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented legend="View" hideLegend options={[{ value: 'graph' as const, label: 'Graph' }, { value: 'table' as const, label: 'Table' }]} value={view} onChange={setView} />
        <p className="flex flex-wrap gap-x-4 text-xs text-muted">
          {legend(a)}
          {legend(b)}
        </p>
      </div>
      {view === 'graph' ? (
        <div
          className="relative mt-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          tabIndex={0}
          role="group"
          aria-label="Comparison chart. Use the left and right arrow keys to read each year."
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHover((h) => Math.min(years, (h ?? 0) + 1));
            else if (e.key === 'ArrowLeft') setHover((h) => Math.max(1, (h ?? years + 1) - 1));
            else if (e.key === 'Escape') setHover(null);
          }}
          onBlur={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-labelledby={`${uid}-t`} className="touch-pan-y select-none">
            <title id={`${uid}-t`}>{title ?? `${a.name} reaches ${formatRupees(a.value)} and ${b.name} reaches ${formatRupees(b.value)} after ${years} years.`}</title>
            {[0, 1, 2, 3, 4].map((k) => {
              const v = (max * k) / 4;
              return (
                <g key={k}>
                  <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.12" />
                  <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.6">
                    {v >= 1e7 ? `${+(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${+(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L` : `${Math.round(v / 1000)}k`}
                  </text>
                </g>
              );
            })}
            {Array.from({ length: Math.floor(years / labelStep) + 1 }, (_, i) => i * labelStep).map((k) => (
              <text key={k} x={x(k)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                {k}
              </text>
            ))}
            {[a, b].map((s) => (
              <polyline key={s.name} points={line(s)} fill="none" stroke={`var(${s.colorVar})`} strokeWidth="2.5" strokeDasharray={s.dash} strokeLinejoin="round" />
            ))}
            {sel !== null && (
              <>
                <line x1={x(sel)} x2={x(sel)} y1={TOP} y2={H - BOTTOM} stroke="currentColor" strokeOpacity="0.35" />
                {[a, b].map((s) => (
                  <circle key={s.name} cx={x(sel)} cy={y(s.rows[sel - 1].balance)} r="4.5" fill={`var(${s.colorVar})`} stroke="var(--color-surface)" strokeWidth="2" />
                ))}
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
          {sel !== null && (
            <div
              role="status"
              data-testid="chart-tip"
              className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-hair bg-surface px-3 py-1.5 text-xs text-ink"
              style={{ left: `${Math.min(80, Math.max(20, (x(sel) / W) * 100))}%` }}
            >
              <span className="font-semibold">Year {sel}</span>
              <br />
              {a.name}: {formatRupees(a.rows[sel - 1].balance)}
              <br />
              {b.name}: {formatRupees(b.rows[sel - 1].balance)}
            </div>
          )}
          <p className="mt-1 text-center text-[11px] text-muted">Years on the bottom; tap or hover the chart to read a year.</p>
        </div>
      ) : (
        <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-hair px-3" data-testid="year-table">
          <table className="w-full min-w-[19rem] text-sm">
            <caption className="sr-only">Value at the end of each year</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="sticky top-0 bg-surface py-2 pr-3 font-semibold">Year</th>
                <th scope="col" className="sticky top-0 bg-surface py-2 pr-3 text-right font-semibold">{a.name}</th>
                <th scope="col" className="sticky top-0 bg-surface py-2 text-right font-semibold">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r, i) => (
                <tr key={r.year} className="border-t border-hair">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold text-ink">{r.year}</th>
                  <td className="py-2 pr-3 text-right text-strong">{formatRupees(r.balance)}</td>
                  <td className="py-2 text-right text-strong">{formatRupees(b.rows[i].balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CompareCalculator() {
  const [mode, setMode] = useState<Mode>('monthly');
  const [amount, setAmount] = useState('10,000');
  const [years, setYears] = useState('10');
  const [rateA, setRateA] = useState('12');
  const [rateB, setRateB] = useState('6.5');

  useSharedValues((v) => {
    if (v.f === 1) {
      setMode('lump');
      setRateB('7');
    }
    if (v.a !== undefined) setAmount(fmt(v.a));
    if (v.y !== undefined) setYears(String(v.y));
    if (v.r !== undefined) setRateA(String(v.r));
    if (v.t !== undefined) setRateB(String(v.t));
  });

  function pickMode(m: Mode) {
    setMode(m);
    setAmount(m === 'monthly' ? '10,000' : '1,00,000');
    setRateB(m === 'monthly' ? '6.5' : '7');
  }

  const lump = mode === 'lump';
  const yearsN = /^\d{1,2}$/.test(years.trim()) ? Number(years) : Number.NaN;
  const months = yearsN * 12;
  const amountN = parseAmount(amount);
  const a = parseAmount(rateA);
  const b = parseAmount(rateB);
  const filled = amount.trim() !== '' && years.trim() !== '' && rateA.trim() !== '' && rateB.trim() !== '';

  let first: Series | null = null;
  let second: Series | null = null;
  if (filled) {
    if (lump) {
      const f = compound(amountN, b, months, 'quarterly');
      const g = compound(amountN, a, months, 'yearly');
      if (f && g) {
        first = { name: 'Market-linked (assumed)', colorVar: '--color-coral-500', rows: g.yearly, start: g.principal, invested: g.principal, value: g.maturity };
        second = { name: 'Fixed deposit', colorVar: '--color-teal-500', dash: '6 4', rows: f.yearly, start: f.principal, invested: f.principal, value: f.maturity };
      }
    } else {
      const s = sip(amountN, a, months);
      const r = rd(amountN, b, months);
      if (s && r) {
        first = { name: 'SIP (assumed)', colorVar: '--color-coral-500', rows: s.yearly, start: 0, invested: s.invested, value: s.value };
        second = { name: 'Recurring deposit', colorVar: '--color-teal-500', dash: '6 4', rows: r.yearly, start: 0, invested: r.invested, value: r.maturity };
      }
    }
  }

  const hi = first && second ? (first.value >= second.value ? first : second) : null;
  const lo = first && second && hi ? (hi === first ? second : first) : null;
  const gap = hi && lo ? hi.value - lo.value : 0;
  const verdict =
    hi && lo
      ? `After ${yearsN} years, ${hi.name} ends ${shortRupees(gap)} ahead of ${lo.name}. The ${lump ? 'market-linked' : 'SIP'} figure is an assumed return, not a promise, and it can turn out lower, or even a loss. A deposit rate is fixed by the bank when you open it.`
      : null;
  const unit = lump ? 'one-time amount' : 'a month';
  const summary =
    first && second
      ? `${formatRupees(amountN)} ${unit} for ${yearsN} years: ${first.name} at ${formatNumber(a)}% → ${formatRupees(first.value)}; ${second.name} at ${formatNumber(b)}% → ${formatRupees(second.value)}. (Assumed returns are not guaranteed.)`
      : undefined;
  const query = writeShare({ a: amountN, y: yearsN, r: a, t: b, f: lump ? 1 : 0 });

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className={`min-w-0 space-y-5 ${CARD}`} data-print-hide>
        <Segmented
          legend="How are you saving?"
          hideLegend
          options={[
            { value: 'monthly' as const, label: 'Every month' },
            { value: 'lump' as const, label: 'One lump sum' },
          ]}
          value={mode}
          onChange={pickMode}
        />
        {lump ? (
          <SliderField id="cmp-amount" label="Amount you put in" value={amount} onChange={setAmount} min={10000} max={5000000} step={10000} prefix="₹" minLabel="₹10,000" maxLabel="₹50,00,000" group info="What you save: every month in Every month mode, or once in One lump sum mode." />
        ) : (
          <SliderField id="cmp-amount" label="Amount every month" value={amount} onChange={setAmount} min={500} max={100000} step={500} prefix="₹" minLabel="₹500" maxLabel="₹1,00,000" group info="What you save: every month in Every month mode, or once in One lump sum mode." />
        )}
        <SliderField id="cmp-years" label="Time period" value={years} onChange={setYears} min={1} max={30} step={1} suffix="yrs" minLabel="1 year" maxLabel="30 years" info="How long you keep saving. Both options are compared over the same time." />
        <SliderField id="cmp-rate-a" label={lump ? 'Market-linked return (assumed)' : 'SIP return (assumed)'} value={rateA} onChange={setRateA} min={1} max={30} step={0.5} suffix="%" minLabel="1%" maxLabel="30%" info="The yearly growth you assume for a market-linked investment such as an equity mutual fund. It is a guess, not a promise: the market can give less, or even a loss." />
        <SliderField id="cmp-rate-b" label={lump ? 'Fixed deposit rate' : 'Recurring deposit rate'} value={rateB} onChange={setRateB} min={1} max={12} step={0.1} suffix="%" minLabel="1%" maxLabel="12%" info="The yearly interest a bank offers on a fixed or recurring deposit. It is fixed when you open the deposit, so this part is not a guess." />
        {filled && !first && (
          <p role="status" className="text-sm font-medium text-danger-700" data-testid="calc-error">
            Check the numbers: amount up to ₹100 crore, whole years up to 30, market-linked return 0–25%, deposit rate 0–25%.
          </p>
        )}
      </div>
      <div className={`min-w-0 space-y-5 ${CARD}`}>
        <Answer label={hi ? `${hi.name} ends higher by` : 'Difference'} value={first && second ? formatRupees(gap) : null} copy={summary} />
        {first && second && (
          <>
            <div className="grid gap-3 sm:grid-cols-2" data-testid="compare-cards">
              {[first, second].map((s) => (
                <div key={s.name} className="rounded-xl border border-hair p-4">
                  <p className="text-sm font-semibold text-ink">
                    <span className="mr-2 inline-block h-0 w-4 border-t-2 align-middle" style={{ borderColor: `var(${s.colorVar})`, borderStyle: s.dash ? 'dashed' : 'solid' }} aria-hidden="true" />
                    {s.name}
                  </p>
                  <p className="mt-1 font-display text-xl font-extrabold text-ink">{formatRupees(s.value)}</p>
                  <dl className="mt-1">
                    <Row label="You put in" value={formatRupees(s.invested)} />
                    <Row label="Growth" value={formatRupees(s.value - s.invested)} />
                  </dl>
                </div>
              ))}
            </div>
            {verdict && (
              <p className="text-sm text-strong" data-testid="verdict">
                {verdict}
              </p>
            )}
            <CompareChart a={first} b={second} />
            {summary && <ResultActions message={summary} query={query} path="/sip-vs-fd-vs-rd-calculator" />}
          </>
        )}
        <p className="text-xs leading-relaxed text-muted">
          The SIP puts money in at the start of each month and earns one twelfth of the yearly return. Recurring and fixed deposits add interest every quarter. A bank may round differently, and tax is not worked out.
          This compares numbers; it is not advice to buy anything.
        </p>
        <p className="hidden print:block" data-testid="print-summary">
          {summary} kaamsolv.com/sip-vs-fd-vs-rd-calculator
        </p>
      </div>
    </div>
  );
}
