'use client';

import { useState } from 'react';
import { Answer, CARD, Row } from './everyday-calculators';
import { GrowthChart, shortRupees } from './growth-chart';
import { SliderField } from './slider-field';
import { Chips } from '../choice';
import { ModeToggle, Nudges, ResultActions, TaxField, TodayMoneyField, useSharedValues, type CalcMode, type Nudge } from './result-extras';
import {
  afterTax,
  COMPOUNDING_LABELS,
  compound,
  goalCompound,
  goalRd,
  goalSip,
  INTEREST_LIMITS,
  rd,
  realValue,
  simpleInterest,
  sip,
  type Compounding,
} from '@/app/lib/calc/interest';
import { writeShare } from '@/app/lib/calc/share-state';
import { formatNumber, formatRupees, parseAmount } from '@/app/lib/calc/everyday';

/** A whole number from a box: blank is 0, anything else that isn't a whole number is NaN. */
function count(text: string): number {
  const t = text.trim();
  if (t === '') return 0;
  return /^\d{1,4}$/.test(t) ? Number(t) : Number.NaN;
}

const LIMIT_TEXT = `up to ₹100 crore, up to ${INTEREST_LIMITS.maxYears} years`;
const fmt = (n: number) => n.toLocaleString('en-IN');
const GOAL_SLIDER = { min: 100000, max: 50000000, step: 100000, minLabel: '₹1 lakh', maxLabel: '₹5 crore' } as const;

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

/** "Worth about ₹X in today's money", shown when the switch is on. */
function TodayLine({ on, value, months, inflation }: { on: boolean; value: number | null; months: number; inflation: number }) {
  if (!on || value === null) return null;
  const real = realValue(value, inflation, months / 12);
  if (real === null) return null;
  return (
    <p className="-mt-3 text-sm text-strong" data-testid="today-money">
      Worth about <span className="font-semibold text-ink">{shortRupees(real)}</span> in today&apos;s money, if prices rise {formatNumber(inflation)}% a year.
    </p>
  );
}

/** A "what if" line when `better` differs from `base` by at least a rupee. */
function nudge(text: (diff: string) => string, base: number | null, better: number | null, apply: () => void): Nudge[] {
  if (base === null || better === null) return [];
  const d = Math.abs(better - base);
  return d >= 1 ? [{ text: text(shortRupees(d)), apply }] : [];
}

/**
 * The page frame for a slider calculator: the inputs on the left, the answer and the picture on the right, stacked on a
 * phone. On a phone the answer also rides along at the top of the inputs while you drag, so you never lose it.
 */
function Frame({ inputs, results, stickyLabel, stickyValue }: { inputs: React.ReactNode; results: React.ReactNode; stickyLabel: string; stickyValue: string | null }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className={`space-y-5 ${CARD}`} data-print-hide>
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

/** Years and months sliders. */
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
  const [mode, setMode] = useState<CalcMode>('value');
  const [amount, setAmount] = useState('5,000');
  const [goal, setGoal] = useState('1,00,00,000');
  const [rate, setRate] = useState('12');
  const [years, setYears] = useState('10');
  const [stepUp, setStepUp] = useState('0');
  const [todayOn, setTodayOn] = useState(false);
  const [infl, setInfl] = useState('6');

  useSharedValues((v) => {
    if (v.g !== undefined) {
      setMode('goal');
      setGoal(fmt(v.g));
    }
    if (v.a !== undefined) setAmount(fmt(v.a));
    if (v.r !== undefined) setRate(String(v.r));
    if (v.y !== undefined) setYears(String(v.y));
    if (v.s !== undefined) setStepUp(String(v.s));
    if (v.i !== undefined) {
      setTodayOn(true);
      setInfl(String(v.i));
    }
  });

  const months = count(years) * 12;
  const step = stepUp.trim() === '' ? 0 : parseAmount(stepUp);
  const rateN = parseAmount(rate);
  const goalN = parseAmount(goal);
  const inflN = parseAmount(infl);
  const isGoal = mode === 'goal';
  const filled = (isGoal ? goal.trim() : amount.trim()) !== '' && rate.trim() !== '' && years.trim() !== '';
  const monthly = !filled ? null : isGoal ? goalSip(goalN, rateN, months, step) : parseAmount(amount);
  const r = monthly !== null && Number.isFinite(monthly) ? sip(monthly, rateN, months, step) : null;
  const label = yearsText(months) || '—';

  const summary =
    r && monthly !== null
      ? isGoal
        ? `To reach ${formatRupees(goalN)} in ${label} at ${formatNumber(rateN)}% a year${step > 0 ? `, raising the SIP ${formatNumber(step)}% every year` : ''}, invest ${formatRupees(monthly)} a month. (Assumed returns, not guaranteed.)`
        : `SIP of ${formatRupees(monthly)} a month for ${label} at ${formatNumber(rateN)}% a year${step > 0 ? `, raised ${formatNumber(step)}% every year` : ''}: you put in ${formatRupees(r.invested)}, estimated returns ${formatRupees(r.returns)}, estimated value ${formatRupees(r.value)}. (Assumed returns, not guaranteed.)`
      : undefined;

  const val = (a: number, rt: number, m: number) => sip(a, rt, m, step)?.value ?? null;
  const need = (rt: number, m: number) => goalSip(goalN, rt, m, step);
  const nudges: Nudge[] =
    !r || monthly === null
      ? []
      : isGoal
        ? [
            ...(count(years) < 40 ? nudge((d) => `Save for one more year → ${d} less a month`, monthly, need(rateN, months + 12), () => setYears(String(count(years) + 1))) : []),
            ...(rateN + 1 <= INTEREST_LIMITS.maxSipRate ? nudge((d) => `If it earns 1% more → ${d} less a month`, monthly, need(rateN + 1, months), () => setRate(String(rateN + 1))) : []),
          ]
        : [
            ...(monthly + 500 <= 100000 ? nudge((d) => `Add ₹500 a month → ${d} more`, r.value, val(monthly + 500, rateN, months), () => setAmount(fmt(monthly + 500))) : []),
            ...(count(years) < 40 ? nudge((d) => `Stay one more year → ${d} more`, r.value, val(monthly, rateN, months + 12), () => setYears(String(count(years) + 1))) : []),
            ...(step < 10 ? nudge((d) => `Raise the SIP 10% each year → ${d} more`, r.value, sip(monthly, rateN, months, 10)?.value ?? null, () => setStepUp('10')) : []),
          ];

  const query = writeShare({ [isGoal ? 'g' : 'a']: isGoal ? goalN : (monthly ?? undefined), r: rateN, y: count(years), s: step || undefined, i: todayOn ? inflN : undefined });
  const headline = isGoal ? 'Invest every month' : `Estimated value after ${label}`;

  return (
    <Frame
      stickyLabel={isGoal ? 'Invest every month' : `Value after ${label}`}
      stickyValue={r && monthly !== null ? shortRupees(isGoal ? monthly : r.value) : null}
      inputs={
        <>
          <ModeToggle mode={mode} onChange={setMode} />
          {isGoal ? (
            <SliderField id="sip-goal" label="Amount you want" value={goal} onChange={setGoal} {...GOAL_SLIDER} prefix="₹" group />
          ) : (
            <SliderField id="sip-amount" label="Monthly investment" value={amount} onChange={setAmount} min={500} max={100000} step={500} prefix="₹" minLabel="₹500" maxLabel="₹1,00,000" group />
          )}
          <SliderField id="sip-rate" label="Expected return (yearly)" value={rate} onChange={setRate} min={1} max={30} step={0.5} suffix="%" minLabel="1%" maxLabel="30%" />
          <SliderField id="sip-years" label={isGoal ? 'Years to get there' : 'Time period'} value={years} onChange={setYears} min={1} max={40} step={1} suffix="yrs" minLabel="1 year" maxLabel="40 years" />
          <SliderField id="sip-step" label="Yearly step-up (optional)" value={stepUp} onChange={setStepUp} min={0} max={25} step={1} suffix="%" minLabel="None" maxLabel="25%" />
          <TodayMoneyField id="sip" on={todayOn} onToggle={setTodayOn} rate={infl} onRate={setInfl} />
          {filled && !r && (
            <Problem>
              Check the numbers: {isGoal ? 'the amount you want' : 'monthly amount'} {LIMIT_TEXT}, whole years, return 0–{INTEREST_LIMITS.maxSipRate}%, step-up 0–{INTEREST_LIMITS.maxStepUp}%.
            </Problem>
          )}
        </>
      }
      results={
        <>
          <Answer label={headline} value={r && monthly !== null ? formatRupees(isGoal ? monthly : r.value) : null} copy={summary} />
          {r && monthly !== null && (
            <p className="-mt-3 text-sm text-muted" data-testid="short-amount">
              {isGoal ? `To reach ${shortRupees(goalN)} in ${label}` : `About ${shortRupees(r.value)}`}
            </p>
          )}
          {r && monthly !== null && (
            <>
              <TodayLine on={todayOn} value={r.value} months={r.months} inflation={inflN} />
              <dl>
                {isGoal && <Row label="Estimated value" value={formatRupees(r.value)} />}
                <Row label="You put in" value={formatRupees(r.invested)} />
                <Row label="Estimated returns" value={formatRupees(r.returns)} />
              </dl>
              <Split invested={r.invested} earned={r.returns} earnedLabel="Estimated returns" />
              <GrowthChart
                rows={r.yearly}
                start={{ invested: 0, balance: 0 }}
                investedLabel="You put in"
                earnedLabel="Returns"
                inflation={todayOn ? inflN : undefined}
                summary={`SIP growth: ${formatRupees(r.invested)} put in over ${yearsText(r.months)} grows to an estimated ${formatRupees(r.value)}.`}
              />
              <Nudges items={nudges} />
              {summary && <ResultActions message={summary} query={query} path="/sip-calculator" />}
            </>
          )}
          <Note>
            Each month&apos;s amount goes in at the start of the month and earns one twelfth of the yearly return, so the answer is an estimate. Returns are assumed, not guaranteed:
            mutual fund investments are subject to market risk, and past performance doesn&apos;t promise the future.
          </Note>
          <p className="hidden print:block" data-testid="print-summary">
            {summary} kaamsolv.com/sip-calculator
          </p>
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
  const id = fd ? 'fd' : 'ci';
  const path = fd ? '/fd-calculator' : '/compound-interest-calculator';
  const choices = fd ? FREQUENCIES : ALL_FREQUENCIES;
  const [mode, setMode] = useState<CalcMode>('value');
  const [amount, setAmount] = useState('1,00,000');
  const [goal, setGoal] = useState('10,00,000');
  const [rate, setRate] = useState(fd ? '7' : '10');
  const [years, setYears] = useState(fd ? '1' : '3');
  const [monthsBox, setMonthsBox] = useState('0');
  const [freq, setFreq] = useState<Compounding>(fd ? 'quarterly' : 'yearly');
  const [tax, setTax] = useState(0);
  const [todayOn, setTodayOn] = useState(false);
  const [infl, setInfl] = useState('6');

  useSharedValues((v) => {
    if (v.g !== undefined) {
      setMode('goal');
      setGoal(fmt(v.g));
    }
    if (v.a !== undefined) setAmount(fmt(v.a));
    if (v.r !== undefined) setRate(String(v.r));
    if (v.y !== undefined) setYears(String(v.y));
    if (v.m !== undefined) setMonthsBox(String(v.m));
    if (v.f !== undefined && ALL_FREQUENCIES[v.f] && choices.includes(ALL_FREQUENCIES[v.f])) setFreq(ALL_FREQUENCIES[v.f]);
    if (fd && v.t !== undefined) setTax(v.t);
    if (v.i !== undefined) {
      setTodayOn(true);
      setInfl(String(v.i));
    }
  });

  const months = count(years) * 12 + count(monthsBox);
  const rateN = parseAmount(rate);
  const goalN = parseAmount(goal);
  const inflN = parseAmount(infl);
  const isGoal = mode === 'goal';
  const filled = (isGoal ? goal.trim() : amount.trim()) !== '' && rate.trim() !== '' && (years.trim() !== '' || monthsBox.trim() !== '');
  const deposit = !filled ? null : isGoal ? goalCompound(goalN, rateN, months, freq) : parseAmount(amount);
  const r = deposit !== null && Number.isFinite(deposit) ? compound(deposit, rateN, months, freq) : null;
  const taxed = r && fd && tax > 0 ? afterTax(r.principal, r.interest, tax) : null;
  const label = yearsText(months) || '—';
  const name = fd ? 'FD' : 'Compound interest';

  const summary = r
    ? isGoal
      ? `To reach ${formatRupees(goalN)} in ${label} at ${formatNumber(rateN)}% a year with ${COMPOUNDING_LABELS[freq].toLowerCase()} compounding, ${fd ? 'deposit' : 'start with'} ${formatRupees(r.principal)} today.`
      : `${name} on ${formatRupees(r.principal)} at ${formatNumber(rateN)}% a year for ${label}, ${COMPOUNDING_LABELS[freq].toLowerCase()} compounding: interest ${formatRupees(r.interest)}, total ${formatRupees(r.maturity)}.${taxed ? ` After ${tax}% tax on the interest: ${formatRupees(taxed.afterTaxTotal)}.` : ''}`
    : undefined;

  const val = (a: number, rt: number, m: number) => compound(a, rt, m, freq)?.maturity ?? null;
  const need = (rt: number, m: number) => goalCompound(goalN, rt, m, freq);
  const nudges: Nudge[] =
    !r || deposit === null
      ? []
      : isGoal
        ? [
            ...(count(years) < 30 ? nudge((d) => `Wait one more year → ${d} less to put in`, deposit, need(rateN, months + 12), () => setYears(String(count(years) + 1))) : []),
            ...(rateN + 1 <= INTEREST_LIMITS.maxRate ? nudge((d) => `At 1% more interest → ${d} less to put in`, deposit, need(rateN + 1, months), () => setRate(String(rateN + 1))) : []),
          ]
        : [
            ...(count(years) < 30 ? nudge((d) => `Keep it one more year → ${d} more`, r.maturity, val(deposit, rateN, months + 12), () => setYears(String(count(years) + 1))) : []),
            ...(rateN + 1 <= INTEREST_LIMITS.maxRate ? nudge((d) => `At 1% more interest → ${d} more`, r.maturity, val(deposit, rateN + 1, months), () => setRate(String(rateN + 1))) : []),
            ...(deposit + 10000 <= 5000000 ? nudge((d) => `Add ₹10,000 to the amount → ${d} more`, r.maturity, val(deposit + 10000, rateN, months), () => setAmount(fmt(deposit + 10000))) : []),
          ];

  const query = writeShare({
    [isGoal ? 'g' : 'a']: isGoal ? goalN : (deposit ?? undefined),
    r: rateN,
    y: count(years),
    m: count(monthsBox) || undefined,
    f: ALL_FREQUENCIES.indexOf(freq),
    t: fd && tax ? tax : undefined,
    i: todayOn ? inflN : undefined,
  });
  const headline = isGoal ? (fd ? 'Deposit today' : 'Start with') : fd ? 'Maturity amount' : 'Total after the period';

  return (
    <Frame
      stickyLabel={headline}
      stickyValue={r ? shortRupees(isGoal ? r.principal : r.maturity) : null}
      inputs={
        <>
          <ModeToggle mode={mode} onChange={setMode} />
          {isGoal ? (
            <SliderField id={`${id}-goal`} label="Amount you want" value={goal} onChange={setGoal} {...GOAL_SLIDER} prefix="₹" group />
          ) : (
            <SliderField id={`${id}-amount`} label={fd ? 'Deposit amount' : 'Amount you start with'} value={amount} onChange={setAmount} min={10000} max={5000000} step={10000} prefix="₹" minLabel="₹10,000" maxLabel="₹50,00,000" group />
          )}
          <SliderField id={`${id}-rate`} label="Interest rate (yearly)" value={rate} onChange={setRate} min={1} max={fd ? 12 : 25} step={fd ? 0.1 : 0.5} suffix="%" minLabel="1%" maxLabel={fd ? '12%' : '25%'} />
          <Tenure idPrefix={id} years={years} months={monthsBox} setYears={setYears} setMonths={setMonthsBox} label={isGoal ? 'Time to get there' : fd ? 'Deposit period' : 'Time period'} />
          <Chips legend="Interest is added" options={choices.map((f) => ({ value: f, label: COMPOUNDING_LABELS[f] }))} value={freq} onChange={setFreq} />
          {fd && <TaxField tax={tax} onChange={setTax} />}
          <TodayMoneyField id={id} on={todayOn} onToggle={setTodayOn} rate={infl} onRate={setInfl} />
          {filled && !r && (
            <Problem>
              Check the numbers: {isGoal ? 'the amount you want' : 'amount'} {LIMIT_TEXT}, rate 0–{INTEREST_LIMITS.maxRate}% a year, and at least one month.
            </Problem>
          )}
        </>
      }
      results={
        <>
          <Answer label={headline} value={r ? formatRupees(isGoal ? r.principal : r.maturity) : null} copy={summary} />
          {r && (
            <p className="-mt-3 text-sm text-muted" data-testid="short-amount">
              {isGoal ? `To reach ${shortRupees(goalN)} in ${label}` : `About ${shortRupees(r.maturity)}`}
            </p>
          )}
          {r && (
            <>
              <TodayLine on={todayOn} value={r.maturity} months={r.months} inflation={inflN} />
              <dl>
                {isGoal ? <Row label="Amount you get" value={formatRupees(r.maturity)} /> : <Row label={fd ? 'Amount deposited' : 'Amount you started with'} value={formatRupees(r.principal)} />}
                <Row label="Interest earned" value={formatRupees(r.interest)} />
                {taxed && <Row label={`Tax at ${tax}% (estimate)`} value={formatRupees(taxed.tax)} />}
                {taxed && <Row label="You keep after tax" value={formatRupees(taxed.afterTaxTotal)} />}
              </dl>
              <Split invested={r.principal} earned={r.interest} earnedLabel="Interest" />
              <GrowthChart
                rows={r.yearly}
                start={{ invested: r.principal, balance: r.principal }}
                investedLabel={fd ? 'Deposited' : 'Started with'}
                earnedLabel="Interest"
                inflation={todayOn ? inflN : undefined}
                summary={`${name} growth: ${formatRupees(r.principal)} grows to ${formatRupees(r.maturity)} over ${yearsText(r.months)}.`}
              />
              <Nudges items={nudges} />
              {summary && <ResultActions message={summary} query={query} path={path} />}
            </>
          )}
          <Note>
            {fd
              ? 'Worked out as principal × (1 + rate ÷ times a year) ^ (times a year × years), the way most banks quote a cumulative FD. Quarterly is the usual choice. A bank may round or count days a little differently, so its figure can differ by a few rupees. Interest on an FD is taxable; the tax shown is a plain estimate at the rate you pick, and TDS is not worked out here.'
              : 'Worked out as principal × (1 + rate ÷ times a year) ^ (times a year × years). The more often interest is added, the more you earn, because interest starts earning interest sooner.'}
          </Note>
          <p className="hidden print:block" data-testid="print-summary">
            {summary} kaamsolv.com{path}
          </p>
        </>
      }
    />
  );
}

export const FdCalculator = () => <GrowthCalculator kind="fd" />;
export const CompoundInterestCalculator = () => <GrowthCalculator kind="compound" />;

// ──────────────────────────────────────────────────────────────────────── RD

export function RdCalculator() {
  const [mode, setMode] = useState<CalcMode>('value');
  const [amount, setAmount] = useState('5,000');
  const [goal, setGoal] = useState('5,00,000');
  const [rate, setRate] = useState('6.5');
  const [years, setYears] = useState('5');
  const [monthsBox, setMonthsBox] = useState('0');
  const [tax, setTax] = useState(0);
  const [todayOn, setTodayOn] = useState(false);
  const [infl, setInfl] = useState('6');

  useSharedValues((v) => {
    if (v.g !== undefined) {
      setMode('goal');
      setGoal(fmt(v.g));
    }
    if (v.a !== undefined) setAmount(fmt(v.a));
    if (v.r !== undefined) setRate(String(v.r));
    if (v.y !== undefined) setYears(String(v.y));
    if (v.m !== undefined) setMonthsBox(String(v.m));
    if (v.t !== undefined) setTax(v.t);
    if (v.i !== undefined) {
      setTodayOn(true);
      setInfl(String(v.i));
    }
  });

  const months = count(years) * 12 + count(monthsBox);
  const rateN = parseAmount(rate);
  const goalN = parseAmount(goal);
  const inflN = parseAmount(infl);
  const isGoal = mode === 'goal';
  const filled = (isGoal ? goal.trim() : amount.trim()) !== '' && rate.trim() !== '' && (years.trim() !== '' || monthsBox.trim() !== '');
  const monthly = !filled ? null : isGoal ? goalRd(goalN, rateN, months) : parseAmount(amount);
  const r = monthly !== null && Number.isFinite(monthly) ? rd(monthly, rateN, months) : null;
  const taxed = r && tax > 0 ? afterTax(r.invested, r.interest, tax) : null;
  const label = yearsText(months) || '—';

  const summary =
    r && monthly !== null
      ? isGoal
        ? `To reach ${formatRupees(goalN)} in ${label} with an RD at ${formatNumber(rateN)}% a year, deposit ${formatRupees(monthly)} a month.`
        : `RD of ${formatRupees(monthly)} a month at ${formatNumber(rateN)}% a year for ${label}: you deposit ${formatRupees(r.invested)}, interest ${formatRupees(r.interest)}, maturity ${formatRupees(r.maturity)}.${taxed ? ` After ${tax}% tax on the interest: ${formatRupees(taxed.afterTaxTotal)}.` : ''}`
      : undefined;

  const val = (a: number, rt: number, m: number) => rd(a, rt, m)?.maturity ?? null;
  const need = (rt: number, m: number) => goalRd(goalN, rt, m);
  const nudges: Nudge[] =
    !r || monthly === null
      ? []
      : isGoal
        ? [
            ...(count(years) < 30 ? nudge((d) => `Save for one more year → ${d} less a month`, monthly, need(rateN, months + 12), () => setYears(String(count(years) + 1))) : []),
            ...(rateN + 1 <= INTEREST_LIMITS.maxRate ? nudge((d) => `At 1% more interest → ${d} less a month`, monthly, need(rateN + 1, months), () => setRate(String(rateN + 1))) : []),
          ]
        : [
            ...(monthly + 500 <= 100000 ? nudge((d) => `Add ₹500 a month → ${d} more`, r.maturity, val(monthly + 500, rateN, months), () => setAmount(fmt(monthly + 500))) : []),
            ...(count(years) < 30 ? nudge((d) => `Keep it one more year → ${d} more`, r.maturity, val(monthly, rateN, months + 12), () => setYears(String(count(years) + 1))) : []),
            ...(rateN + 1 <= INTEREST_LIMITS.maxRate ? nudge((d) => `At 1% more interest → ${d} more`, r.maturity, val(monthly, rateN + 1, months), () => setRate(String(rateN + 1))) : []),
          ];

  const query = writeShare({ [isGoal ? 'g' : 'a']: isGoal ? goalN : (monthly ?? undefined), r: rateN, y: count(years), m: count(monthsBox) || undefined, t: tax || undefined, i: todayOn ? inflN : undefined });
  const headline = isGoal ? 'Deposit every month' : 'Maturity amount';

  return (
    <Frame
      stickyLabel={headline}
      stickyValue={r && monthly !== null ? shortRupees(isGoal ? monthly : r.maturity) : null}
      inputs={
        <>
          <ModeToggle mode={mode} onChange={setMode} />
          {isGoal ? (
            <SliderField id="rd-goal" label="Amount you want" value={goal} onChange={setGoal} {...GOAL_SLIDER} prefix="₹" group />
          ) : (
            <SliderField id="rd-amount" label="Monthly deposit" value={amount} onChange={setAmount} min={500} max={100000} step={500} prefix="₹" minLabel="₹500" maxLabel="₹1,00,000" group />
          )}
          <SliderField id="rd-rate" label="Interest rate (yearly)" value={rate} onChange={setRate} min={1} max={12} step={0.1} suffix="%" minLabel="1%" maxLabel="12%" />
          <Tenure idPrefix="rd" years={years} months={monthsBox} setYears={setYears} setMonths={setMonthsBox} label={isGoal ? 'Time to get there' : 'Deposit period'} />
          <TaxField tax={tax} onChange={setTax} />
          <TodayMoneyField id="rd" on={todayOn} onToggle={setTodayOn} rate={infl} onRate={setInfl} />
          {filled && !r && (
            <Problem>
              Check the numbers: {isGoal ? 'the amount you want' : 'monthly deposit'} {LIMIT_TEXT}, rate 0–{INTEREST_LIMITS.maxRate}% a year, and at least one month.
            </Problem>
          )}
        </>
      }
      results={
        <>
          <Answer label={headline} value={r && monthly !== null ? formatRupees(isGoal ? monthly : r.maturity) : null} copy={summary} />
          {r && monthly !== null && (
            <p className="-mt-3 text-sm text-muted" data-testid="short-amount">
              {isGoal ? `To reach ${shortRupees(goalN)} in ${label}` : `About ${shortRupees(r.maturity)}`}
            </p>
          )}
          {r && monthly !== null && (
            <>
              <TodayLine on={todayOn} value={r.maturity} months={r.months} inflation={inflN} />
              <dl>
                {isGoal && <Row label="Amount you get" value={formatRupees(r.maturity)} />}
                <Row label="Total you deposit" value={formatRupees(r.invested)} />
                <Row label="Interest earned" value={formatRupees(r.interest)} />
                {taxed && <Row label={`Tax at ${tax}% (estimate)`} value={formatRupees(taxed.tax)} />}
                {taxed && <Row label="You keep after tax" value={formatRupees(taxed.afterTaxTotal)} />}
              </dl>
              <Split invested={r.invested} earned={r.interest} earnedLabel="Interest" />
              <GrowthChart
                rows={r.yearly}
                start={{ invested: 0, balance: 0 }}
                investedLabel="Deposited"
                earnedLabel="Interest"
                inflation={todayOn ? inflN : undefined}
                summary={`RD growth: ${formatRupees(r.invested)} deposited over ${yearsText(r.months)} matures to ${formatRupees(r.maturity)}.`}
              />
              <Nudges items={nudges} />
              {summary && <ResultActions message={summary} query={query} path="/rd-calculator" />}
            </>
          )}
          <Note>
            Indian banks add interest to a recurring deposit every quarter. Each monthly deposit earns for the months it stays in, at the quarterly rate. A bank may round or count days
            a little differently, so its figure can differ by a few rupees. Interest on an RD is taxable; the tax shown is a plain estimate at the rate you pick, and TDS is not worked out here.
          </Note>
          <p className="hidden print:block" data-testid="print-summary">
            {summary} kaamsolv.com/rd-calculator
          </p>
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

  useSharedValues((v) => {
    if (v.a !== undefined) setAmount(fmt(v.a));
    if (v.r !== undefined) setRate(String(v.r));
    if (v.y !== undefined) setYears(String(v.y));
    if (v.m !== undefined) setMonthsBox(String(v.m));
    if (v.d !== undefined) setDays(String(v.d));
  });

  const filled = amount.trim() !== '' && rate.trim() !== '' && (years.trim() !== '' || monthsBox.trim() !== '' || days.trim() !== '');
  const amountN = parseAmount(amount);
  const rateN = parseAmount(rate);
  const r = filled ? simpleInterest(amountN, rateN, count(years), count(monthsBox), count(days)) : null;
  const period = [count(years) ? `${count(years)}y` : '', count(monthsBox) ? `${count(monthsBox)}m` : '', count(days) ? `${count(days)}d` : ''].filter(Boolean).join(' ');

  const summary = r ? `Simple interest on ${formatRupees(r.principal)} at ${formatNumber(rateN)}% a year for ${period}: interest ${formatRupees(r.interest)}, total ${formatRupees(r.total)}.` : undefined;

  const nudges: Nudge[] = !r
    ? []
    : [
        ...(count(years) < 30 ? nudge((d) => `One more year → ${d} more interest`, r.interest, simpleInterest(amountN, rateN, count(years) + 1, count(monthsBox), count(days))?.interest ?? null, () => setYears(String(count(years) + 1))) : []),
        ...(rateN + 1 <= INTEREST_LIMITS.maxRate ? nudge((d) => `At 1% more → ${d} more interest`, r.interest, simpleInterest(amountN, rateN + 1, count(years), count(monthsBox), count(days))?.interest ?? null, () => setRate(String(rateN + 1))) : []),
      ];

  const query = writeShare({ a: amountN, r: rateN, y: count(years) || undefined, m: count(monthsBox) || undefined, d: count(days) || undefined });

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
              <Nudges items={nudges} />
              {summary && <ResultActions message={summary} query={query} path="/simple-interest-calculator" />}
            </>
          )}
          <Note>Interest = principal × rate × time ÷ 100, with time in years: months count as a twelfth of a year and days as 1/365. Interest is never added back, so it grows in a straight line.</Note>
          <p className="hidden print:block" data-testid="print-summary">
            {summary} kaamsolv.com/simple-interest-calculator
          </p>
        </>
      }
    />
  );
}
