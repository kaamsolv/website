'use client';

import { useState } from 'react';
import { Answer, CARD, Row } from './everyday-calculators';
import { GrowthChart, shortRupees } from './growth-chart';
import { SliderField } from './slider-field';
import { Chips } from '../choice';
import {
  COMPOUNDING_LABELS,
  compound,
  INTEREST_LIMITS,
  rd,
  simpleInterest,
  sip,
  type Compounding,
} from '@/app/lib/calc/interest';
import { formatNumber, formatRupees, parseAmount } from '@/app/lib/calc/everyday';

/** A whole number from a box: blank is 0, anything else that isn't a whole number is NaN. */
function count(text: string): number {
  const t = text.trim();
  if (t === '') return 0;
  return /^\d{1,4}$/.test(t) ? Number(t) : Number.NaN;
}

const LIMIT_TEXT = `up to ₹100 crore, up to ${INTEREST_LIMITS.maxYears} years`;

/** Invested vs earned, as a bar plus a legend (colour is never the only cue: the numbers sit beside it). */
function Split({ invested, earned, earnedLabel }: { invested: number; earned: number; earnedLabel: string }) {
  const total = invested + earned;
  const investedShare = total > 0 ? Math.round((invested / total) * 100) : 100;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-teal-500" style={{ width: `${investedShare}%` }} />
        <div className="bg-coral-500" style={{ width: `${100 - investedShare}%` }} />
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
          Money you put in {investedShare}%
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-coral-500" aria-hidden="true" />
          {earnedLabel} {100 - investedShare}%
        </span>
      </p>
    </div>
  );
}

const Problem = ({ children }: { children: React.ReactNode }) => (
  <p role="status" className="text-sm font-medium text-danger-700" data-testid="calc-error">
    {children}
  </p>
);

const Note = ({ children }: { children: React.ReactNode }) => <p className="text-xs leading-relaxed text-muted">{children}</p>;

const yearsText = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} ${y === 1 ? 'year' : 'years'}` : '', m ? `${m} ${m === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(' ');
};

/**
 * The page frame for a slider calculator: the inputs on the left, the answer and the picture on the right, stacked on a
 * phone. On a phone the answer also rides along at the top of the inputs while you drag, so you never lose it.
 */
function Frame({ inputs, results, stickyLabel, stickyValue }: { inputs: React.ReactNode; results: React.ReactNode; stickyLabel: string; stickyValue: string | null }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className={`space-y-5 ${CARD}`}>
        <div className="sticky top-16 z-10 -mx-5 -mt-5 mb-1 flex items-baseline justify-between gap-3 rounded-t-xl2 border-b border-hair bg-surface px-5 py-2.5 sm:-mx-6 sm:-mt-6 sm:px-6 lg:hidden" aria-hidden="true">
          <span className="text-xs text-muted">{stickyLabel}</span>
          <span className="font-display text-lg font-extrabold text-ink">{stickyValue ?? '—'}</span>
        </div>
        {inputs}
      </div>
      <div className={`space-y-5 ${CARD}`}>{results}</div>
    </div>
  );
}

/** Years and months sliders side by side. */
function Tenure({ idPrefix, years, months, setYears, setMonths, maxYears = 30, label = 'Time period' }: { idPrefix: string; years: string; months: string; setYears: (v: string) => void; setMonths: (v: string) => void; maxYears?: number; label?: string }) {
  return (
    <fieldset className="space-y-5">
      <legend className="sr-only">{label}</legend>
      <SliderField id={`${idPrefix}-years`} label={`${label}: years`} value={years} onChange={setYears} min={0} max={maxYears} step={1} suffix="yrs" minLabel="0" maxLabel={`${maxYears} years`} />
      <SliderField id={`${idPrefix}-months`} label={`${label}: months`} value={months} onChange={setMonths} min={0} max={11} step={1} suffix="mo" minLabel="0" maxLabel="11 months" />
    </fieldset>
  );
}

// ──────────────────────────────────────────────────────────────────────── SIP

export function SipCalculator() {
  const [amount, setAmount] = useState('5,000');
  const [rate, setRate] = useState('12');
  const [years, setYears] = useState('10');
  const [stepUp, setStepUp] = useState('0');

  const months = count(years) * 12;
  const step = stepUp.trim() === '' ? 0 : parseAmount(stepUp);
  const filled = amount.trim() !== '' && rate.trim() !== '' && years.trim() !== '';
  const r = filled ? sip(parseAmount(amount), parseAmount(rate), months, step) : null;
  const rateN = parseAmount(rate);

  const summary = r
    ? `SIP of ${formatRupees(parseAmount(amount))} a month for ${yearsText(months)} at ${formatNumber(rateN)}% a year${step > 0 ? `, raised ${formatNumber(step)}% every year` : ''}: you put in ${formatRupees(r.invested)}, estimated returns ${formatRupees(r.returns)}, estimated value ${formatRupees(r.value)}. (Assumed returns, not guaranteed. kaamsolv.com/sip-calculator)`
    : undefined;

  return (
    <Frame
      stickyLabel={`Value after ${yearsText(months) || '—'}`}
      stickyValue={r ? shortRupees(r.value) : null}
      inputs={
        <>
          <SliderField id="sip-amount" label="Monthly investment" value={amount} onChange={setAmount} min={500} max={100000} step={500} prefix="₹" minLabel="₹500" maxLabel="₹1,00,000" group />
          <SliderField id="sip-rate" label="Expected return (yearly)" value={rate} onChange={setRate} min={1} max={30} step={0.5} suffix="%" minLabel="1%" maxLabel="30%" />
          <SliderField id="sip-years" label="Time period" value={years} onChange={setYears} min={1} max={40} step={1} suffix="yrs" minLabel="1 year" maxLabel="40 years" />
          <SliderField id="sip-step" label="Yearly step-up (optional)" value={stepUp} onChange={setStepUp} min={0} max={25} step={1} suffix="%" minLabel="None" maxLabel="25%" />
          {filled && !r && <Problem>Check the numbers: monthly amount {LIMIT_TEXT}, whole years, return 0–{INTEREST_LIMITS.maxSipRate}%, step-up 0–{INTEREST_LIMITS.maxStepUp}%.</Problem>}
        </>
      }
      results={
        <>
          <Answer label={`Estimated value after ${yearsText(months) || '—'}`} value={r ? formatRupees(r.value) : null} copy={summary} />
          {r && <p className="-mt-3 text-sm text-muted" data-testid="short-amount">About {shortRupees(r.value)}</p>}
          {r && (
            <>
              <dl>
                <Row label="You put in" value={formatRupees(r.invested)} />
                <Row label="Estimated returns" value={formatRupees(r.returns)} />
              </dl>
              <Split invested={r.invested} earned={r.returns} earnedLabel="Estimated returns" />
              <GrowthChart
                rows={r.yearly}
                start={{ invested: 0, balance: 0 }}
                investedLabel="You put in"
                earnedLabel="Returns"
                summary={`SIP growth: ${formatRupees(r.invested)} put in over ${yearsText(r.months)} grows to an estimated ${formatRupees(r.value)}.`}
              />
            </>
          )}
          <Note>
            Each month&apos;s amount goes in at the start of the month and earns one twelfth of the yearly return, so the answer is an estimate. Returns are assumed, not guaranteed:
            mutual fund investments are subject to market risk, and past performance doesn&apos;t promise the future.
          </Note>
        </>
      }
    />
  );
}

// ───────────────────────────────────────────────────────────── FD and compound

const FREQUENCIES: Compounding[] = ['monthly', 'quarterly', 'half-yearly', 'yearly'];
const ALL_FREQUENCIES: Compounding[] = ['daily', 'monthly', 'quarterly', 'half-yearly', 'yearly'];

function GrowthCalculator({ kind }: { kind: 'fd' | 'compound' }) {
  const fd = kind === 'fd';
  const [amount, setAmount] = useState(fd ? '1,00,000' : '1,00,000');
  const [rate, setRate] = useState(fd ? '7' : '10');
  const [years, setYears] = useState(fd ? '1' : '3');
  const [monthsBox, setMonthsBox] = useState('0');
  const [freq, setFreq] = useState<Compounding>(fd ? 'quarterly' : 'yearly');

  const months = count(years) * 12 + count(monthsBox);
  const filled = amount.trim() !== '' && rate.trim() !== '' && (years.trim() !== '' || monthsBox.trim() !== '');
  const r = filled ? compound(parseAmount(amount), parseAmount(rate), months, freq) : null;
  const rateN = parseAmount(rate);
  const id = fd ? 'fd' : 'ci';

  const summary = r
    ? `${fd ? 'FD' : 'Compound interest'} on ${formatRupees(r.principal)} at ${formatNumber(rateN)}% a year for ${yearsText(months)}, ${COMPOUNDING_LABELS[freq].toLowerCase()} compounding: interest ${formatRupees(r.interest)}, total ${formatRupees(r.maturity)}. (kaamsolv.com/${fd ? 'fd' : 'compound-interest'}-calculator)`
    : undefined;

  return (
    <Frame
      stickyLabel={fd ? 'Maturity amount' : 'Total after the period'}
      stickyValue={r ? shortRupees(r.maturity) : null}
      inputs={
        <>
          <SliderField id={`${id}-amount`} label={fd ? 'Deposit amount' : 'Amount you start with'} value={amount} onChange={setAmount} min={10000} max={5000000} step={10000} prefix="₹" minLabel="₹10,000" maxLabel="₹50,00,000" group />
          <SliderField id={`${id}-rate`} label="Interest rate (yearly)" value={rate} onChange={setRate} min={1} max={fd ? 12 : 25} step={fd ? 0.1 : 0.5} suffix="%" minLabel="1%" maxLabel={fd ? '12%' : '25%'} />
          <Tenure idPrefix={id} years={years} months={monthsBox} setYears={setYears} setMonths={setMonthsBox} label={fd ? 'Deposit period' : 'Time period'} />
          <Chips legend="Interest is added" options={(fd ? FREQUENCIES : ALL_FREQUENCIES).map((f) => ({ value: f, label: COMPOUNDING_LABELS[f] }))} value={freq} onChange={setFreq} />
          {filled && !r && <Problem>Check the numbers: amount {LIMIT_TEXT}, rate 0–{INTEREST_LIMITS.maxRate}% a year, and at least one month.</Problem>}
        </>
      }
      results={
        <>
          <Answer label={fd ? 'Maturity amount' : 'Total after the period'} value={r ? formatRupees(r.maturity) : null} copy={summary} />
          {r && <p className="-mt-3 text-sm text-muted" data-testid="short-amount">About {shortRupees(r.maturity)}</p>}
          {r && (
            <>
              <dl>
                <Row label={fd ? 'Amount deposited' : 'Amount you started with'} value={formatRupees(r.principal)} />
                <Row label="Interest earned" value={formatRupees(r.interest)} />
              </dl>
              <Split invested={r.principal} earned={r.interest} earnedLabel="Interest" />
              <GrowthChart
                rows={r.yearly}
                start={{ invested: r.principal, balance: r.principal }}
                investedLabel={fd ? 'Deposited' : 'Started with'}
                earnedLabel="Interest"
                summary={`${fd ? 'FD' : 'Compound interest'} growth: ${formatRupees(r.principal)} grows to ${formatRupees(r.maturity)} over ${yearsText(r.months)}.`}
              />
            </>
          )}
          <Note>
            {fd
              ? 'Worked out as principal × (1 + rate ÷ times a year) ^ (times a year × years), the way most banks quote a cumulative FD. Quarterly is the usual choice. A bank may round or count days a little differently, so its figure can differ by a few rupees. Interest on an FD is taxable, and any tax deducted at source is not worked out here.'
              : 'Worked out as principal × (1 + rate ÷ times a year) ^ (times a year × years). The more often interest is added, the more you earn, because interest starts earning interest sooner.'}
          </Note>
        </>
      }
    />
  );
}

export const FdCalculator = () => <GrowthCalculator kind="fd" />;
export const CompoundInterestCalculator = () => <GrowthCalculator kind="compound" />;

// ──────────────────────────────────────────────────────────────────────── RD

export function RdCalculator() {
  const [amount, setAmount] = useState('5,000');
  const [rate, setRate] = useState('6.5');
  const [years, setYears] = useState('5');
  const [monthsBox, setMonthsBox] = useState('0');

  const months = count(years) * 12 + count(monthsBox);
  const filled = amount.trim() !== '' && rate.trim() !== '' && (years.trim() !== '' || monthsBox.trim() !== '');
  const r = filled ? rd(parseAmount(amount), parseAmount(rate), months) : null;
  const rateN = parseAmount(rate);

  const summary = r
    ? `RD of ${formatRupees(parseAmount(amount))} a month at ${formatNumber(rateN)}% a year for ${yearsText(months)}: you deposit ${formatRupees(r.invested)}, interest ${formatRupees(r.interest)}, maturity ${formatRupees(r.maturity)}. (kaamsolv.com/rd-calculator)`
    : undefined;

  return (
    <Frame
      stickyLabel="Maturity amount"
      stickyValue={r ? shortRupees(r.maturity) : null}
      inputs={
        <>
          <SliderField id="rd-amount" label="Monthly deposit" value={amount} onChange={setAmount} min={500} max={100000} step={500} prefix="₹" minLabel="₹500" maxLabel="₹1,00,000" group />
          <SliderField id="rd-rate" label="Interest rate (yearly)" value={rate} onChange={setRate} min={1} max={12} step={0.1} suffix="%" minLabel="1%" maxLabel="12%" />
          <Tenure idPrefix="rd" years={years} months={monthsBox} setYears={setYears} setMonths={setMonthsBox} label="Deposit period" />
          {filled && !r && <Problem>Check the numbers: monthly deposit {LIMIT_TEXT}, rate 0–{INTEREST_LIMITS.maxRate}% a year, and at least one month.</Problem>}
        </>
      }
      results={
        <>
          <Answer label="Maturity amount" value={r ? formatRupees(r.maturity) : null} copy={summary} />
          {r && <p className="-mt-3 text-sm text-muted" data-testid="short-amount">About {shortRupees(r.maturity)}</p>}
          {r && (
            <>
              <dl>
                <Row label="Total you deposit" value={formatRupees(r.invested)} />
                <Row label="Interest earned" value={formatRupees(r.interest)} />
              </dl>
              <Split invested={r.invested} earned={r.interest} earnedLabel="Interest" />
              <GrowthChart
                rows={r.yearly}
                start={{ invested: 0, balance: 0 }}
                investedLabel="Deposited"
                earnedLabel="Interest"
                summary={`RD growth: ${formatRupees(r.invested)} deposited over ${yearsText(r.months)} matures to ${formatRupees(r.maturity)}.`}
              />
            </>
          )}
          <Note>
            Indian banks add interest to a recurring deposit every quarter. Each monthly deposit earns for the months it stays in, at the quarterly rate. A bank may round or count days
            a little differently, so its figure can differ by a few rupees. Interest on an RD is taxable, and any tax deducted at source is not worked out here.
          </Note>
        </>
      }
    />
  );
}

// ────────────────────────────────────────────────────────────── Simple interest

export function SimpleInterestCalculator() {
  const [amount, setAmount] = useState('50,000');
  const [rate, setRate] = useState('6');
  const [years, setYears] = useState('3');
  const [monthsBox, setMonthsBox] = useState('0');
  const [days, setDays] = useState('0');

  const filled = amount.trim() !== '' && rate.trim() !== '' && (years.trim() !== '' || monthsBox.trim() !== '' || days.trim() !== '');
  const r = filled ? simpleInterest(parseAmount(amount), parseAmount(rate), count(years), count(monthsBox), count(days)) : null;
  const rateN = parseAmount(rate);
  const period = [count(years) ? `${count(years)}y` : '', count(monthsBox) ? `${count(monthsBox)}m` : '', count(days) ? `${count(days)}d` : ''].filter(Boolean).join(' ');

  const summary = r
    ? `Simple interest on ${formatRupees(r.principal)} at ${formatNumber(rateN)}% a year for ${period}: interest ${formatRupees(r.interest)}, total ${formatRupees(r.total)}. (kaamsolv.com/simple-interest-calculator)`
    : undefined;

  return (
    <Frame
      stickyLabel="Simple interest"
      stickyValue={r ? shortRupees(r.interest) : null}
      inputs={
        <>
          <SliderField id="si-amount" label="Principal (amount)" value={amount} onChange={setAmount} min={10000} max={5000000} step={10000} prefix="₹" minLabel="₹10,000" maxLabel="₹50,00,000" group />
          <SliderField id="si-rate" label="Interest rate (yearly)" value={rate} onChange={setRate} min={1} max={25} step={0.5} suffix="%" minLabel="1%" maxLabel="25%" />
          <SliderField id="si-years" label="Time period: years" value={years} onChange={setYears} min={0} max={30} step={1} suffix="yrs" minLabel="0" maxLabel="30 years" />
          <SliderField id="si-months" label="Time period: months" value={monthsBox} onChange={setMonthsBox} min={0} max={11} step={1} suffix="mo" minLabel="0" maxLabel="11 months" />
          <SliderField id="si-days" label="Time period: days" value={days} onChange={setDays} min={0} max={30} step={1} suffix="days" minLabel="0" maxLabel="30 days" />
          {filled && !r && <Problem>Check the numbers: amount {LIMIT_TEXT}, rate 0–{INTEREST_LIMITS.maxRate}% a year, and a time period of at least a day, in whole numbers.</Problem>}
        </>
      }
      results={
        <>
          <Answer label="Simple interest" value={r ? formatRupees(r.interest) : null} copy={summary} />
          {r && (
            <>
              <dl>
                <Row label="Principal" value={formatRupees(r.principal)} />
                <Row label="Interest" value={formatRupees(r.interest)} />
                <Row label="Total amount" value={formatRupees(r.total)} />
              </dl>
              <Split invested={r.principal} earned={r.interest} earnedLabel="Interest" />
            </>
          )}
          <Note>Interest = principal × rate × time ÷ 100, with time in years: months count as a twelfth of a year and days as 1/365. Interest is never added back, so it grows in a straight line.</Note>
        </>
      }
    />
  );
}
